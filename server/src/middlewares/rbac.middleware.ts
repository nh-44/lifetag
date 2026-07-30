import { Request, Response, NextFunction } from 'express';
import { Role } from '../constants/roles';
import { sendError } from '../utils/response.utils';
import { ErrorCodes } from '../constants/errorCodes';

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
