import { Request, Response, NextFunction } from 'express';
import { userRepository } from '../repositories/userRepository';
import { scanAuditRepository } from '../repositories/scanAuditRepository';
import { sendError } from '../utils/response.utils';
import { ErrorCodes } from '../constants/errorCodes';

export const requireMedicalConsent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { accountId } = req.params;
    const doctorId = req.user!.userId;

    const patient = await userRepository.findByAccountId(accountId);
    if (!patient) {
      return sendError(res, ErrorCodes.NOT_FOUND, 'Patient not found', 404);
    }

    // 1. Check if doctor is primary physician
    const isPrimaryPhysician = patient.triageProfile?.primaryPhysician === doctorId;
    if (isPrimaryPhysician) {
      return next();
    }

    // 2. Check for emergency scan within last 24 hours
    const hasRecentScan = await scanAuditRepository.checkRecentScan(doctorId, accountId, 24);
    if (hasRecentScan) {
      return next();
    }

    // 3. Access Denied
    return sendError(res, ErrorCodes.FORBIDDEN, 'Access denied. You are not the primary physician and have not performed an emergency scan recently.', 403);
  } catch (error) {
    next(error);
  }
};
