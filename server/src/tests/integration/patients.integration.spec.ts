/**
 * §5 — Patients API integration tests
 *
 * Covers triage-only access (FR/Doctor), full medical access (Doctor+consent),
 * and verifies field-level redaction and correct 401/403/404 codes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import {
  cleanDb,
  seedUser,
  seedDoctor,
  seedScanAuditLog,
  testPrisma,
} from '../helpers/testDb';
import { makeToken, makeAuthHeader } from '../helpers/authHelpers';
import { Role } from '../../constants/roles';

beforeEach(async () => {
  await cleanDb();
});

// ─── GET /api/v1/patients/triage/:accountId ───────────────────────────────────

describe('GET /api/v1/patients/triage/:accountId', () => {
  it('returns 401 for an unauthenticated request', async () => {
    const { user } = await seedUser({ userId: 'US80001', accountId: '80001' });

    const res = await request(app)
      .get(`/api/v1/patients/triage/${user.accountId}`);

    expect(res.status).toBe(401);
  });

  it('returns 403 when a USER role tries to access triage (wrong role)', async () => {
    const { user } = await seedUser({ userId: 'US80002', accountId: '80002' });
    const token = makeToken('US80002', Role.USER);

    const res = await request(app)
      .get(`/api/v1/patients/triage/${user.accountId}`)
      .set(makeAuthHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 200 with triage-only fields for an authenticated FIRST_RESPONDER', async () => {
    const { user } = await seedUser({ userId: 'US80003', accountId: '80003' });
    const token = makeToken('FR80003', Role.FIRST_RESPONDER);

    const res = await request(app)
      .get(`/api/v1/patients/triage/${user.accountId}`)
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
    const data = res.body.data;
    // Triage fields present
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('bloodGroup');
    expect(data).toHaveProperty('allergies');
    expect(data).toHaveProperty('dnrStatus');
    // Doctor-only deep fields must NOT be present
    expect(data).not.toHaveProperty('doctorOnlyInfo');
  });

  it('returns 200 with triage-only fields for an authenticated DOCTOR', async () => {
    const { user } = await seedUser({ userId: 'US80004', accountId: '80004' });
    const token = makeToken('DR80004', Role.DOCTOR);

    const res = await request(app)
      .get(`/api/v1/patients/triage/${user.accountId}`)
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('doctorOnlyInfo');
  });

  it('returns 404 when accountId does not exist', async () => {
    const token = makeToken('FR00000', Role.FIRST_RESPONDER);

    const res = await request(app)
      .get('/api/v1/patients/triage/NOTEXIST')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/v1/patients/medical/:accountId (consent-gated) ─────────────────

describe('GET /api/v1/patients/medical/:accountId', () => {
  it('returns 401 for an unauthenticated request', async () => {
    const { user } = await seedUser({ userId: 'US81001', accountId: '81001' });

    const res = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`);

    expect(res.status).toBe(401);
  });

  it('returns 403 when a FIRST_RESPONDER hits the medical route (RBAC blocks before consent)', async () => {
    const { user } = await seedUser({ userId: 'US81002', accountId: '81002' });
    const token = makeToken('FR81002', Role.FIRST_RESPONDER);

    const res = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(token));

    // 403 from RBAC, not from consent — confirms middleware ordering
    expect(res.status).toBe(403);
  });

  it('returns 403 when doctor has no relationship and no recent scan', async () => {
    const { user } = await seedUser({ userId: 'US81003', accountId: '81003' });
    const { doctor } = await seedDoctor({ userId: 'DR81003' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    const res = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 200 after a scan audit row is seeded (scan → consent → access)', async () => {
    const { user } = await seedUser({ userId: 'US81004', accountId: '81004' });
    const { doctor } = await seedDoctor({ userId: 'DR81004' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    // Seed a scan log that puts the doctor within the 24h window
    await seedScanAuditLog({
      scannedBy: doctor.userId,
      patientAccount: user.accountId,
      timestamp: new Date(), // just now
    });

    const res = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
    // Full profile includes doctorOnlyInfo
    expect(res.body.data).toHaveProperty('doctorOnlyInfo');
  });

  it('returns 200 when doctor is the primaryPhysician (no scan needed)', async () => {
    const { user } = await seedUser({ userId: 'US81005', accountId: '81005' });
    const { doctor } = await seedDoctor({ userId: 'DR81005' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    // Set doctor as primary physician
    await testPrisma.triageProfile.update({
      where: { userId: user.userId },
      data: { primaryPhysician: doctor.userId },
    });

    const res = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
  });

  it('returns 403 after the scan ages out (scan older than 24h)', async () => {
    const { user } = await seedUser({ userId: 'US81006', accountId: '81006' });
    const { doctor } = await seedDoctor({ userId: 'DR81006' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    // Seed a stale scan log (25 hours ago)
    const staleTs = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await seedScanAuditLog({
      scannedBy: doctor.userId,
      patientAccount: user.accountId,
      timestamp: staleTs,
    });

    const res = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(token));

    expect(res.status).toBe(403);
  });

  it('404 vs 403 vs 401 are distinguishable across representative routes', async () => {
    const { user } = await seedUser({ userId: 'US81007', accountId: '81007' });
    const { doctor } = await seedDoctor({ userId: 'DR81007' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    // 401 — no token
    const noAuth = await request(app).get(`/api/v1/patients/medical/${user.accountId}`);
    expect(noAuth.status).toBe(401);

    // 403 — authenticated but no consent
    const noConsent = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(token));
    expect(noConsent.status).toBe(403);

    // 404 — authenticated but non-existent patient
    const notFound = await request(app)
      .get('/api/v1/patients/medical/DOESNOTEXIST')
      .set(makeAuthHeader(token));
    expect(notFound.status).toBe(404);
  });
});
