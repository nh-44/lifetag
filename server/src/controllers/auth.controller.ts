import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { sendSuccess } from '../utils/response.utils';

export const authController = {
  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  signup: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.signup(req.body);
      sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  },

  checkAvailability: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
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
  }
};
