import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtPayload } from '../types/auth.types';

type TokenType = 'access' | 'refresh';

/**
 * Both token kinds share the HMAC secret, so each carries a `typ` claim that
 * verification enforces. Without it, a 7-day refresh token was also accepted as
 * a bearer access token, outliving both the 15-minute expiry and logout.
 * `jti` makes every token unique (two logins in the same second used to mint
 * identical refresh tokens, colliding on the unique column).
 */
const sign = (payload: JwtPayload, typ: TokenType, expiresIn: SignOptions['expiresIn']): string =>
  jwt.sign({ userId: payload.userId, role: payload.role, typ }, env.JWT_SECRET, {
    expiresIn,
    algorithm: 'HS256',
    jwtid: crypto.randomUUID(),
  });

const verify = (token: string, typ: TokenType): JwtPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload & { typ?: string };
  if (decoded.typ !== typ) {
    throw new jwt.JsonWebTokenError(`Expected a ${typ} token`);
  }
  return { userId: decoded.userId, role: decoded.role };
};

export const generateToken = (payload: JwtPayload): string => sign(payload, 'access', '15m');

export const generateRefreshToken = (payload: JwtPayload): string => sign(payload, 'refresh', '7d');

export const verifyToken = (token: string): JwtPayload => verify(token, 'access');

export const verifyRefreshToken = (token: string): JwtPayload => verify(token, 'refresh');

/** Refresh tokens are stored hashed, so a database leak does not yield usable sessions. */
export const hashRefreshToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
