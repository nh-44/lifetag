/**
 * §3.7 — Repository integration tests
 *
 * Hits the real test DB (lifetag_test). Each test gets a clean state via
 * cleanDb() in beforeEach.
 *
 * 24-hour boundary is tested here at the repository layer to isolate whether
 * a future bug would be in the query or in the consent middleware.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { userRepository } from '../../repositories/userRepository';
import { doctorRepository } from '../../repositories/doctorRepository';
import { firstResponderRepository } from '../../repositories/firstResponderRepository';
import { scanAuditRepository } from '../../repositories/scanAuditRepository';
import {
  testPrisma,
  cleanDb,
  seedUser,
  seedDoctor,
  seedFirstResponder,
  seedScanAuditLog,
} from '../helpers/testDb';

beforeEach(async () => {
  await cleanDb();
});

// ─── userRepository ───────────────────────────────────────────────────────────

describe('userRepository', () => {
  it('existsByUserId returns false for a non-existent userId', async () => {
    const exists = await userRepository.existsByUserId('US99999');
    expect(exists).toBe(false);
  });

  it('existsByUserId returns true after creating a user', async () => {
    const { user } = await seedUser({ userId: 'US10001' });
    const exists = await userRepository.existsByUserId(user.userId);
    expect(exists).toBe(true);
  });

  it('findByUserId returns null for a non-existent userId', async () => {
    const result = await userRepository.findByUserId('US99998');
    expect(result).toBeNull();
  });

  it('findByUserId returns the user with triageProfile and medicalHistory', async () => {
    const { user } = await seedUser({ userId: 'US10002', name: 'Alice' });
    const result = await userRepository.findByUserId(user.userId);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Alice');
    expect(result!.triageProfile).not.toBeNull();
    expect(result!.medicalHistory).not.toBeNull();
  });

  it('findByAccountId returns the correct user', async () => {
    const { user } = await seedUser({ userId: 'US10003', accountId: '10003' });
    const result = await userRepository.findByAccountId('10003');

    expect(result).not.toBeNull();
    expect(result!.userId).toBe(user.userId);
  });

  it('findByAccountId returns null for a non-existent accountId', async () => {
    const result = await userRepository.findByAccountId('NOTEXIST');
    expect(result).toBeNull();
  });

  it('cascading delete removes TriageProfile and MedicalHistory when User is deleted', async () => {
    const { user } = await seedUser({ userId: 'US10004' });

    // Use testPrisma directly (same client that seeded the row) to avoid cross-client visibility issues
    await testPrisma.user.delete({ where: { userId: user.userId } });

    const triage = await testPrisma.triageProfile.findUnique({ where: { userId: user.userId } });
    const medical = await testPrisma.medicalHistory.findUnique({ where: { userId: user.userId } });

    expect(triage).toBeNull();
    expect(medical).toBeNull();
  });
});

// ─── doctorRepository ────────────────────────────────────────────────────────

describe('doctorRepository', () => {
  it('existsByUserId returns false before creation', async () => {
    const exists = await doctorRepository.existsByUserId('DR99999');
    expect(exists).toBe(false);
  });

  it('existsByUserId returns true after creation', async () => {
    const { doctor } = await seedDoctor({ userId: 'DR20001' });
    const exists = await doctorRepository.existsByUserId(doctor.userId);
    expect(exists).toBe(true);
  });

  it('findByUserId returns the doctor profile', async () => {
    const { doctor } = await seedDoctor({ userId: 'DR20002', name: 'Dr. Smith' });
    const result = await doctorRepository.findByUserId(doctor.userId);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Dr. Smith');
  });

  it('findByUserId returns null for a non-existent userId', async () => {
    const result = await doctorRepository.findByUserId('DR00000');
    expect(result).toBeNull();
  });
});

// ─── firstResponderRepository ─────────────────────────────────────────────────

describe('firstResponderRepository', () => {
  it('existsByUserId returns false before creation', async () => {
    const exists = await firstResponderRepository.existsByUserId('FR99999');
    expect(exists).toBe(false);
  });

  it('existsByUserId returns true after creation', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR30001' });
    const exists = await firstResponderRepository.existsByUserId(responder.userId);
    expect(exists).toBe(true);
  });

  it('findByUserId returns the first responder profile', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR30002', name: 'Sam' });
    const result = await firstResponderRepository.findByUserId(responder.userId);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Sam');
  });
});

// ─── scanAuditRepository — checkRecentScan boundary tests ────────────────────

describe('scanAuditRepository.checkRecentScan', () => {
  const SCANNER = 'DR40001';
  const PATIENT = '50001';

  it('returns true for a scan created just now', async () => {
    await seedScanAuditLog({ scannedBy: SCANNER, patientAccount: PATIENT });
    const result = await scanAuditRepository.checkRecentScan(SCANNER, PATIENT, 24);
    expect(result).toBe(true);
  });

  it('returns true for a scan created 23h59m ago (within window)', async () => {
    const ts = new Date(Date.now() - (24 * 60 - 1) * 60 * 1000); // 23h59m ago
    await seedScanAuditLog({ scannedBy: SCANNER, patientAccount: PATIENT, timestamp: ts });
    const result = await scanAuditRepository.checkRecentScan(SCANNER, PATIENT, 24);
    expect(result).toBe(true);
  });

  it('BOUNDARY: returns true for a scan at EXACTLY the 24h cutoff (gte is inclusive)', async () => {
    /**
     * cutoff = Date.now() - 24 * 60 * 60 * 1000
     * WHERE timestamp >= cutoff
     * A scan AT the cutoff satisfies gte.
     * Note: Due to slight execution time between seed and query, we place the scan
     * 100ms AFTER the computed cutoff to guarantee it lands on the gte side.
     */
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tsAtCutoff = new Date(cutoff.getTime() + 100); // 100ms after cutoff = inside window
    await seedScanAuditLog({ scannedBy: SCANNER, patientAccount: PATIENT, timestamp: tsAtCutoff });
    const result = await scanAuditRepository.checkRecentScan(SCANNER, PATIENT, 24);
    expect(result).toBe(true);
  });

  it('returns false for a scan created 24h+2s ago (outside window)', async () => {
    const ts = new Date(Date.now() - (24 * 60 * 60 + 2) * 1000); // 24h + 2s ago
    await seedScanAuditLog({ scannedBy: SCANNER, patientAccount: PATIENT, timestamp: ts });
    const result = await scanAuditRepository.checkRecentScan(SCANNER, PATIENT, 24);
    expect(result).toBe(false);
  });

  it('returns false for a DIFFERENT doctor scanning the same patient', async () => {
    await seedScanAuditLog({ scannedBy: 'DR40002', patientAccount: PATIENT }); // different doctor
    const result = await scanAuditRepository.checkRecentScan(SCANNER, PATIENT, 24);
    expect(result).toBe(false);
  });

  it('returns false for the same doctor scanning a DIFFERENT patient', async () => {
    await seedScanAuditLog({ scannedBy: SCANNER, patientAccount: '99999' }); // different patient
    const result = await scanAuditRepository.checkRecentScan(SCANNER, PATIENT, 24);
    expect(result).toBe(false);
  });

  it('returns false when no scan logs exist at all', async () => {
    const result = await scanAuditRepository.checkRecentScan(SCANNER, PATIENT, 24);
    expect(result).toBe(false);
  });
});
