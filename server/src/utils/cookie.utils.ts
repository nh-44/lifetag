import { Request, Response, CookieOptions } from 'express';
import { env } from '../config/env';

export const REFRESH_COOKIE_NAME = 'aegistag_rt';

// HttpOnly keeps the 7-day refresh token out of reach of page scripts (an XSS
// can no longer exfiltrate it the way it could read localStorage). SameSite=Strict
// plus the narrow path means the browser only attaches it to same-site /auth calls.
const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

export const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
};

export const clearRefreshCookie = (res: Response) => {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, options);
};

/** Reads the refresh cookie without pulling in cookie-parser for a single value. */
export const readRefreshCookie = (req: Request): string | undefined => {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return undefined;
};
