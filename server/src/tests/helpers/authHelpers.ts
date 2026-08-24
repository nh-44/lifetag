/**
 * Auth test helpers — generate JWTs without DB round-trips
 */
import jwt from 'jsonwebtoken';
import { Role } from '../../constants/roles';

const TEST_SECRET = process.env.JWT_SECRET ?? 'lifetag_test_jwt_secret_do_not_use_in_production';

export function makeToken(userId: string, role: Role, expiresIn: string = '15m'): string {
  return jwt.sign({ userId, role }, TEST_SECRET, { expiresIn } as jwt.SignOptions);
}

export function makeRefreshToken(userId: string, role: Role, expiresIn: string = '7d'): string {
  return jwt.sign({ userId, role }, TEST_SECRET, { expiresIn } as jwt.SignOptions);
}

export function makeExpiredToken(userId: string, role: Role): string {
  // expiresIn: 0 creates a token that is already expired
  return jwt.sign({ userId, role }, TEST_SECRET, { expiresIn: -1 } as jwt.SignOptions);
}

export function makeTamperedToken(userId: string, role: Role): string {
  const valid = makeToken(userId, role);
  // Corrupt the signature (last segment)
  const parts = valid.split('.');
  parts[2] = parts[2].split('').reverse().join('');
  return parts.join('.');
}

export function makeAuthHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
