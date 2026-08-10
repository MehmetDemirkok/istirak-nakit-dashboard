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
  importExcel: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
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
      lineCount: number;
      weekCount: number;
    }>(`/api/companies/${id}/import`, { method: 'POST', body: fd });
  },
  dashboard: (id: string) => request<any>(`/api/companies/${id}/dashboard`),
  seedDemo: () =>
    request<any>('/api/demo/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
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
};

export function formatMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(n || 0);
}
