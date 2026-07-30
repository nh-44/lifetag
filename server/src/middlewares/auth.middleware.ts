import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.utils';
import { sendError } from '../utils/response.utils';
import { ErrorCodes } from '../constants/errorCodes';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, ErrorCodes.UNAUTHORIZED, 'Authentication token is missing or invalid', 401);
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);
    
    req.user = payload;
    next();
  } catch (error) {
    return sendError(res, ErrorCodes.UNAUTHORIZED, 'Authentication failed or token expired', 401);
  }
};
