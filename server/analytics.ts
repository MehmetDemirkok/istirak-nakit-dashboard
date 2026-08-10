import { db } from './db.js';
import { CATEGORY_META, MONTH_LABELS, OUTFLOW_ORDER } from './categories.js';

export interface DashboardKpis {
  totalInflow: number;
  totalOutflow: number;
  net: number;
  balance: number;
  year: number;
}

export interface CategoryTotal {
  key: string;
  label: string;
  shortLabel: string;
  weekly: number;
  monthly: number;
  yearly: number;
}

function sumAmount(
  companyId: string,
  year: number,
  opts: { category?: string; lineKind?: string; periodType: string; periodIndex?: number },
): number {
  let sql = `SELECT COALESCE(SUM(amount),0) as s FROM cash_flow_lines WHERE company_id = ? AND year = ? AND period_type = ?`;
  const params: (string | number)[] = [companyId, year, opts.periodType];
  if (opts.category) {
    sql += ` AND category = ?`;
    params.push(opts.category);
  }
  if (opts.lineKind) {
    sql += ` AND line_kind = ?`;
    params.push(opts.lineKind);
  }
  if (opts.periodIndex != null) {
    sql += ` AND period_index = ?`;
    params.push(opts.periodIndex);
  }
  const row = db.prepare(sql).get(...params) as { s: number };
  return row?.s ?? 0;
}

export function sumDetails(
  companyId: string,
  year: number,
  category: string,
  periodType: string,
  periodIndex?: number,
): number {
  let sql = `SELECT COALESCE(SUM(amount),0) as s FROM cash_flow_lines
    WHERE company_id = ? AND year = ? AND period_type = ? AND category = ? AND line_kind = 'detail'`;
  const params: (string | number)[] = [companyId, year, periodType, category];
  if (periodIndex != null) {
    sql += ` AND period_index = ?`;
    params.push(periodIndex);
  }
  const detail = (db.prepare(sql).get(...params) as { s: number }).s;
  if (detail !== 0) return detail;

  const totalKind = `total_${category}`;
  let sql2 = `SELECT COALESCE(SUM(amount),0) as s FROM cash_flow_lines
    WHERE company_id = ? AND year = ? AND period_type = ? AND line_kind = ?`;
  const params2: (string | number)[] = [companyId, year, periodType, totalKind];
  if (periodIndex != null) {
    sql2 += ` AND period_index = ?`;
    params2.push(periodIndex);
  }
  return (db.prepare(sql2).get(...params2) as { s: number }).s;
}

export function getCompanyYear(companyId: string): number {
  const fromLines = db
    .prepare(
      `SELECT year FROM cash_flow_lines WHERE company_id = ? ORDER BY year DESC LIMIT 1`,
    )
    .get(companyId) as { year: number } | undefined;
  if (fromLines?.year) return fromLines.year;

  const row = db
    .prepare(
      `SELECT year FROM import_jobs WHERE company_id = ? AND status = 'ok' ORDER BY created_at DESC LIMIT 1`,
    )
    .get(companyId) as { year: number } | undefined;
  return row?.year ?? new Date().getFullYear();
}

