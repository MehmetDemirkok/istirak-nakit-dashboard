export type CompanyRole = 'parent' | 'subsidiary';

export interface Company {
  id: string;
  name: string;
  role: CompanyRole;
  parent_id: string | null;
  hasData?: boolean;
  year?: number | null;
}

export interface CompanyProfile {
  company_id: string;
  founded_at: string | null;
  board_chair: string | null;
  board_vice: string | null;
  board_members: string | null;
  general_assembly_date: string | null;
  partnership: string | null;
  personnel_count: string | null;
  credits: string | null;
  patents: string | null;
  project_count: string | null;
  project_amount_try: string | null;
  project_amount_usd: string | null;
  project_amount_eur: string | null;
  debts_to_partners: string | null;
  notes: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  displayName?: string;
  initials?: string;
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = localStorage.getItem('istirak_token');
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: authHeaders(init?.headers),
  });
  if (res.status === 401 && !url.includes('/api/auth/')) {
    localStorage.removeItem('istirak_token');
    window.dispatchEvent(new Event('istirak:logout'));
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json();
  }
  return res as unknown as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),
  me: () => request<{ user: AuthUser }>('/api/auth/me'),
  updateProfile: (body: { firstName: string; lastName: string; email: string }) =>
    request<{ user: AuthUser }>('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  uploadAvatar: async (file: File) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return request<{ user: AuthUser }>('/api/auth/avatar', { method: 'POST', body: fd });
  },
  deleteAvatar: () =>
    request<{ user: AuthUser }>('/api/auth/avatar', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
  listCompanies: () => request<Company[]>('/api/companies'),
  createCompany: (body: { name: string; role: CompanyRole; parentId?: string | null }) =>
    request<Company>('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateCompany: (id: string, name: string) =>
    request<Company>(`/api/companies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  deleteCompany: (id: string) =>
    request<{ ok: boolean }>(`/api/companies/${id}`, { method: 'DELETE' }),
  getProfile: (id: string) => request<CompanyProfile>(`/api/companies/${id}/profile`),
  saveProfile: (id: string, body: Partial<CompanyProfile>) =>
    request<CompanyProfile>(`/api/companies/${id}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  importExcel: async (id: string, file: File, period: { year: number; month: number }) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('year', String(period.year));
    fd.append('month', String(period.month));
    return request<{
      importId: string;
      status: string;
      message: string;
      warnings: string[];
      errors: string[];
      summary: {
        totalInflowYear: number;
        totalOutflowYear: number;
        netYear: number;
        lastBalance: number;
      };
      year: number;
      month: number;
      lineCount: number;
      weekCount: number;
      dashboardPath: string;
    }>(`/api/companies/${id}/import`, { method: 'POST', body: fd });
  },
  listPeriods: (id: string) =>
    request<{
      periods: { year: number; month: number; filename?: string; created_at?: string }[];
      latest: { year: number; month: number } | null;
    }>(`/api/companies/${id}/periods`),
  listImports: (id: string) =>
    request<
      {
        id: string;
        filename: string;
        status: string;
        message: string | null;
        year: number | null;
        month: number | null;
        created_at: string;
      }[]
    >(`/api/companies/${id}/imports`),
  listAllImports: (opts?: { companyId?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (opts?.companyId) q.set('companyId', opts.companyId);
    if (opts?.status) q.set('status', opts.status);
    const qs = q.toString();
    return request<{
      total: number;
      items: ImportJob[];
    }>(`/api/imports${qs ? `?${qs}` : ''}`);
  },
  downloadImportFile: async (id: string, filename: string) => {
    const res = await fetch(`/api/imports/${id}/file`, {
      credentials: 'include',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Dosya indirilemedi');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  dashboard: (
    id: string,
    opts?: { year?: number; month?: number | 'all' },
  ) => {
    const q = new URLSearchParams();
    if (opts?.year) q.set('year', String(opts.year));
    if (opts?.month === 'all' || opts?.month == null) q.set('month', 'all');
    else q.set('month', String(opts.month));
    const qs = q.toString();
    return request<any>(`/api/companies/${id}/dashboard${qs ? `?${qs}` : ''}`);
  },
  downloadExport: async (
    id: string,
    format: 'pptx' | 'pdf' | 'xlsx',
    opts: { year?: number; month?: number | 'all' },
    filename: string,
  ) => {
    const q = new URLSearchParams();
    if (opts.year) q.set('year', String(opts.year));
    if (opts.month === 'all' || opts.month == null) q.set('month', 'all');
    else q.set('month', String(opts.month));
    const res = await fetch(`/api/companies/${id}/export/${format}?${q.toString()}`, {
      credentials: 'include',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'İndirme başarısız');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  downloadPresentation: async (id: string, filename: string) => {
    return api.downloadExport(id, 'pptx', { month: 'all' }, filename);
  },
  listLogs: (opts?: {
    limit?: number;
    offset?: number;
    category?: string;
    username?: string;
    q?: string;
  }) => {
    const q = new URLSearchParams();
    if (opts?.limit) q.set('limit', String(opts.limit));
    if (opts?.offset) q.set('offset', String(opts.offset));
    if (opts?.category) q.set('category', opts.category);
    if (opts?.username) q.set('username', opts.username);
    if (opts?.q) q.set('q', opts.q);
    const qs = q.toString();
    return request<{
      total: number;
      limit: number;
      offset: number;
      items: ActivityLog[];
      stats: {
        total: number;
        byCategory: { category: string; c: number }[];
        lastAt: string | null;
      };
    }>(`/api/logs${qs ? `?${qs}` : ''}`);
  },
  clearLogs: () =>
    request<{ ok: boolean }>('/api/logs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
  checkUpdate: () => request<UpdateCheck>('/api/system/update/check'),
  applyUpdate: () =>
    request<UpdateApplyResult>('/api/system/update/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
  getVersion: () => request<{ version: string }>('/api/system/version'),
};

export interface ActivityLog {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  category: string;
  detail: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  ip: string | null;
  level: string;
  createdAt: string;
  meta: Record<string, unknown> | null;
}

export interface ImportJob {
  id: string;
  companyId: string;
  companyName: string | null;
  filename: string;
  status: string;
  message: string | null;
  year: number | null;
  month: number | null;
  createdAt: string;
  hasFile: boolean;
}

export interface UpdateCheck {
  ok: boolean;
  localVersion: string;
  remoteVersion: string | null;
  updateAvailable: boolean;
  repo: string;
  branch: string;
  error?: string;
  checkedAt: string;
}

export interface UpdateApplyResult {
  ok: boolean;
  localVersion: string;
  remoteVersion: string;
  message: string;
  restartScheduled: boolean;
  error?: string;
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(n || 0);
}
