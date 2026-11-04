import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { ErrorCodes } from '../constants/errorCodes';

interface AppError {
  statusCode?: number;
  message?: string;
  code?: string;
}

export const errorHandler = (err: AppError, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  if (statusCode >= 500) console.error('Server Error:', err);

  // 4xx errors are thrown deliberately with user-facing messages ("Invalid User ID or
  // password", "Patient not found"); hiding them in production broke the UI's error
  // messages. Only unexpected 5xx errors are masked outside development.
  const exposeMessage = statusCode < 500 || env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  const code = err.code || (statusCode < 500 ? ErrorCodes.VALIDATION_ERROR : ErrorCodes.INTERNAL_SERVER_ERROR);

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: exposeMessage && err.message ? err.message : 'An unexpected error occurred',
    },
  });
};
