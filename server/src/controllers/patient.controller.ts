import { Request, Response, NextFunction } from 'express';
import { patientService } from '../services/patient.service';
import { sendSuccess } from '../utils/response.utils';
import { scanService } from '../services/scan.service';
import { authService } from '../services/auth.service';
import { clearRefreshCookie } from '../utils/cookie.utils';
import { userRepository } from '../repositories/userRepository';

export const patientController = {
  getEmergencyInfo: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = req.params.accountId as string;
      const result = await patientService.getEmergencyInfo(accountId);
      // Every online lookup is audited and visible to the patient (GET /patients/me/access-log).
      await scanService.logLookup(req.user!.userId, accountId, req.headers['user-agent']);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  getFullMedicalInfo: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = req.params.accountId as string;
      const result = await patientService.getFullProfile(accountId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  getMyProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.getProfileByUserId(req.user!.userId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  getMyAccessLog: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = await userRepository.findByUserId(req.user!.userId);
      if (!me) throw { statusCode: 404, message: 'Patient not found' };
      sendSuccess(res, await scanService.getAccessLogForPatient(me.accountId));
    } catch (error) {
      next(error);
    }
  },

  getProfileByUserId: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      if (req.user!.userId !== userId) {
        throw { statusCode: 403, message: 'You can only access your own profile' };
      }
      const result = await patientService.getProfileByUserId(userId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  updateProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.updateProfile(req.user!.userId, req.body);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  deleteAccount: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await patientService.deleteAccount(req.user!.userId);
      await authService.revokeAllSessions(req.user!.userId);
      clearRefreshCookie(res);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
};
