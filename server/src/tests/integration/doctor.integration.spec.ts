/**
 * §5 — Doctor Profile API integration tests
 *
 * Covers GET /api/v1/doctors/me and PUT /api/v1/doctors/me.
 * Tests RBAC enforcement (401/403), profile retrieval (200),
 * missing-record handling (404), and profile update persistence.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import {
  cleanDb,
  seedDoctor,
  seedUser,
  seedFirstResponder,
  testPrisma,
} from '../helpers/testDb';
import { makeToken, makeAuthHeader } from '../helpers/authHelpers';
import { Role } from '../../constants/roles';

beforeEach(async () => {
  await cleanDb();
});

// ─── GET /api/v1/doctors/me ───────────────────────────────────────────────────

describe('GET /api/v1/doctors/me', () => {
  it('returns 401 for an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/doctors/me');

    expect(res.status).toBe(401);
  });

  it('returns 403 when a USER role requests the doctor route (RBAC)', async () => {
    const { user } = await seedUser({ userId: 'US90001', accountId: '90001' });
    const token = makeToken(user.userId, Role.USER);

    const res = await request(app)
      .get('/api/v1/doctors/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 403 when a FIRST_RESPONDER role requests the doctor route (RBAC)', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR90001' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);

    const res = await request(app)
      .get('/api/v1/doctors/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 404 when the authenticated DOCTOR has no record in the DB', async () => {
    // Generate a token for a userId that has no DoctorProfile row
    const token = makeToken('DR99999', Role.DOCTOR);

    const res = await request(app)
      .get('/api/v1/doctors/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(404);
  });

  it('returns 200 with the doctor profile for an authenticated DOCTOR', async () => {
    const { doctor } = await seedDoctor({ userId: 'DR90002' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    const res = await request(app)
      .get('/api/v1/doctors/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.userId).toBe(doctor.userId);
    expect(data.name).toBe(doctor.name);
    expect(data.hospitalClinic).toBe(doctor.hospitalClinic);
    expect(data.specialty).toBe(doctor.specialty);
    expect(data).toHaveProperty('qualifications');
    expect(data).toHaveProperty('medicalLicenseNumber');
    // Password must never be exposed
    expect(data).not.toHaveProperty('password');
  });
});

// ─── PUT /api/v1/doctors/me ───────────────────────────────────────────────────

describe('PUT /api/v1/doctors/me', () => {
  it('returns 401 for an unauthenticated update request', async () => {
    const res = await request(app)
      .put('/api/v1/doctors/me')
      .send({ hospitalClinic: 'New Hospital' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when a USER role attempts to update the doctor profile', async () => {
    const { user } = await seedUser({ userId: 'US90010', accountId: '90010' });
    const token = makeToken(user.userId, Role.USER);

    const res = await request(app)
      .put('/api/v1/doctors/me')
      .set(makeAuthHeader(token))
      .send({ hospitalClinic: 'New Hospital' });

    expect(res.status).toBe(403);
  });

  it('returns 200 and updates hospitalClinic, specialty, and qualifications', async () => {
    const { doctor } = await seedDoctor({ userId: 'DR90003' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    const updatePayload = {
      hospitalClinic: 'City General Hospital',
      specialty: 'Cardiology',
      qualifications: ['MBBS', 'MD', 'DM'],
      contactInfo: doctor.contactInfo,
      medicalLicenseNumber: doctor.medicalLicenseNumber,
      name: doctor.name,
    };

    const res = await request(app)
      .put('/api/v1/doctors/me')
      .set(makeAuthHeader(token))
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.hospitalClinic).toBe('City General Hospital');
    expect(data.specialty).toBe('Cardiology');
    expect(data.qualifications).toEqual(['MBBS', 'MD', 'DM']);
  });

  it('verifies the updated values persist in the database', async () => {
    const { doctor } = await seedDoctor({ userId: 'DR90004' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    await request(app)
      .put('/api/v1/doctors/me')
      .set(makeAuthHeader(token))
      .send({
        hospitalClinic: 'Apollo Hospitals',
        specialty: 'Neurology',
        qualifications: ['MBBS', 'DM Neurology'],
        contactInfo: doctor.contactInfo,
        medicalLicenseNumber: doctor.medicalLicenseNumber,
        name: doctor.name,
      });

    // Read directly from the DB to confirm persistence
    const persisted = await testPrisma.doctorProfile.findUnique({
      where: { userId: doctor.userId },
    });

    expect(persisted).not.toBeNull();
    expect(persisted!.hospitalClinic).toBe('Apollo Hospitals');
    expect(persisted!.specialty).toBe('Neurology');
    expect(persisted!.qualifications).toEqual(['MBBS', 'DM Neurology']);
  });
});
