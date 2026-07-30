import { Request, Response, NextFunction } from 'express';
import { scanService } from '../services/scan.service';
import { sendSuccess } from '../utils/response.utils';

export const scanController = {
  logScan: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { patientAccount, deviceMeta } = req.body;
      const result = await scanService.logScan(req.user!.userId, patientAccount, deviceMeta);
      sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  },

  getScanHistory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await scanService.getScanHistory(req.user!.userId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
};
