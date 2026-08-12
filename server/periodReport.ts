import { db } from './db.js';
import { CATEGORY_META, MONTH_LABELS, OUTFLOW_ORDER } from './categories.js';
import {
  getCompanyYear,
  getMonthlySeries,
  getTopDetailLine,
  getWeeklyBalanceSeries,
  sumDetails,
} from './analytics.js';
import { weekIndexToMonth } from './periodUtils.js';

export type PeriodFilter = {
  year: number;
  /** 0-11 for month, null = full year */
  month: number | null;
};

export function parsePeriodQuery(
  query: {
    year?: string;
    month?: string;
  },
  companyId: string,
): PeriodFilter {
  const defaultYear = getCompanyYear(companyId);
  const year = Number(query.year) || defaultYear;
  if (query.month == null || query.month === '' || query.month === 'all' || query.month === 'yil') {
    return { year, month: null };
  }
  const m = Number(query.month);
  if (Number.isNaN(m) || m < 0 || m > 11) return { year, month: null };
  return { year, month: m };
}

export function periodLabel(filter: PeriodFilter): string {
  if (filter.month == null) return `${filter.year} Yıllık`;
  return `${MONTH_LABELS[filter.month]} ${filter.year}`;
}

function weekFlow(companyId: string, year: number, weekIndex: number) {
  const inflow = sumDetails(companyId, year, 'A', 'week', weekIndex);
  let outflow = 0;
  for (const cat of OUTFLOW_ORDER) outflow += sumDetails(companyId, year, cat, 'week', weekIndex);
  return { inflow, outflow, net: inflow - outflow };
}

export interface PeriodReport {
  companyId: string;
  filter: PeriodFilter;
  label: string;
  kpis: {
    totalInflow: number;
    totalOutflow: number;
    net: number;
    balance: number;
    year: number;
  };
  categories: {
    key: string;
    label: string;
    shortLabel: string;
    weekly: number;
    monthly: number;
    yearly: number;
    period: number;
  }[];
  monthly: {
    month: string;
    monthIndex: number;
    inflow: number;
    outflow: number;
    net: number;
    selected: boolean;
  }[];
  weekly: {
    week: string;
    index: number;
    balance: number;
    inflow: number;
    outflow: number;
    net: number;
  }[];
  highlights: {
    topInflow: { label: string; amount: number } | null;
    topOutflow: { label: string; amount: number; key?: string; pct?: number } | null;
  };
}

