// API client — fetch wrapper per API_CONTRACT.md §0, §1, §9.
//  - baseURL = import.meta.env.VITE_API_URL ?? '/api' (dev proxy makes /api same-origin)
//  - attaches Authorization: Bearer <accessToken> (from in-memory tokenStore)
//  - on 401: attempt POST /auth/refresh ONCE (deduped), retry original request;
//    if refresh fails → clear session + redirect to /login
//  - all non-2xx errors → toast.error(sonner) with server message, throw ApiError
import { toast } from 'sonner';
import { tokenStore } from './tokenStore';

export const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip auth header (used for login/refresh themselves). */
  skipAuth?: boolean;
  /** Suppress the automatic error toast (caller handles it). */
  silent?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!query) return base;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
}

// Dedupe concurrent refresh attempts so a burst of 401s triggers one refresh.
let refreshPromise: Promise<string | null> | null = null;

async function attemptRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const rt = tokenStore.getRefreshToken();
    if (!rt) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
      if (!data.accessToken) return null;
      tokenStore.setAccessToken(data.accessToken);
      if (data.refreshToken) tokenStore.setRefreshToken(data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    }
  })();
  refreshPromise.finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function handleUnauthorized(): never {
  tokenStore.clear();
  try {
    localStorage.removeItem('vortex_session');
  } catch {
    // ignore
  }
  // Hard redirect forces a full reload; AuthProvider will re-init with no session.
  window.location.assign('/login');
  throw new ApiError('Session expired. Please log in again.', 401, 'SESSION_EXPIRED');
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.skipAuth) {
    const t = tokenStore.getAccessToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (networkErr) {
    // Network failure (offline, CORS, DNS). Do NOT toast for network errors
    // during normal operation — offline mode is expected. Re-throw so callers
    // can fall back to Dexie.
    throw new ApiError(
      networkErr instanceof Error ? networkErr.message : 'Network error',
      0,
      'NETWORK_ERROR'
    );
  }

  // 401 → try refresh once, retry original request with new token.
  if (res.status === 401 && !opts.skipAuth) {
    const newToken = await attemptRefresh();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      try {
        res = await fetch(url, { ...init, headers });
      } catch {
        throw new ApiError('Network error after token refresh', 0, 'NETWORK_ERROR');
      }
    } else {
      handleUnauthorized();
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const errBody = (await res.json()) as { error?: { message?: string; code?: string } };
      if (errBody?.error?.message) message = errBody.error.message;
      if (errBody?.error?.code) code = errBody.error.code;
    } catch {
      // non-JSON error body — keep default message
    }
    if (!opts.silent) {
      toast.error(message);
    }
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// Typed client object
export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], opts?: Omit<RequestOptions, 'body' | 'query'>) =>
    request<T>('GET', path, { query, ...opts }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'query'>) =>
    request<T>('POST', path, { body, ...opts }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'query'>) =>
    request<T>('PUT', path, { body, ...opts }),
  del: <T>(path: string, opts?: Omit<RequestOptions, 'body' | 'query'>) =>
    request<T>('DELETE', path, opts),
  raw: request,
};

// Auth endpoints (login/refresh skip the Bearer header)
export const authApi = {
  login: (username: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: { id: number; username: string; role: string; displayName: string } }>(
      'POST',
      '/auth/login',
      { body: { username, password }, skipAuth: true, silent: true }
    ),
  logout: () =>
    request<unknown>('POST', '/auth/logout', { silent: true }).catch(() => undefined),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<unknown>('POST', '/auth/change-password', { body: { currentPassword, newPassword } }),
  me: () => request<{ id: number; username: string; role: string; displayName: string; createdAt: string }>('GET', '/auth/me'),
  updateProfile: (displayName: string) =>
    request<{ id: number; username: string; role: string; displayName: string; createdAt: string }>(
      'PUT',
      '/auth/profile',
      { body: { displayName } },
    ),
};

// Generic list response shape per contract §3: { data: [...], total, page, pageSize }
export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Fetch a resource list and normalize either {data:[...]} or raw array responses. */
export async function fetchList<T>(resource: string, query?: RequestOptions['query']): Promise<T[]> {
  const res = await api.get<ListResponse<T> | T[]>(`/${resource}`, query, { silent: true });
  if (Array.isArray(res)) return res;
  return res?.data ?? [];
}
