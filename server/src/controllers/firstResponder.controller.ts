import { Request, Response, NextFunction } from 'express';
import { firstResponderService } from '../services/firstResponder.service';
import { sendSuccess } from '../utils/response.utils';

export const firstResponderController = {
  getMyProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await firstResponderService.getProfile(req.user!.userId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  updateProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await firstResponderService.updateProfile(req.user!.userId, req.body);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
};