export function getPeriodReport(companyId: string, filter: PeriodFilter): PeriodReport {
  const year = filter.year;
  const monthlyAll = getMonthlySeries(companyId, year);
  const weeklyAll = getWeeklyBalanceSeries(companyId, year);

  const yearlyInflow = sumDetails(companyId, year, 'A', 'year', 0);
  let yearlyOutflow = 0;
  for (const cat of OUTFLOW_ORDER) yearlyOutflow += sumDetails(companyId, year, cat, 'year', 0);

  const monthIdx = filter.month;
  const monthInflow =
    monthIdx == null ? yearlyInflow : sumDetails(companyId, year, 'A', 'month', monthIdx);
  let monthOutflow = 0;
  if (monthIdx == null) monthOutflow = yearlyOutflow;
  else for (const cat of OUTFLOW_ORDER) monthOutflow += sumDetails(companyId, year, cat, 'month', monthIdx);

  const weeksInScope =
    monthIdx == null
      ? weeklyAll
      : weeklyAll.filter((w) => weekIndexToMonth(w.index) === monthIdx);

  const balance =
    weeksInScope[weeksInScope.length - 1]?.balance ??
    weeklyAll[weeklyAll.length - 1]?.balance ??
    monthInflow - monthOutflow;

  const categories = OUTFLOW_ORDER.map((key) => {
    const yearly = sumDetails(companyId, year, key, 'year', 0);
    const monthly =
      monthIdx == null ? yearly / 12 : sumDetails(companyId, year, key, 'month', monthIdx);
    const weekly = monthly / 4.345;
    const period = monthIdx == null ? yearly : monthly;
    return {
      key,
      label: CATEGORY_META[key].label,
      shortLabel: CATEGORY_META[key].shortLabel,
      weekly,
      monthly,
      yearly,
      period,
    };
  });

  const monthly = monthlyAll.map((m) => ({
    ...m,
    selected: monthIdx == null ? true : m.monthIndex === monthIdx,
  }));

  const weekRows =
    monthIdx == null ? weeklyAll.slice(0, 26) : weeksInScope.length ? weeksInScope : [];

  const weekly = weekRows.map((w) => {
    const flow = weekFlow(companyId, year, w.index);
    return {
      week: w.week,
      index: w.index,
      balance: w.balance,
      inflow: flow.inflow,
      outflow: flow.outflow,
      net: flow.net,
    };
  });

  const detailPeriod =
    monthIdx == null
      ? { periodType: 'year', periodIndex: 0 }
      : { periodType: 'month', periodIndex: monthIdx };

  let topInflow = getTopDetailLine(companyId, year, {
    categories: ['A'],
    ...detailPeriod,
  });

  // Weekly-only sheets: fall back to largest A detail across weeks in scope
  if (!topInflow && monthIdx != null) {
    const weekIndexes = weeksInScope.map((w) => w.index);
    if (weekIndexes.length) {
      const placeholders = weekIndexes.map(() => '?').join(',');
      const row = db
        .prepare(
          `SELECT label, COALESCE(SUM(amount), 0) as amount
           FROM cash_flow_lines
           WHERE company_id = ? AND year = ? AND period_type = 'week'
             AND line_kind = 'detail' AND category = 'A'
             AND period_index IN (${placeholders})
           GROUP BY label HAVING ABS(amount) > 0
           ORDER BY ABS(amount) DESC LIMIT 1`,
        )
        .get(companyId, year, ...weekIndexes) as { label: string; amount: number } | undefined;
      if (row?.label) topInflow = { label: row.label, amount: row.amount };
    }
  }
  if (!topInflow && monthIdx == null) {
    topInflow = getTopDetailLine(companyId, year, {
      categories: ['A'],
      periodType: 'week',
    });
  }
  const topOutflowCat = [...categories].sort((a, b) => b.period - a.period)[0];
  const topOutflow =
    topOutflowCat && topOutflowCat.period > 0
      ? {
          label: topOutflowCat.shortLabel,
          amount: topOutflowCat.period,
          key: topOutflowCat.key,
          pct: monthOutflow > 0 ? (topOutflowCat.period / monthOutflow) * 100 : 0,
        }
      : null;

  return {
    companyId,
    filter,
    label: periodLabel(filter),
    kpis: {
      totalInflow: monthInflow,
      totalOutflow: monthOutflow,
      net: monthInflow - monthOutflow,
      balance,
      year,
    },
    categories,
    monthly,
    weekly,
    highlights: { topInflow, topOutflow },
  };
}

export function getConsolidatedPeriodDashboard(parentId: string, filter: PeriodFilter) {
  const subs = db
    .prepare(`SELECT id, name FROM companies WHERE parent_id = ? AND role = 'subsidiary' ORDER BY name`)
    .all(parentId) as { id: string; name: string }[];

  const comparison = subs.map((s) => {
    const r = getPeriodReport(s.id, filter);
    return {
      id: s.id,
      name: s.name,
      totalInflow: r.kpis.totalInflow,
      totalOutflow: r.kpis.totalOutflow,
      net: r.kpis.net,
      balance: r.kpis.balance,
    };
  });

  const totals = comparison.reduce(
    (acc, c) => {
      acc.totalInflow += c.totalInflow;
      acc.totalOutflow += c.totalOutflow;
      acc.net += c.net;
      acc.balance += c.balance;
      return acc;
    },
    { totalInflow: 0, totalOutflow: 0, net: 0, balance: 0 },
  );

  const monthly = MONTH_LABELS.map((label, idx) => {
    let inflow = 0;
    let outflow = 0;
    for (const s of subs) {
      const row = getMonthlySeries(s.id, filter.year)[idx];
      if (row) {
        inflow += row.inflow;
        outflow += row.outflow;
      }
    }
    return {
      month: label,
      monthIndex: idx,
      inflow,
      outflow,
      net: inflow - outflow,
      selected: filter.month == null ? true : filter.month === idx,
    };
  });

  const categoryMap: Record<string, number> = {};
  for (const cat of OUTFLOW_ORDER) categoryMap[cat] = 0;
  for (const s of subs) {
    const r = getPeriodReport(s.id, filter);
    for (const c of r.categories) categoryMap[c.key] += c.period;
  }

  const categories = OUTFLOW_ORDER.map((key) => ({
    key,
    label: CATEGORY_META[key].label,
    shortLabel: CATEGORY_META[key].shortLabel,
    yearly: categoryMap[key],
    period: categoryMap[key],
    weekly: categoryMap[key] / 52,
    monthly: filter.month == null ? categoryMap[key] / 12 : categoryMap[key],
  }));

  return {
    comparison,
    totals,
    monthly,
    categories,
    year: filter.year,
    periodLabel: periodLabel(filter),
    filter,
  };
}
