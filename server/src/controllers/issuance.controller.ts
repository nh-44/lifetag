import { Request, Response, NextFunction } from 'express';
import { issuanceService } from '../services/issuance.service';
import { sendSuccess } from '../utils/response.utils';

export const issuanceController = {
  certifyTag: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await issuanceService.certifyTag(req.user!.userId, req.body);
      sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  },

  revokeOwnTag: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await issuanceService.revokeOwnTag(req.user!.userId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },
};
