/**
 * Accepts only same-origin, app-internal paths for post-login redirects, so a crafted
 * `?redirectTo=` link cannot send a freshly logged-in user to another site.
 */
export function safeInternalPath(candidate: string | null | undefined, fallback = "/"): string {
  if (!candidate || typeof candidate !== "string") return fallback;
  if (!candidate.startsWith("/")) return fallback; // absolute URLs, "javascript:", relative tricks
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback; // protocol-relative
  if ([...candidate].some((c) => c.charCodeAt(0) < 0x20)) return fallback; // control characters / header splitting
  return candidate;
}

/** Mirrors the server's PASSWORD_RULE (server/src/types/auth.types.ts). Returns a problem, or null if acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password must be at most 128 characters";
  if (!/[A-Za-z]/.test(password)) return "Password must contain a letter";
  if (!/\d/.test(password)) return "Password must contain a number";
  return null;
}
