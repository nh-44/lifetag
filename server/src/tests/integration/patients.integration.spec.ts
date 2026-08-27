/**
 * §5 — Patients API integration tests
 *
 * Covers triage-only access (FR/Doctor), full medical access (Doctor+consent),
 * patient self-management routes (GET/PUT/DELETE /me, GET /:userId),
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

// ─── GET /api/v1/patients/me ──────────────────────────────────────────────────

describe('GET /api/v1/patients/me', () => {
  it('returns 401 for an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/patients/me');

    expect(res.status).toBe(401);
  });

  it('returns 403 when a DOCTOR role hits the /me route (USER-only)', async () => {
    const { doctor } = await seedDoctor({ userId: 'DR82001' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    const res = await request(app)
      .get('/api/v1/patients/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 200 with the full emergency and medical profile for an authenticated USER', async () => {
    const { user } = await seedUser({ userId: 'US82001', accountId: '82001' });
    const token = makeToken(user.userId, Role.USER);

    const res = await request(app)
      .get('/api/v1/patients/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    // Emergency / triage fields
    expect(data.userId).toBe(user.userId);
    expect(data.accountId).toBe(user.accountId);
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('bloodGroup');
    expect(data).toHaveProperty('allergies');
    expect(data).toHaveProperty('dnrStatus');
    expect(data).toHaveProperty('emergencyContacts');
    // Full profile must include doctorOnlyInfo for the patient themselves
    expect(data).toHaveProperty('doctorOnlyInfo');
    // Password must never be exposed
    expect(data).not.toHaveProperty('password');
  });
});

// ─── GET /api/v1/patients/:userId ─────────────────────────────────────────────

describe('GET /api/v1/patients/:userId', () => {
  it('returns 401 for an unauthenticated request', async () => {
    const { user } = await seedUser({ userId: 'US83001', accountId: '83001' });

    const res = await request(app).get(`/api/v1/patients/${user.userId}`);

    expect(res.status).toBe(401);
  });

  it('returns 200 when the requesting user fetches their own userId', async () => {
    const { user } = await seedUser({ userId: 'US83002', accountId: '83002' });
    const token = makeToken(user.userId, Role.USER);

    const res = await request(app)
      .get(`/api/v1/patients/${user.userId}`)
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(user.userId);
  });

  it('returns 403 when a user tries to fetch another patient\'s userId', async () => {
    const { user: userA } = await seedUser({ userId: 'US83003', accountId: '83003' });
    const { user: userB } = await seedUser({ userId: 'US83004', accountId: '83004' });
    const tokenA = makeToken(userA.userId, Role.USER);

    const res = await request(app)
      .get(`/api/v1/patients/${userB.userId}`)
      .set(makeAuthHeader(tokenA));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/You can only access your own profile/i);
  });
});

// ─── PUT /api/v1/patients/me ──────────────────────────────────────────────────

describe('PUT /api/v1/patients/me', () => {
  it('returns 401 for an unauthenticated request', async () => {
    const res = await request(app)
      .put('/api/v1/patients/me')
      .send({ bloodGroup: 'A+', age: 25, allergies: [], emergencyContacts: [], dnrStatus: false, insuranceId: '' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when a DOCTOR role tries to update /patients/me (USER-only)', async () => {
    const { doctor } = await seedDoctor({ userId: 'DR84001' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    const res = await request(app)
      .put('/api/v1/patients/me')
      .set(makeAuthHeader(token))
      .send({ bloodGroup: 'A+', age: 25, allergies: [], emergencyContacts: [], dnrStatus: false, insuranceId: '' });

    expect(res.status).toBe(403);
  });

  it('returns 200 and updates triage fields (blood group, allergies, contacts, DNR)', async () => {
    const { user } = await seedUser({ userId: 'US84001', accountId: '84001' });
    const token = makeToken(user.userId, Role.USER);

    const updatePayload = {
      age: 28,
      bloodGroup: 'AB+',
      allergies: ['Penicillin', 'Shellfish'],
      emergencyContacts: [{ userId: 'US00001', name: 'Jane Doe' }],
      dnrStatus: true,
      insuranceId: 'INS-12345',
      primaryPhysician: { userId: '', name: '' },
      // Provide authoritySignature to bypass AUTHORITY_PRIVATE_KEY requirement in test env
      authoritySignature: 'test-authority-sig',
    };

    const res = await request(app)
      .put('/api/v1/patients/me')
      .set(makeAuthHeader(token))
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.bloodGroup).toBe('AB+');
    expect(data.allergies).toEqual(['Penicillin', 'Shellfish']);
    expect(data.dnrStatus).toBe(true);
    expect(data.insuranceId).toBe('INS-12345');
  });

  it('returns 200 and updates doctorOnlyInfo fields along with triage data', async () => {
    const { user } = await seedUser({ userId: 'US84002', accountId: '84002' });
    const token = makeToken(user.userId, Role.USER);

    const updatePayload = {
      age: 35,
      bloodGroup: 'B-',
      allergies: ['Aspirin'],
      emergencyContacts: [],
      dnrStatus: false,
      insuranceId: 'INS-99999',
      primaryPhysician: { userId: '', name: '' },
      // Provide authoritySignature to bypass AUTHORITY_PRIVATE_KEY requirement in test env
      authoritySignature: 'test-authority-sig',
      doctorOnlyInfo: {
        drinkingHabits: 'Occasional',
        smokingHabits: 'Never',
        medications: ['Metformin'],
        illnesses: ['Diabetes Type 2'],
        surgeries: ['Appendectomy 2018'],
        lastCheckup: { weight: 75, bmi: 24.5, sugar: 105, bp: '130/85' },
      },
    };

    const res = await request(app)
      .put('/api/v1/patients/me')
      .set(makeAuthHeader(token))
      .send(updatePayload);

    expect(res.status).toBe(200);

    const data = res.body.data;
    expect(data.bloodGroup).toBe('B-');
    expect(data.doctorOnlyInfo.drinkingHabits).toBe('Occasional');
    expect(data.doctorOnlyInfo.medications).toEqual(['Metformin']);
    expect(data.doctorOnlyInfo.illnesses).toEqual(['Diabetes Type 2']);
  });

  it('verifies updated triage fields persist in the database', async () => {
    const { user } = await seedUser({ userId: 'US84003', accountId: '84003' });
    const token = makeToken(user.userId, Role.USER);

    await request(app)
      .put('/api/v1/patients/me')
      .set(makeAuthHeader(token))
      .send({
        age: 40,
        bloodGroup: 'O-',
        allergies: ['Latex'],
        emergencyContacts: [],
        dnrStatus: false,
        insuranceId: 'INS-LTX',
        primaryPhysician: { userId: '', name: '' },
        // Provide authoritySignature to bypass AUTHORITY_PRIVATE_KEY requirement in test env
        authoritySignature: 'test-authority-sig',
      });

    const persisted = await testPrisma.triageProfile.findUnique({
      where: { userId: user.userId },
    });

    expect(persisted).not.toBeNull();
    expect(persisted!.bloodGroup).toBe('O-');
    expect(persisted!.allergies).toEqual(['Latex']);
    expect(persisted!.dnrStatus).toBe(false);
  });
});

// ─── DELETE /api/v1/patients/me ───────────────────────────────────────────────

describe('DELETE /api/v1/patients/me', () => {
  it('returns 401 for an unauthenticated request', async () => {
    const res = await request(app).delete('/api/v1/patients/me');

    expect(res.status).toBe(401);
  });

  it('returns 403 when a DOCTOR role tries to delete /patients/me (USER-only)', async () => {
    const { doctor } = await seedDoctor({ userId: 'DR85001' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    const res = await request(app)
      .delete('/api/v1/patients/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 200 and removes the user account along with cascading profiles', async () => {
    const { user } = await seedUser({ userId: 'US85001', accountId: '85001' });
    const token = makeToken(user.userId, Role.USER);

    const res = await request(app)
      .delete('/api/v1/patients/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ success: true });

    // Confirm the User row is gone
    const deletedUser = await testPrisma.user.findUnique({
      where: { userId: user.userId },
    });
    expect(deletedUser).toBeNull();

    // Confirm cascading deletion of TriageProfile
    const deletedTriage = await testPrisma.triageProfile.findUnique({
      where: { userId: user.userId },
    });
    expect(deletedTriage).toBeNull();

    // Confirm cascading deletion of MedicalHistory
    const deletedMedical = await testPrisma.medicalHistory.findUnique({
      where: { userId: user.userId },
    });
    expect(deletedMedical).toBeNull();
  });
});
