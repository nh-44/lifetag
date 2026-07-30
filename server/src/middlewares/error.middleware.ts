import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { ErrorCodes } from '../constants/errorCodes';

interface AppError {
  statusCode?: number;
  message?: string;
  code?: string;
}

export const errorHandler = (err: AppError, _req: Request, res: Response, _next: NextFunction) => {
  console.error('🔥 Server Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred';
  const code = err.code || ErrorCodes.INTERNAL_SERVER_ERROR;

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: env.NODE_ENV === 'development' ? message : 'An unexpected error occurred',
    },
  });
};
