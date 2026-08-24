/**
 * §3.2 — auth.middleware unit tests
 *
 * Uses lightweight mock req/res/next objects — no DB, no Prisma.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { makeToken, makeExpiredToken, makeTamperedToken } from '../helpers/authHelpers';
import { Role } from '../../constants/roles';

// ─── Minimal mock factories ───────────────────────────────────────────────────

function mockReq(headers: Record<string, string> = {}): Partial<Request> {
  return { headers } as Partial<Request>;
}

function mockRes(): { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } & Partial<Response> {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const next = vi.fn() as unknown as NextFunction;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('authMiddleware', () => {
  it('returns 401 when Authorization header is absent', () => {
    const req = mockReq();
    const res = mockRes();

    authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with "Bearer "', () => {
    const req = mockReq({ authorization: 'Token abc.def.ghi' });
    const res = mockRes();

    authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is expired', () => {
    const expired = makeExpiredToken('US11111', Role.USER);
    const req = mockReq({ authorization: `Bearer ${expired}` });
    const res = mockRes();

    authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token signature has been tampered with', () => {
    const tampered = makeTamperedToken('US11111', Role.USER);
    const req = mockReq({ authorization: `Bearer ${tampered}` });
    const res = mockRes();

    authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and populates req.user for a valid token', () => {
    const token = makeToken('US22222', Role.USER);
    const req = mockReq({ authorization: `Bearer ${token}` }) as Request & { user?: any };
    const res = mockRes();

    authMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ userId: 'US22222', role: Role.USER });
  });
});
