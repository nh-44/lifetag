/**
 * §5 — Scans API integration tests
 *
 * Tests POST /scans (audit log), GET /scans/history, and confirms that
 * a freshly logged scan is immediately visible to the consent check.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import {
  cleanDb,
  seedUser,
  seedDoctor,
  seedFirstResponder,
  testPrisma,
} from '../helpers/testDb';
import { makeToken, makeAuthHeader } from '../helpers/authHelpers';
import { Role } from '../../constants/roles';

// Real v3 tags signed with a throwaway authority key (see helpers/tagFactory).
// Verification is NOT mocked: these tests run the production crypto path.
import { afterEach } from 'vitest';
import { buildTag, installTestAuthority, AuthorityFixture } from '../helpers/tagFactory';

let authority: AuthorityFixture;
let MOCK_TAG_PAYLOAD: ReturnType<typeof buildTag>;

/** Issues a certified tag for the patient and records it as their current issuance. */
async function issueCurrentTag(user: { userId: string; accountId: string }) {
  const issuedAtSec = Math.floor(Date.now() / 1000);
  await testPrisma.triageProfile.update({
    where: { userId: user.userId },
    data: { tagIssuedAt: new Date(issuedAtSec * 1000) },
  });
  return buildTag({ fhirPatientId: user.accountId, issuedAtSec, authorityKey: authority.privateKey });
}

afterEach(() => authority.restore());

beforeEach(async () => {
  await cleanDb();
  authority = installTestAuthority();
  MOCK_TAG_PAYLOAD = buildTag({ fhirPatientId: '90001', authorityKey: authority.privateKey });
});

// ─── POST /api/v1/scans ───────────────────────────────────────────────────────

describe('POST /api/v1/scans', () => {
  it('returns 401 for unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/v1/scans')
      .send({ patientAccount: '90001', tagPayload: MOCK_TAG_PAYLOAD });

    expect(res.status).toBe(401);
  });

  it('returns 403 when a USER role tries to log a scan', async () => {
    const token = makeToken('US90001', Role.USER);

    const res = await request(app)
      .post('/api/v1/scans')
      .set(makeAuthHeader(token))
      .send({ patientAccount: '90001', tagPayload: MOCK_TAG_PAYLOAD });

    expect(res.status).toBe(403);
  });

  it('returns 400 when missing tagPayload.signature', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR90001' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);
    const { user } = await seedUser({ userId: 'US90001', accountId: '90001' });

    const malformedPayload = { ...MOCK_TAG_PAYLOAD };
    delete (malformedPayload as any).signature;

    const res = await request(app)
      .post('/api/v1/scans')
      .set(makeAuthHeader(token))
      .send({
        patientAccount: user.accountId,
        tagPayload: malformedPayload,
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when missing tagPayload.tagId', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR90001' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);
    const { user } = await seedUser({ userId: 'US90001', accountId: '90001' });

    const malformedPayload = { ...MOCK_TAG_PAYLOAD };
    delete (malformedPayload as any).tagId;

    const res = await request(app)
      .post('/api/v1/scans')
      .set(makeAuthHeader(token))
      .send({
        patientAccount: user.accountId,
        tagPayload: malformedPayload,
      });

    expect(res.status).toBe(400);
  });

  it('creates an audit row for a valid FR scan and returns 201', async () => {
    const { responder } = await seedFirstResponder({ userId: 'FR90001' });
    const token = makeToken(responder.userId, Role.FIRST_RESPONDER);
    const { user } = await seedUser({ userId: 'US90001', accountId: '90001' });
    const tagPayload = await issueCurrentTag(user);

    const res = await request(app)
      .post('/api/v1/scans')
      .set(makeAuthHeader(token))
      .send({
        patientAccount: user.accountId,
        tagPayload,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.certified).toBe(true);
    expect(res.body.data.freshness).toBe('current');

    // Confirm the row landed in the DB immediately
    const row = await testPrisma.scanAuditLog.findFirst({
      where: { scannedBy: responder.userId, patientAccount: user.accountId },
    });
    expect(row).not.toBeNull();
  });

  it('scan row is immediately visible to the consent check (no staleness)', async () => {
    /**
     * This is the critical real-time consent freshness test.
     * Flow:
     *   1. Doctor has no relationship + no scan → GET /medical → 403
     *   2. Doctor logs a scan via POST /scans
     *   3. Doctor retries GET /medical → 200 (consent check sees the fresh row)
     */
    const { user } = await seedUser({ userId: 'US90002', accountId: '90002' });
    const { doctor } = await seedDoctor({ userId: 'DR90002' });
    const token = makeToken(doctor.userId, Role.DOCTOR);

    // Step 1: No access
    const before = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(token));
    expect(before.status).toBe(403);

    // Step 2: Log scan
    const tagPayload = await issueCurrentTag(user);
    await request(app)
      .post('/api/v1/scans')
      .set(makeAuthHeader(token))
      .send({ patientAccount: user.accountId, tagPayload });

    // Step 3: Access granted immediately
    const after = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(token));
    expect(after.status).toBe(200);
  });
});

// ─── GET /api/v1/scans/history ────────────────────────────────────────────────

describe('GET /api/v1/scans/history', () => {
  it('returns only scan rows for the authenticated scanner', async () => {
    const { responder: fr1 } = await seedFirstResponder({ userId: 'FR91001' });
    const { responder: fr2 } = await seedFirstResponder({ userId: 'FR91002' });
    const token1 = makeToken(fr1.userId, Role.FIRST_RESPONDER);

    // Seed scans for both responders
    await testPrisma.scanAuditLog.createMany({
      data: [
        { scannedBy: fr1.userId, patientAccount: '00001', timestamp: new Date() },
        { scannedBy: fr1.userId, patientAccount: '00002', timestamp: new Date() },
        { scannedBy: fr2.userId, patientAccount: '00003', timestamp: new Date() },
      ],
    });

    const res = await request(app)
      .get('/api/v1/scans/history')
      .set(makeAuthHeader(token1));

    expect(res.status).toBe(200);
    const history = res.body.data;
    expect(history).toHaveLength(2);
    expect(history.every((s: any) => s.scannedBy === fr1.userId)).toBe(true);
  });
});

// ─── GET /api/v1/scans/export ─────────────────────────────────────────────────

describe('GET /api/v1/scans/export', () => {
  it('returns a CSV file with correct headers and formatted rows', async () => {
    const { responder: fr } = await seedFirstResponder({ userId: 'FR92001' });
    const token = makeToken(fr.userId, Role.FIRST_RESPONDER);

    await testPrisma.scanAuditLog.create({
      data: { scannedBy: fr.userId, patientAccount: '00001', timestamp: new Date(), deviceMeta: 'Test Device [Self-Signed]' },
    });

    const res = await request(app)
      .get('/api/v1/scans/export')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment; filename="scan-history.csv"');
    
    // Check CSV contents
    const lines = res.text.split('\n');
    expect(lines[0]).toBe('id,patientAccount,timestamp,certified,tagFreshness,deviceMeta');
    expect(lines[1]).toContain('00001');
    expect(lines[1]).toContain('Test Device [Self-Signed]');
  });

  it('returns 404 when no scans exist for the user', async () => {
    const { responder: fr } = await seedFirstResponder({ userId: 'FR92002' });
    const token = makeToken(fr.userId, Role.FIRST_RESPONDER);

    const res = await request(app)
      .get('/api/v1/scans/export')
      .set(makeAuthHeader(token));

    expect(res.status).toBe(404);
  });
});
