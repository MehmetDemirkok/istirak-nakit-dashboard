import { db } from './db.js';
import { CATEGORY_META, MONTH_LABELS, OUTFLOW_ORDER } from './categories.js';
import { getCompanyYear, getMonthlySeries, getWeeklyBalanceSeries } from './analytics.js';

export type PeriodFilter = {
  year: number;
  /** 0-11 for month, null = full year */
  month: number | null;
};

export function parsePeriodQuery(query: {
  year?: string;
  month?: string;
}, companyId: string): PeriodFilter {
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

function sumDetails(companyId: string, category: string, periodType: string, periodIndex?: number): number {
  let sql = `SELECT COALESCE(SUM(amount),0) as s FROM cash_flow_lines
    WHERE company_id = ? AND period_type = ? AND category = ? AND line_kind = 'detail'`;
  const params: (string | number)[] = [companyId, periodType, category];
  if (periodIndex != null) {
    sql += ` AND period_index = ?`;
    params.push(periodIndex);
  }
  const detail = (db.prepare(sql).get(...params) as { s: number }).s;
  if (detail !== 0) return detail;

  const totalKind = `total_${category}`;
  let sql2 = `SELECT COALESCE(SUM(amount),0) as s FROM cash_flow_lines
    WHERE company_id = ? AND period_type = ? AND line_kind = ?`;
  const params2: (string | number)[] = [companyId, periodType, totalKind];
  if (periodIndex != null) {
    sql2 += ` AND period_index = ?`;
    params2.push(periodIndex);
  }
  return (db.prepare(sql2).get(...params2) as { s: number }).s;
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
  }[];
  monthly: { month: string; monthIndex: number; inflow: number; outflow: number; net: number }[];
  weekly: { week: string; index: number; balance: number }[];
}

export function getPeriodReport(companyId: string, filter: PeriodFilter): PeriodReport {
  const monthlyAll = getMonthlySeries(companyId);
  const weeklyAll = getWeeklyBalanceSeries(companyId);

  const yearlyInflow = sumDetails(companyId, 'A', 'year', 0);
  let yearlyOutflow = 0;
  for (const cat of OUTFLOW_ORDER) yearlyOutflow += sumDetails(companyId, cat, 'year', 0);

  const monthIdx = filter.month;
  const monthInflow =
    monthIdx == null ? yearlyInflow : sumDetails(companyId, 'A', 'month', monthIdx);
  let monthOutflow = 0;
  if (monthIdx == null) monthOutflow = yearlyOutflow;
  else for (const cat of OUTFLOW_ORDER) monthOutflow += sumDetails(companyId, cat, 'month', monthIdx);

  const balance =
    monthIdx == null
      ? weeklyAll[weeklyAll.length - 1]?.balance ?? monthInflow - monthOutflow
      : (() => {
          const weeksInMonth = weeklyAll.filter((w) => {
            // approximate by week index bands (~4.3 weeks/month)
            const approxMonth = Math.min(11, Math.floor((w.index - 1) / 4.345));
            return approxMonth === monthIdx;
          });
          return weeksInMonth[weeksInMonth.length - 1]?.balance ?? monthInflow - monthOutflow;
        })();

  const categories = OUTFLOW_ORDER.map((key) => {
    const yearly = sumDetails(companyId, key, 'year', 0);
    const monthly =
      monthIdx == null ? yearly / 12 : sumDetails(companyId, key, 'month', monthIdx);
    const weekly = monthly / 4.345;
    return {
      key,
      label: CATEGORY_META[key].label,
      shortLabel: CATEGORY_META[key].shortLabel,
      weekly,
      monthly,
      yearly,
    };
  });

  const weekly =
    monthIdx == null
      ? weeklyAll.slice(0, 26)
      : weeklyAll.filter((w) => Math.min(11, Math.floor((w.index - 1) / 4.345)) === monthIdx);

  return {
    companyId,
    filter,
    label: periodLabel(filter),
    kpis: {
      totalInflow: monthInflow,
      totalOutflow: monthOutflow,
      net: monthInflow - monthOutflow,
      balance,
      year: filter.year,
    },
    categories,
    monthly: monthlyAll,
    weekly: weekly.length ? weekly : weeklyAll.slice(0, 8),
  };
}
