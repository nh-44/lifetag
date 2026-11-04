import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

vi.mock('../../repositories/doctorRepository', () => ({ doctorRepository: { findByUserId: vi.fn() } }));
vi.mock('../../repositories/firstResponderRepository', () => ({ firstResponderRepository: { findByUserId: vi.fn() } }));

import { requireVerifiedClinician } from '../../middlewares/rbac.middleware';
import { doctorRepository } from '../../repositories/doctorRepository';
import { firstResponderRepository } from '../../repositories/firstResponderRepository';
import { errorHandler } from '../../middlewares/error.middleware';
import { Role } from '../../constants/roles';

const res = () => {
  const r: any = {};
  r.status = vi.fn(() => r);
  r.json = vi.fn(() => r);
  return r as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
};
const req = (userId: string, role: Role) => ({ user: { userId, role } }) as unknown as Request;

describe('requireVerifiedClinician', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets a verified doctor through', async () => {
    vi.mocked(doctorRepository.findByUserId).mockResolvedValue({ verified: true } as any);
    const next = vi.fn();
    await requireVerifiedClinician(req('DR1', Role.DOCTOR), res(), next as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks a self-registered (unverified) doctor with an explanation', async () => {
    vi.mocked(doctorRepository.findByUserId).mockResolvedValue({ verified: false } as any);
    const r = res();
    const next = vi.fn();
    await requireVerifiedClinician(req('DR1', Role.DOCTOR), r, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.json.mock.calls[0][0].error.message).toMatch(/awaiting verification/);
  });

  it('checks first responders against their own table', async () => {
    vi.mocked(firstResponderRepository.findByUserId).mockResolvedValue({ verified: false } as any);
    const r = res();
    await requireVerifiedClinician(req('FR1', Role.FIRST_RESPONDER), r, vi.fn() as NextFunction);
    expect(firstResponderRepository.findByUserId).toHaveBeenCalledWith('FR1');
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('blocks a token whose clinician row no longer exists (deleted account)', async () => {
    vi.mocked(doctorRepository.findByUserId).mockResolvedValue(null);
    const r = res();
    await requireVerifiedClinician(req('DR9', Role.DOCTOR), r, vi.fn() as NextFunction);
    expect(r.status).toHaveBeenCalledWith(403);
  });
});

describe('errorHandler', () => {
  it('shows intentional 4xx messages (e.g. wrong password) to the client', () => {
    const r = res();
    errorHandler({ statusCode: 401, message: 'Invalid User ID or password' }, {} as Request, r, vi.fn());
    expect(r.status).toHaveBeenCalledWith(401);
    expect(r.json.mock.calls[0][0].error.message).toBe('Invalid User ID or password');
  });

  it('treats errors without a status as 500', () => {
    const r = res();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    errorHandler(new Error('db exploded') as any, {} as Request, r, vi.fn());
    expect(r.status).toHaveBeenCalledWith(500);
  });
});
