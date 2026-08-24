/**
 * §3.3 — consent.middleware unit tests (P0)
 *
 * The consent gate is the paper's core access-control contribution.
 * All repository calls are mocked; no real DB is needed.
 *
 * 24-hour boundary note:
 *   scanAuditRepository.checkRecentScan uses `timestamp: { gte: cutoff }` where
 *   cutoff = Date.now() - 24 * 60 * 60 * 1000.
 *   A scan logged AT exactly the cutoff passes (gte is inclusive).
 *   A scan logged 1ms before the cutoff does NOT pass.
 *   This is documented here as the authoritative behavioral specification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireMedicalConsent } from '../../middlewares/consent.middleware';

// ─── Mock repos ────────────────────────────────────────────────────────────────

vi.mock('../../repositories/userRepository', () => ({
  userRepository: {
    findByAccountId: vi.fn(),
  },
}));
vi.mock('../../repositories/scanAuditRepository', () => ({
  scanAuditRepository: {
    checkRecentScan: vi.fn(),
  },
}));

import { userRepository } from '../../repositories/userRepository';
import { scanAuditRepository } from '../../repositories/scanAuditRepository';

const mockUserRepo = userRepository as { findByAccountId: ReturnType<typeof vi.fn> };
const mockScanRepo = scanAuditRepository as { checkRecentScan: ReturnType<typeof vi.fn> };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOCTOR_ID = 'DR11111';
const ACCOUNT_ID = '22222';

function makeReq(doctorId: string, accountId: string): Partial<Request> {
  return {
    params: { accountId },
    user: { userId: doctorId, role: 'DOCTOR' as any },
  };
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('requireMedicalConsent middleware', () => {
  // ── Patient not found ──────────────────────────────────────────────────────

  it('returns 404 (not 403) when the patient accountId does not exist', async () => {
    mockUserRepo.findByAccountId.mockResolvedValue(null);
    const next = vi.fn();
    const res = makeRes();

    await requireMedicalConsent(
      makeReq(DOCTOR_ID, 'nonexistent') as Request,
      res as Response,
      next as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  // ── Primary physician bypass ───────────────────────────────────────────────

  it('calls next() immediately when the doctor is the primaryPhysician', async () => {
    mockUserRepo.findByAccountId.mockResolvedValue({
      triageProfile: { primaryPhysician: DOCTOR_ID },
    });
    const next = vi.fn();
    const res = makeRes();

    await requireMedicalConsent(
      makeReq(DOCTOR_ID, ACCOUNT_ID) as Request,
      res as Response,
      next as NextFunction,
    );

    expect(next).toHaveBeenCalledOnce();
    // checkRecentScan should NOT have been called — the primary-physician check short-circuits
    expect(mockScanRepo.checkRecentScan).not.toHaveBeenCalled();
  });

  // ── Scan-based access ──────────────────────────────────────────────────────

  it('calls next() when doctor has a recent scan (within 24h) but is NOT primary physician', async () => {
    mockUserRepo.findByAccountId.mockResolvedValue({
      triageProfile: { primaryPhysician: 'DR99999' }, // a different doctor
    });
    mockScanRepo.checkRecentScan.mockResolvedValue(true);
    const next = vi.fn();
    const res = makeRes();

    await requireMedicalConsent(
      makeReq(DOCTOR_ID, ACCOUNT_ID) as Request,
      res as Response,
      next as NextFunction,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when doctor is NOT primary physician and has NO recent scan', async () => {
    mockUserRepo.findByAccountId.mockResolvedValue({
      triageProfile: { primaryPhysician: 'DR99999' },
    });
    mockScanRepo.checkRecentScan.mockResolvedValue(false);
    const next = vi.fn();
    const res = makeRes();

    await requireMedicalConsent(
      makeReq(DOCTOR_ID, ACCOUNT_ID) as Request,
      res as Response,
      next as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when doctor has NEVER scanned this patient and is not primary physician', async () => {
    mockUserRepo.findByAccountId.mockResolvedValue({
      triageProfile: { primaryPhysician: null },
    });
    mockScanRepo.checkRecentScan.mockResolvedValue(false);
    const next = vi.fn();
    const res = makeRes();

    await requireMedicalConsent(
      makeReq(DOCTOR_ID, ACCOUNT_ID) as Request,
      res as Response,
      next as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  // ── 24-hour boundary: documented behavior ─────────────────────────────────

  it('BOUNDARY DOC: checkRecentScan is called with 24 hours — the gte cutoff is inclusive', async () => {
    /**
     * scanAuditRepository.checkRecentScan(doctorId, accountId, 24) computes:
     *   cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
     *   WHERE timestamp >= cutoff
     *
     * A scan at EXACTLY the cutoff moment satisfies `gte` and passes.
     * This test confirms the middleware passes the value 24 to the repo
     * and that the repo's gte boundary is inclusive (tested separately in repositories.spec.ts).
     */
    mockUserRepo.findByAccountId.mockResolvedValue({
      triageProfile: { primaryPhysician: null },
    });
    mockScanRepo.checkRecentScan.mockResolvedValue(true);
    const next = vi.fn();
    const res = makeRes();

    await requireMedicalConsent(
      makeReq(DOCTOR_ID, ACCOUNT_ID) as Request,
      res as Response,
      next as NextFunction,
    );

    expect(mockScanRepo.checkRecentScan).toHaveBeenCalledWith(DOCTOR_ID, ACCOUNT_ID, 24);
    expect(next).toHaveBeenCalledOnce();
  });

  // ── Cross-patient isolation ────────────────────────────────────────────────

  it('returns 403 when doctor scanned a DIFFERENT patient recently (no cross-patient leak)', async () => {
    mockUserRepo.findByAccountId.mockResolvedValue({
      triageProfile: { primaryPhysician: null },
    });
    // Scan repository returns false for THIS patient even though doctor scanned someone else
    mockScanRepo.checkRecentScan.mockResolvedValue(false);
    const next = vi.fn();
    const res = makeRes();

    await requireMedicalConsent(
      makeReq(DOCTOR_ID, ACCOUNT_ID) as Request,
      res as Response,
      next as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    // Confirm the repo was queried with the CORRECT patient account
    expect(mockScanRepo.checkRecentScan).toHaveBeenCalledWith(DOCTOR_ID, ACCOUNT_ID, 24);
  });

  // ── No primaryPhysician at all ─────────────────────────────────────────────

  it('returns 403 when triageProfile.primaryPhysician is null and no recent scan', async () => {
    mockUserRepo.findByAccountId.mockResolvedValue({
      triageProfile: { primaryPhysician: null },
    });
    mockScanRepo.checkRecentScan.mockResolvedValue(false);
    const next = vi.fn();
    const res = makeRes();

    await requireMedicalConsent(
      makeReq('DR00000', ACCOUNT_ID) as Request,
      res as Response,
      next as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
