// Token store — shared between api.ts and auth.tsx (avoids circular imports).
//
// SECURITY TRADEOFF (documented per API contract §1):
//  - accessToken is kept IN MEMORY ONLY (module-level variable). It is lost on
//    page reload and is never persisted to localStorage/sessionStorage, which
//    reduces the window in which an XSS payload can exfiltrate a long-lived
//    bearer token.
//  - refreshToken IS persisted to localStorage so the session survives a reload
//    and a silent refresh can be performed without re-login. Tradeoff: any XSS
//    that runs while the page is open can read it. We mitigate by rotating the
//    refresh token on every /auth/refresh call (backend revokes the old one)
//    and by clearing it immediately on logout / session-expiry.
//  - httpOnly cookie would be safer but requires same-domain deployment; the
//    contract explicitly allows this memory+localStorage split.
const REFRESH_TOKEN_KEY = 'yesi_refresh_token';

let accessToken: string | null = null;

export const tokenStore = {
  getAccessToken: (): string | null => accessToken,
  setAccessToken: (t: string | null): void => {
    accessToken = t;
  },
  getRefreshToken: (): string | null => {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setRefreshToken: (t: string | null): void => {
    try {
      if (t) localStorage.setItem(REFRESH_TOKEN_KEY, t);
      else localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      // storage unavailable (private mode) — ignore
    }
  },
  /** Clear both tokens (called on logout / refresh failure / session expiry). */
  clear: (): void => {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      // ignore
    }
  },
};
