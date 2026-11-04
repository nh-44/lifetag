import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { sendSuccess } from '../utils/response.utils';
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from '../utils/cookie.utils';

/** Moves the refresh token from the JSON body into the HttpOnly cookie. */
const withRefreshCookie = <T extends { refreshToken: string }>(res: Response, result: T) => {
  const { refreshToken, ...body } = result;
  setRefreshCookie(res, refreshToken);
  return body;
};

export const authController = {
  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body);
      sendSuccess(res, withRefreshCookie(res, result));
    } catch (error) {
      next(error);
    }
  },

  signup: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.signup(req.body);
      sendSuccess(res, withRefreshCookie(res, result), 201);
    } catch (error) {
      next(error);
    }
  },

  checkAvailability: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.params.userId as string;
      const result = await authService.checkAvailability(userId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  me: async (req: Request, res: Response, next: NextFunction) => {
    try {
      sendSuccess(res, { user: req.user });
    } catch (error) {
      next(error);
    }
  },

  refresh: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Body fallback is kept for non-browser API clients; the web client only uses the cookie.
      const refreshToken = readRefreshCookie(req) || req.body?.refreshToken;
      const result = await authService.refresh(refreshToken);
      sendSuccess(res, withRefreshCookie(res, result)); // rotated token goes back in the cookie
    } catch (error) {
      clearRefreshCookie(res); // a rejected refresh cookie is useless; drop it
      next(error);
    }
  },

  logout: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = readRefreshCookie(req) || req.body?.refreshToken;
      const result = await authService.logout(refreshToken);
      clearRefreshCookie(res);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
};
