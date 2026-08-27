/**
 * §5 — First Responder Profile API integration tests
 *
 * Covers GET /api/v1/first-responders/me and PUT /api/v1/first-responders/me.
 * Tests RBAC enforcement (401/403), profile retrieval (200),
 * missing-record handling (404), and all organizationType enum conversions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import {
  cleanDb,
  seedFirstResponder,
  seedUser,
  seedDoctor,
  testPrisma,
} from '../helpers/testDb';
import { makeToken, makeAuthHeader } from '../helpers/authHelpers';
import { Role } from '../../constants/roles';

beforeEach(async () => {
  await cleanDb();
});

// ─── GET /api/v1/first-responders/me ─────────────────────────────────────────

describe('GET /api/v1/first-responders/me', () => {
  it('returns 401 for an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/first-responders/me');

    expect(res.status).toBe(401);
  });

  it('returns 403 when a USER role requests the first-responder route (RBAC)', async () => {
    const { user } = await seedUser({ userId: 'US91001', accountId: '91001' });
    const token = makeToken(user.userId, Role.USER);

    const res = await request(app)
      .get('/api/v1/first-responders/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 403 when a DOCTOR role requests the first-responder route (RBAC)', async () => {
    const { doctor } = await seedDoctor({ userId: 'DR91001' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    const res = await request(app)
      .get('/api/v1/first-responders/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 404 when the authenticated FIRST_RESPONDER has no record in the DB', async () => {
    // Token for a userId with no FirstResponderProfile row
    const token = makeToken('FR99999', Role.FIRST_RESPONDER);

    const res = await request(app)
      .get('/api/v1/first-responders/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(404);
  });

  it('returns 200 with the responder profile for an authenticated FIRST_RESPONDER', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR91002' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);

    const res = await request(app)
      .get('/api/v1/first-responders/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.userId).toBe(responder.userId);
    expect(data.name).toBe(responder.name);
    expect(data.agency).toBe(responder.agency);
    expect(data.occupation).toBe(responder.occupation);
    expect(data).toHaveProperty('organizationType');
    expect(data).toHaveProperty('qualification');
    // Password must never be exposed
    expect(data).not.toHaveProperty('password');
  });

  it('returns organizationType as "Government" for seeded GOVERNMENT enum value', async () => {
    // seedFirstResponder uses organizationType: GOVERNMENT by default
    const { responder } = await seedFirstResponder({ userId: 'FR91003' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);

    const res = await request(app)
      .get('/api/v1/first-responders/me')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.data.organizationType).toBe('Government');
  });
});

// ─── PUT /api/v1/first-responders/me ─────────────────────────────────────────

describe('PUT /api/v1/first-responders/me', () => {
  it('returns 401 for an unauthenticated update request', async () => {
    const res = await request(app)
      .put('/api/v1/first-responders/me')
      .send({ agency: 'New Agency' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when a USER role attempts to update the responder profile', async () => {
    const { user } = await seedUser({ userId: 'US91010', accountId: '91010' });
    const token = makeToken(user.userId, Role.USER);

    const res = await request(app)
      .put('/api/v1/first-responders/me')
      .set(makeAuthHeader(token))
      .send({ agency: 'New Agency' });

    expect(res.status).toBe(403);
  });

  it('returns 200 and updates agency and occupation', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR91004' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);

    const res = await request(app)
      .put('/api/v1/first-responders/me')
      .set(makeAuthHeader(token))
      .send({
        agency: 'Metro Fire Department',
        occupation: 'Firefighter',
        organizationType: 'Government',
        name: responder.name,
        contactInfo: responder.contactInfo,
        agencyId: responder.agencyId,
        qualification: responder.qualification,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.agency).toBe('Metro Fire Department');
    expect(res.body.data.occupation).toBe('Firefighter');
  });

  it('correctly converts organizationType "Government" → GOVERNMENT enum and returns "Government"', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR91005' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);

    const res = await request(app)
      .put('/api/v1/first-responders/me')
      .set(makeAuthHeader(token))
      .send({
        agency: responder.agency,
        occupation: responder.occupation,
        organizationType: 'Government',
        name: responder.name,
        contactInfo: responder.contactInfo,
        agencyId: responder.agencyId,
        qualification: responder.qualification,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.organizationType).toBe('Government');

    // Verify DB stores the Prisma enum value
    const persisted = await testPrisma.firstResponderProfile.findUnique({
      where: { userId: responder.userId },
    });
    expect(persisted!.organizationType).toBe('GOVERNMENT');
  });

  it('correctly converts organizationType "Private" → PRIVATE enum and returns "Private"', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR91006' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);

    const res = await request(app)
      .put('/api/v1/first-responders/me')
      .set(makeAuthHeader(token))
      .send({
        agency: responder.agency,
        occupation: responder.occupation,
        organizationType: 'Private',
        name: responder.name,
        contactInfo: responder.contactInfo,
        agencyId: responder.agencyId,
        qualification: responder.qualification,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.organizationType).toBe('Private');

    const persisted = await testPrisma.firstResponderProfile.findUnique({
      where: { userId: responder.userId },
    });
    expect(persisted!.organizationType).toBe('PRIVATE');
  });

  it('correctly converts organizationType "Government Funded" → GOVERNMENT_FUNDED enum and returns "Government Funded"', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR91007' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);

    const res = await request(app)
      .put('/api/v1/first-responders/me')
      .set(makeAuthHeader(token))
      .send({
        agency: responder.agency,
        occupation: responder.occupation,
        organizationType: 'Government Funded',
        name: responder.name,
        contactInfo: responder.contactInfo,
        agencyId: responder.agencyId,
        qualification: responder.qualification,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.organizationType).toBe('Government Funded');

    const persisted = await testPrisma.firstResponderProfile.findUnique({
      where: { userId: responder.userId },
    });
    expect(persisted!.organizationType).toBe('GOVERNMENT_FUNDED');
  });

  it('verifies all updated fields persist in the database', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR91008' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);

    const res = await request(app)
      .put('/api/v1/first-responders/me')
      .set(makeAuthHeader(token))
      .send({
        agency: 'National Ambulance Service',
        occupation: 'Advanced Paramedic',
        organizationType: 'Government',
        name: 'Updated Name',
        contactInfo: '555-9999',
        agencyId: 'NAS-007',
        qualification: 'EMT-Advanced',
      });

    expect(res.status).toBe(200);

    const persisted = await testPrisma.firstResponderProfile.findUnique({
      where: { userId: responder.userId },
    });

    expect(persisted).not.toBeNull();
    expect(persisted!.agency).toBe('National Ambulance Service');
    expect(persisted!.occupation).toBe('Advanced Paramedic');
    expect(persisted!.name).toBe('Updated Name');
    expect(persisted!.qualification).toBe('EMT-Advanced');
  });
});
