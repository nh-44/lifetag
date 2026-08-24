/**
 * §3.2 — rbac.middleware unit tests
 *
 * Tests requireRole() middleware in isolation with mock req/res/next.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireRole } from '../../middlewares/rbac.middleware';
import { Role } from '../../constants/roles';

// ─── Minimal mock factories ───────────────────────────────────────────────────

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('requireRole middleware', () => {
  it('returns 401 when req.user is undefined (unauthenticated)', () => {
    const req = {} as Request; // no user property
    const res = mockRes();
    const next = vi.fn();
    const middleware = requireRole(Role.DOCTOR);

    middleware(req, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user role does not match the required role', () => {
    const req = { user: { userId: 'FR11111', role: Role.FIRST_RESPONDER } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    const middleware = requireRole(Role.DOCTOR); // doctor-only route

    middleware(req, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when a USER hits a DOCTOR-only route', () => {
    const req = { user: { userId: 'US22222', role: Role.USER } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireRole(Role.DOCTOR)(req, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('calls next() when user role exactly matches the required role', () => {
    const req = { user: { userId: 'DR33333', role: Role.DOCTOR } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireRole(Role.DOCTOR)(req, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when multiple roles are allowed and user matches one', () => {
    const req = { user: { userId: 'FR44444', role: Role.FIRST_RESPONDER } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireRole(Role.FIRST_RESPONDER, Role.DOCTOR)(req, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when none of multiple allowed roles matches', () => {
    const req = { user: { userId: 'US55555', role: Role.USER } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireRole(Role.FIRST_RESPONDER, Role.DOCTOR)(req, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
