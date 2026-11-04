// The short-lived (15 min) access token lives only in memory, never in Web Storage,
// so a script injected into the page cannot read it back from localStorage later.
// The 7-day refresh token is never visible to JavaScript at all: the server keeps it
// in an HttpOnly, SameSite=Strict cookie, and a page reload restores the session by
// calling /auth/refresh (see refreshAccessToken in services/api.ts).

let accessToken: string | null = null;

// Keys written by the previous localStorage-based scheme (reversible Base64
// obfuscation). Removed on load so upgraded browsers don't keep stale tokens around.
const LEGACY_KEYS = ['aegistag_token', 'aegistag_refresh_token'];
try {
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
} catch {
  // localStorage unavailable (private mode / SSR): nothing to clean up
}

export const tokenStorage = {
  setToken: (token: string) => {
    accessToken = token;
  },
  getToken: (): string | null => accessToken,
  clearTokens: () => {
    accessToken = null;
  },
};
