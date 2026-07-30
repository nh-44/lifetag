import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtPayload } from '../types/auth.types';

export const generateToken = (payload: JwtPayload): string => {
  let expiresIn: SignOptions['expiresIn'] = '7d'; // Default for USER
  if (payload.role === 'DOCTOR') expiresIn = '8h';
  if (payload.role === 'FIRST_RESPONDER') expiresIn = '24h';

  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};
