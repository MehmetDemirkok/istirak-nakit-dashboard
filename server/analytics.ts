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
  opts: { category?: string; lineKind?: string; periodType: string; periodIndex?: number },
): number {
  let sql = `SELECT COALESCE(SUM(amount),0) as s FROM cash_flow_lines WHERE company_id = ? AND period_type = ?`;
  const params: (string | number)[] = [companyId, opts.periodType];
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

function sumDetails(companyId: string, category: string, periodType: string, periodIndex?: number): number {
  // Prefer detail lines; fallback to total_* kind
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

export function getCompanyYear(companyId: string): number {
  const row = db
    .prepare(
      `SELECT year FROM import_jobs WHERE company_id = ? AND status = 'ok' ORDER BY created_at DESC LIMIT 1`,
    )
    .get(companyId) as { year: number } | undefined;
  return row?.year ?? new Date().getFullYear();
}

export function getKpis(companyId: string): DashboardKpis {
  const year = getCompanyYear(companyId);
  const inflow = sumDetails(companyId, 'A', 'year', 0);
  let outflow = 0;
  for (const cat of OUTFLOW_ORDER) {
    outflow += sumDetails(companyId, cat, 'year', 0);
  }

  const netRow = db
    .prepare(
      `SELECT amount FROM cash_flow_lines WHERE company_id = ? AND line_kind = 'net' AND period_type = 'year' LIMIT 1`,
    )
    .get(companyId) as { amount: number } | undefined;

  const balRow = db
    .prepare(
      `SELECT amount FROM cash_flow_lines
       WHERE company_id = ? AND line_kind = 'balance' AND period_type = 'week'
       ORDER BY period_index DESC LIMIT 1`,
    )
    .get(companyId) as { amount: number } | undefined;

  const balMonth = db
    .prepare(
      `SELECT amount FROM cash_flow_lines
       WHERE company_id = ? AND line_kind = 'balance' AND period_type = 'month'
       ORDER BY period_index DESC LIMIT 1`,
    )
    .get(companyId) as { amount: number } | undefined;

  return {
    totalInflow: inflow,
    totalOutflow: outflow,
    net: netRow?.amount ?? inflow - outflow,
    balance: balRow?.amount ?? balMonth?.amount ?? inflow - outflow,
    year,
  };
}

export function getCategoryTotals(companyId: string): CategoryTotal[] {
  const result: CategoryTotal[] = [];
  for (const key of OUTFLOW_ORDER) {
    const meta = CATEGORY_META[key];
    const yearly = sumDetails(companyId, key, 'year', 0);
    // latest week with data or average-ish: sum of week amounts / count — use last 1 week sum of details
    const weekMax = db
      .prepare(
        `SELECT MAX(period_index) as m FROM cash_flow_lines WHERE company_id = ? AND period_type = 'week' AND line_kind = 'detail' AND amount != 0`,
      )
      .get(companyId) as { m: number | null };
    const weekly = weekMax?.m != null ? sumDetails(companyId, key, 'week', weekMax.m) : yearly / 52;

    const monthMax = db
      .prepare(
        `SELECT MAX(period_index) as m FROM cash_flow_lines WHERE company_id = ? AND period_type = 'month' AND line_kind = 'detail' AND amount != 0`,
      )
      .get(companyId) as { m: number | null };
    const monthly = monthMax?.m != null ? sumDetails(companyId, key, 'month', monthMax.m) : yearly / 12;

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

export function getMonthlySeries(companyId: string) {
  return MONTH_LABELS.map((label, idx) => {
    const inflow = sumDetails(companyId, 'A', 'month', idx);
    let outflow = 0;
    for (const cat of OUTFLOW_ORDER) outflow += sumDetails(companyId, cat, 'month', idx);
    return { month: label, monthIndex: idx, inflow, outflow, net: inflow - outflow };
  });
}

export function getWeeklyBalanceSeries(companyId: string) {
  const rows = db
    .prepare(
      `SELECT period_index, period_label, amount FROM cash_flow_lines
       WHERE company_id = ? AND line_kind = 'balance' AND period_type = 'week'
       ORDER BY period_index`,
    )
    .all(companyId) as { period_index: number; period_label: string | null; amount: number }[];

  if (rows.length) {
    return rows.map((r) => ({
      week: r.period_label || `H${r.period_index}`,
      index: r.period_index,
      balance: r.amount,
    }));
  }

  // synthesize from weekly net cumulative
  const weeks = db
    .prepare(
      `SELECT DISTINCT period_index, period_label FROM cash_flow_lines
       WHERE company_id = ? AND period_type = 'week' ORDER BY period_index`,
    )
    .all(companyId) as { period_index: number; period_label: string | null }[];

  let running = 0;
  return weeks.map((w) => {
    const inflow = sumDetails(companyId, 'A', 'week', w.period_index);
    let outflow = 0;
    for (const cat of OUTFLOW_ORDER) outflow += sumDetails(companyId, cat, 'week', w.period_index);
    running += inflow - outflow;
    return {
      week: w.period_label || `H${w.period_index}`,
      index: w.period_index,
      balance: running,
    };
  });
}

export function getSubsidiaryComparison(parentId: string) {
  const subs = db
    .prepare(`SELECT id, name FROM companies WHERE parent_id = ? AND role = 'subsidiary' ORDER BY name`)
    .all(parentId) as { id: string; name: string }[];

  return subs.map((s) => {
    const kpis = getKpis(s.id);
    return {
      id: s.id,
      name: s.name,
      ...kpis,
    };
  });
}

export function getConsolidatedDashboard(parentId: string) {
  const comparison = getSubsidiaryComparison(parentId);
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
      inflow += sumDetails(s.id, 'A', 'month', idx);
      for (const cat of OUTFLOW_ORDER) outflow += sumDetails(s.id, cat, 'month', idx);
    }
    return { month: label, monthIndex: idx, inflow, outflow, net: inflow - outflow };
  });

  const categoryMap: Record<string, number> = {};
  for (const cat of OUTFLOW_ORDER) categoryMap[cat] = 0;
  for (const s of comparison) {
    for (const cat of OUTFLOW_ORDER) {
      categoryMap[cat] += sumDetails(s.id, cat, 'year', 0);
    }
  }

  const categories = OUTFLOW_ORDER.map((key) => ({
    key,
    label: CATEGORY_META[key].label,
    shortLabel: CATEGORY_META[key].shortLabel,
    yearly: categoryMap[key],
  }));

  return { comparison, totals, monthly, categories, year: new Date().getFullYear() };
}

export function companyHasData(companyId: string): boolean {
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM cash_flow_lines WHERE company_id = ?`)
    .get(companyId) as { c: number };
  return row.c > 0;
}
