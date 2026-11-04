import { Request, Response, NextFunction } from 'express';
import { Role } from '../constants/roles';
import { sendError } from '../utils/response.utils';
import { ErrorCodes } from '../constants/errorCodes';
import { doctorRepository } from '../repositories/doctorRepository';
import { firstResponderRepository } from '../repositories/firstResponderRepository';

export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, ErrorCodes.UNAUTHORIZED, 'User is not authenticated', 401);
    }

    if (!roles.includes(req.user.role)) {
      return sendError(res, ErrorCodes.FORBIDDEN, `Access denied. Requires one of: ${roles.join(', ')}`, 403);
    }

    next();
  };
};

/**
 * Clinical actions (tag issuance, scan logging, triage and record access) require a
 * clinician account verified by the Healthcare Authority operator. Signup alone only
 * creates an unverified account, so nobody can self-register into clinical access.
 * Checked against the database on every request (not a JWT claim), so verifying or
 * revoking a clinician takes effect immediately. Must run after requireRole.
 */
export const requireVerifiedClinician = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, role } = req.user!;
    const record =
      role === Role.DOCTOR ? await doctorRepository.findByUserId(userId)
      : role === Role.FIRST_RESPONDER ? await firstResponderRepository.findByUserId(userId)
      : null;
    if (!record) {
      return sendError(res, ErrorCodes.FORBIDDEN, 'Clinician account not found', 403);
    }
    if (!record.verified) {
      return sendError(
        res,
        ErrorCodes.FORBIDDEN,
        'Your clinician account is awaiting verification by the Healthcare Authority. Clinical features unlock once it is verified.',
        403
      );
    }
    next();
  } catch (error) {
    next(error);
  }
};
