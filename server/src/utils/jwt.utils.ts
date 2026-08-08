import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtPayload } from '../types/auth.types';

export const generateToken = (payload: JwtPayload): string => {
  // Access tokens are short-lived for security
  const expiresIn: SignOptions['expiresIn'] = '15m'; 
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
};

export const generateRefreshToken = (payload: JwtPayload): string => {
  // Refresh tokens are long-lived but revokable
  const expiresIn: SignOptions['expiresIn'] = '7d';
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  // Technically uses the same secret and verification method, but separated for semantics
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};
