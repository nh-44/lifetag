import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/response.utils';
import { ErrorCodes } from '../constants/errorCodes';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return sendError(res, ErrorCodes.VALIDATION_ERROR, message, 400);
      }
      return sendError(res, ErrorCodes.INTERNAL_SERVER_ERROR, 'Validation failed', 500);
    }
  };
};
