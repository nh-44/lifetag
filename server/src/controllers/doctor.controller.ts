import { Request, Response, NextFunction } from 'express';
import { doctorService } from '../services/doctor.service';
import { sendSuccess } from '../utils/response.utils';

export const doctorController = {
  getMyProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await doctorService.getProfile(req.user!.userId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  updateProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await doctorService.updateProfile(req.user!.userId, req.body);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
};