export function getCompanyYears(companyId: string): number[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT year FROM cash_flow_lines WHERE company_id = ? ORDER BY year DESC`,
    )
    .all(companyId) as { year: number }[];
  if (rows.length) return rows.map((r) => r.year);
  return [getCompanyYear(companyId)];
}

export function getKpis(companyId: string, year = getCompanyYear(companyId)): DashboardKpis {
  const inflow = sumDetails(companyId, year, 'A', 'year', 0);
  let outflow = 0;
  for (const cat of OUTFLOW_ORDER) {
    outflow += sumDetails(companyId, year, cat, 'year', 0);
  }

  const netRow = db
    .prepare(
      `SELECT amount FROM cash_flow_lines WHERE company_id = ? AND year = ? AND line_kind = 'net' AND period_type = 'year' LIMIT 1`,
    )
    .get(companyId, year) as { amount: number } | undefined;

  const balRow = db
    .prepare(
      `SELECT amount FROM cash_flow_lines
       WHERE company_id = ? AND year = ? AND line_kind = 'balance' AND period_type = 'week'
       ORDER BY period_index DESC LIMIT 1`,
    )
    .get(companyId, year) as { amount: number } | undefined;

  const balMonth = db
    .prepare(
      `SELECT amount FROM cash_flow_lines
       WHERE company_id = ? AND year = ? AND line_kind = 'balance' AND period_type = 'month'
       ORDER BY period_index DESC LIMIT 1`,
    )
    .get(companyId, year) as { amount: number } | undefined;

  return {
    totalInflow: inflow,
    totalOutflow: outflow,
    net: netRow?.amount ?? inflow - outflow,
    balance: balRow?.amount ?? balMonth?.amount ?? inflow - outflow,
    year,
  };
}

export function getCategoryTotals(companyId: string, year = getCompanyYear(companyId)): CategoryTotal[] {
  const result: CategoryTotal[] = [];
  for (const key of OUTFLOW_ORDER) {
    const meta = CATEGORY_META[key];
    const yearly = sumDetails(companyId, year, key, 'year', 0);
    const weekMax = db
      .prepare(
        `SELECT MAX(period_index) as m FROM cash_flow_lines WHERE company_id = ? AND year = ? AND period_type = 'week' AND line_kind = 'detail' AND amount != 0`,
      )
      .get(companyId, year) as { m: number | null };
    const weekly = weekMax?.m != null ? sumDetails(companyId, year, key, 'week', weekMax.m) : yearly / 52;

    const monthMax = db
      .prepare(
        `SELECT MAX(period_index) as m FROM cash_flow_lines WHERE company_id = ? AND year = ? AND period_type = 'month' AND line_kind = 'detail' AND amount != 0`,
      )
      .get(companyId, year) as { m: number | null };
    const monthly = monthMax?.m != null ? sumDetails(companyId, year, key, 'month', monthMax.m) : yearly / 12;

    result.push({
      key,
      label: meta.label,
      shortLabel: meta.shortLabel,
      weekly,
      monthly,
      yearly,
    });
  }
  return result;
}

export function getMonthlySeries(companyId: string, year = getCompanyYear(companyId)) {
  return MONTH_LABELS.map((label, idx) => {
    const inflow = sumDetails(companyId, year, 'A', 'month', idx);
    let outflow = 0;
    for (const cat of OUTFLOW_ORDER) outflow += sumDetails(companyId, year, cat, 'month', idx);
    return { month: label, monthIndex: idx, inflow, outflow, net: inflow - outflow };
  });
}

export function getWeeklyBalanceSeries(companyId: string, year = getCompanyYear(companyId)) {
  const rows = db
    .prepare(
      `SELECT period_index, period_label, amount FROM cash_flow_lines
       WHERE company_id = ? AND year = ? AND line_kind = 'balance' AND period_type = 'week'
       ORDER BY period_index`,
    )
    .all(companyId, year) as { period_index: number; period_label: string | null; amount: number }[];

  if (rows.length) {
    return rows.map((r) => ({
      week: r.period_label || `H${r.period_index}`,
      index: r.period_index,
      balance: r.amount,
    }));
  }

  const weeks = db
    .prepare(
      `SELECT DISTINCT period_index, period_label FROM cash_flow_lines
       WHERE company_id = ? AND year = ? AND period_type = 'week' ORDER BY period_index`,
    )
    .all(companyId, year) as { period_index: number; period_label: string | null }[];

  let running = 0;
  return weeks.map((w) => {
    const inflow = sumDetails(companyId, year, 'A', 'week', w.period_index);
    let outflow = 0;
    for (const cat of OUTFLOW_ORDER) outflow += sumDetails(companyId, year, cat, 'week', w.period_index);
    running += inflow - outflow;
    return {
      week: w.period_label || `H${w.period_index}`,
      index: w.period_index,
      balance: running,
    };
  });
}

export function getSubsidiaryComparison(parentId: string, year?: number) {
  const subs = db
    .prepare(`SELECT id, name FROM companies WHERE parent_id = ? AND role = 'subsidiary' ORDER BY name`)
    .all(parentId) as { id: string; name: string }[];

  return subs.map((s) => {
    const y = year ?? getCompanyYear(s.id);
    const kpis = getKpis(s.id, y);
    return {
      id: s.id,
      name: s.name,
      ...kpis,
    };
  });
}

export function getConsolidatedDashboard(parentId: string, year = new Date().getFullYear()) {
  const comparison = getSubsidiaryComparison(parentId, year);
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
    for (const s of comparison) {
      inflow += sumDetails(s.id, year, 'A', 'month', idx);
      for (const cat of OUTFLOW_ORDER) outflow += sumDetails(s.id, year, cat, 'month', idx);
    }
    return { month: label, monthIndex: idx, inflow, outflow, net: inflow - outflow };
  });

  const categoryMap: Record<string, number> = {};
  for (const cat of OUTFLOW_ORDER) categoryMap[cat] = 0;
  for (const s of comparison) {
    for (const cat of OUTFLOW_ORDER) {
      categoryMap[cat] += sumDetails(s.id, year, cat, 'year', 0);
    }
  }

  const categories = OUTFLOW_ORDER.map((key) => ({
    key,
    label: CATEGORY_META[key].label,
    shortLabel: CATEGORY_META[key].shortLabel,
    yearly: categoryMap[key],
  }));

  return { comparison, totals, monthly, categories, year };
}

export function companyHasData(companyId: string, year?: number): boolean {
  if (year != null) {
    const row = db
      .prepare(`SELECT COUNT(*) as c FROM cash_flow_lines WHERE company_id = ? AND year = ?`)
      .get(companyId, year) as { c: number };
    return row.c > 0;
  }
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM cash_flow_lines WHERE company_id = ?`)
    .get(companyId) as { c: number };
  return row.c > 0;
}

// silence unused in case older callers
void sumAmount;
