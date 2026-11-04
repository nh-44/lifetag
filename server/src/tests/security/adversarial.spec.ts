/**
 * §6 — Security / Adversarial tests (non-crypto cases)
 *
 * Tests system-level security properties:
 *   - Hardcoded admin password P0 check
 *   - Rate-limit actually mounted (not just defined)
 *   - Cross-role token reuse blocked at the route layer
 *   - Server derives role from JWT (not from client-supplied body field)
 */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { cleanDb, seedUser, seedDoctor, testPrisma } from '../helpers/testDb';
import { buildTag, installTestAuthority, AuthorityFixture } from '../helpers/tagFactory';
import { makeToken, makeAuthHeader } from '../helpers/authHelpers';
import { Role } from '../../constants/roles';
import { beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

beforeEach(async () => {
  await cleanDb();
});

// ─── P0: Hardcoded admin password check ───────────────────────────────────────

describe('P0: Hardcoded admin password', () => {
  it('no hardcoded "00000" admin password exists anywhere in the client source', async () => {
    /**
     * This test scans the client source for the hardcoded "00000" password
     * that exists in the AdminPanel component. It intentionally FAILS in
     * production mode as a CI gate.
     *
     * Status: P0 — Do not ship to production until this constant is replaced
     * with an environment-variable-backed secret.
     *
     * Action required: Replace the hardcoded "00000" in AdminPanel.tsx with
     * process.env.ADMIN_PASSWORD or a proper session mechanism.
     */
    const fs = await import('fs');
    const path = await import('path');

    // Search in client source
    const clientSrc = path.resolve(process.cwd(), '../client/src');
    let found = false;
    let foundFile = '';

    function searchDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          searchDir(fullPath);
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes('"00000"') || content.includes("'00000'")) {
            found = true;
            foundFile = fullPath;
          }
        }
      }
    }

    searchDir(clientSrc);

    // The client-side admin password was replaced by DOCTOR-role issuance
    // (POST /issuance/certify); it must never come back.
    expect(found, `Hardcoded admin password "00000" found in ${foundFile}`).toBe(false);
  });
});

// ─── Rate-limit mounting verification ─────────────────────────────────────────

describe('Rate-limit mounting: authLimiter is mounted on /auth/login and /auth/signup', () => {
  it('auth.routes.ts actually references authLimiter in the route definitions', () => {
    /**
     * A middleware defined-but-unmounted is a common real bug class.
     * This test performs static analysis on the route file to confirm
     * authLimiter is wired into the route declarations, not just imported.
     */
    const routeFilePath = path.resolve(process.cwd(), 'src/routes/v1/auth.routes.ts');
    const source = fs.readFileSync(routeFilePath, 'utf-8') as string;

    // Must be imported
    expect(source).toMatch(/import.*\bauthLimiter\b/);

    // Must appear on the login line (not just imported)
    const loginLine = source.split('\n').find((l: string) => l.match(/router\.post.*\/login/));
    expect(loginLine).toBeDefined();
    expect(loginLine).toContain('authLimiter');

    // Must appear on the signup line
    const signupLine = source.split('\n').find((l: string) => l.match(/router\.post.*\/signup/));
    expect(signupLine).toBeDefined();
    expect(signupLine).toContain('authLimiter');
  });

  it('app.ts mounts apiLimiter on /api/v1 (not just defined)', () => {
    const appFilePath = path.resolve(process.cwd(), 'src/app.ts');
    const source = fs.readFileSync(appFilePath, 'utf-8') as string;

    expect(source).toMatch(/import.*\bapiLimiter\b/);
    // The mounting line: app.use('/api/v1', apiLimiter, v1Router)
    const mountLine = source.split('\n').find(
      (l: string) => l.includes("app.use('/api/v1'") || l.includes('app.use("/api/v1"'),
    );
    expect(mountLine).toBeDefined();
    expect(mountLine).toContain('apiLimiter');
  });
});

// ─── Cross-role token reuse ───────────────────────────────────────────────────

describe('Cross-role token reuse: FIRST_RESPONDER token rejected on DOCTOR-only routes', () => {
  it('a token issued for FIRST_RESPONDER role cannot access the medical (doctor-only) route', async () => {
    const { user } = await seedUser({ userId: 'US95001', accountId: '95001' });
    const frToken = makeToken('FR95001', Role.FIRST_RESPONDER);

    const res = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(frToken));

    // 403 from RBAC — role from JWT is FIRST_RESPONDER, route requires DOCTOR
    expect(res.status).toBe(403);
  });

  it('a token issued for USER role cannot access doctor-only routes', async () => {
    const { user } = await seedUser({ userId: 'US95002', accountId: '95002' });
    const userToken = makeToken('US95002', Role.USER);

    const res = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(userToken));

    expect(res.status).toBe(403);
  });

  it('RBAC reads role from verified JWT payload, not from request body', async () => {
    /**
     * Confirms the server does NOT read a "role" field from req.body and use it
     * for authorization. The role must come exclusively from the verified JWT.
     *
     * Attack scenario: attacker sends { role: "DOCTOR" } in the body alongside
     * a FIRST_RESPONDER token — access must still be denied.
     */
    const { user } = await seedUser({ userId: 'US95003', accountId: '95003' });
    const frToken = makeToken('FR95003', Role.FIRST_RESPONDER);

    const res = await request(app)
      .get(`/api/v1/patients/medical/${user.accountId}`)
      .set(makeAuthHeader(frToken))
      .send({ role: 'DOCTOR' }); // attacker-supplied role field in body

    // Must still be 403 — body role field is ignored
    expect(res.status).toBe(403);
  });
});

// ─── Token integrity: tampered JWT is rejected ────────────────────────────────

describe('Tampered JWT is rejected by authMiddleware before reaching any route logic', () => {
  it('returns 401 for a token with a corrupted signature', async () => {
    const { makeTamperedToken } = await import('../helpers/authHelpers');
    const tampered = makeTamperedToken('DR99999', Role.DOCTOR);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(makeAuthHeader(tampered));

    expect(res.status).toBe(401);
  });
});

// ─── Crypto Adversarial: tag-level attacks against the consent gate ───────────
//
// Policy (decideScanOutcome): every verified, patient-bound scan is logged for the
// audit trail, but only a current authority-certified tag is `certified`, and only
// that opens the doctor's consent window.

async function scanThenRequestRecords(drToken: string, patientAccount: string, tagPayload: unknown) {
  const scanRes = await request(app)
    .post('/api/v1/scans')
    .set(makeAuthHeader(drToken))
    .send({ patientAccount, deviceMeta: 'Attacker Device [Authority-Certified]', tagPayload });
  const medicalRes = await request(app)
    .get(`/api/v1/patients/medical/${patientAccount}`)
    .set(makeAuthHeader(drToken));
  return { scanRes, medicalRes };
}

describe('Crypto Adversarial: consent gate cannot be unlocked by a weak or foreign tag', () => {
  let authority: AuthorityFixture;
  beforeEach(() => { authority = installTestAuthority(); });
  afterEach(() => authority.restore());

  it("REGRESSION: a certified tag for patient A cannot unlock patient B's records", async () => {
    const { user: patientA } = await seedUser({ userId: 'US99010', accountId: '99010' });
    const { user: patientB } = await seedUser({ userId: 'US99011', accountId: '99011' });
    await seedDoctor({ userId: 'DR99010' });
    const drToken = makeToken('DR99010', Role.DOCTOR);

    const issuedAtSec = Math.floor(Date.now() / 1000);
    const tagA = buildTag({ fhirPatientId: patientA.accountId, issuedAtSec, authorityKey: authority.privateKey });
    await testPrisma.triageProfile.update({ where: { userId: patientA.userId }, data: { tagIssuedAt: new Date(issuedAtSec * 1000) } });

    const { scanRes, medicalRes } = await scanThenRequestRecords(drToken, patientB.accountId, tagA);
    expect(scanRes.status).toBe(400);
    expect(medicalRes.status).toBe(403);
  });

  it('a superseded (re-issued) tag never grants access, even though its signatures are valid', async () => {
    const { user: patient } = await seedUser({ userId: 'US99001', accountId: '99001' });
    await seedDoctor({ userId: 'DR99001' });
    const drToken = makeToken('DR99001', Role.DOCTOR);

    const oldIssuedAt = Math.floor(Date.now() / 1000) - 90 * 86400;
    const oldTag = buildTag({ fhirPatientId: patient.accountId, issuedAtSec: oldIssuedAt, authorityKey: authority.privateKey });
    // The patient has since been issued a newer tag
    await testPrisma.triageProfile.update({ where: { userId: patient.userId }, data: { tagIssuedAt: new Date() } });

    const { scanRes, medicalRes } = await scanThenRequestRecords(drToken, patient.accountId, oldTag);
    expect(scanRes.status).toBe(201);
    expect(scanRes.body.data).toMatchObject({ certified: false, freshness: 'superseded' });
    expect(scanRes.body.data.alert).toMatch(/newer tag/);
    expect(medicalRes.status).toBe(403);
  });

  it('a revoked tag never grants access', async () => {
    const { user: patient } = await seedUser({ userId: 'US99002', accountId: '99002' });
    await seedDoctor({ userId: 'DR99002' });
    const drToken = makeToken('DR99002', Role.DOCTOR);

    const issuedAtSec = Math.floor(Date.now() / 1000) - 60;
    const tag = buildTag({ fhirPatientId: patient.accountId, issuedAtSec, authorityKey: authority.privateKey });
    await testPrisma.triageProfile.update({
      where: { userId: patient.userId },
      data: { tagIssuedAt: new Date(issuedAtSec * 1000), tagRevokedAt: new Date() },
    });

    const { scanRes, medicalRes } = await scanThenRequestRecords(drToken, patient.accountId, tag);
    expect(scanRes.status).toBe(201); // logged: the patient can see their revoked tag was used
    expect(scanRes.body.data).toMatchObject({ certified: false, freshness: 'revoked' });
    expect(scanRes.body.data.alert).toMatch(/revoked/);
    expect(medicalRes.status).toBe(403);
  });

  it('a self-signed tag never grants access, even when deviceMeta claims certification', async () => {
    const { user: patient } = await seedUser({ userId: 'US99003', accountId: '99003' });
    await seedDoctor({ userId: 'DR99003' });
    const drToken = makeToken('DR99003', Role.DOCTOR);

    const selfSigned = buildTag({ fhirPatientId: patient.accountId, authorityKey: null });
    const { scanRes, medicalRes } = await scanThenRequestRecords(drToken, patient.accountId, selfSigned);
    expect(scanRes.status).toBe(201);
    const row = await testPrisma.scanAuditLog.findFirst({ where: { scannedBy: 'DR99003' } });
    expect(row!.certified).toBe(false);
    expect(row!.deviceMeta).toContain('[Authority-Certified]'); // the spoofed text is stored, and ignored
    expect(medicalRes.status).toBe(403);
  });

  it('the current, certified tag for the right patient does grant access (control)', async () => {
    const { user: patient } = await seedUser({ userId: 'US99004', accountId: '99004' });
    await seedDoctor({ userId: 'DR99004' });
    const drToken = makeToken('DR99004', Role.DOCTOR);

    const issuedAtSec = Math.floor(Date.now() / 1000);
    const tag = buildTag({ fhirPatientId: patient.accountId, issuedAtSec, authorityKey: authority.privateKey });
    await testPrisma.triageProfile.update({ where: { userId: patient.userId }, data: { tagIssuedAt: new Date(issuedAtSec * 1000) } });

    const { scanRes, medicalRes } = await scanThenRequestRecords(drToken, patient.accountId, tag);
    expect(scanRes.status).toBe(201);
    expect(medicalRes.status).toBe(200);
  });
});

// ─── Unauthorized issuance: self-registration does not grant clinical access ──

describe('Unauthorized issuance via self-registration', () => {
  it('REGRESSION: a doctor account created through /auth/signup cannot certify tags until verified', async () => {
    const authority = installTestAuthority();
    try {
      const { user: patient } = await seedUser({ userId: 'US99020', accountId: '99020' });
      const signup = await request(app).post('/api/v1/auth/signup').send({
        userId: 'DR99020', name: 'Self-Made Doctor', password: 'Password1!', confirmPassword: 'Password1!', role: 'DOCTOR',
      });
      expect(signup.status).toBe(201);
      expect(signup.body.data.user.verified).toBe(false);

      const certify = await request(app)
        .post('/api/v1/issuance/certify')
        .set(makeAuthHeader(signup.body.data.token))
        .send({ accountId: patient.accountId, publicKey: { x: 'A'.repeat(43), y: 'B'.repeat(43) }, issuedAt: Math.floor(Date.now() / 1000) });
      expect(certify.status).toBe(403);
      expect(certify.body.error.message).toMatch(/awaiting verification/);

      // The same request from a verified doctor passes the gate (and fails later only on the bogus key)
      await testPrisma.doctorProfile.update({ where: { userId: 'DR99020' }, data: { verified: true } });
      const again = await request(app)
        .post('/api/v1/issuance/certify')
        .set(makeAuthHeader(signup.body.data.token))
        .send({ accountId: patient.accountId, publicKey: { x: 'A'.repeat(43), y: 'B'.repeat(43) }, issuedAt: Math.floor(Date.now() / 1000) });
      expect(again.status).toBe(400);
    } finally {
      authority.restore();
    }
  });

  it('REGRESSION: a refresh token is not accepted as a bearer access token', async () => {
    const { makeRefreshToken } = await import('../helpers/authHelpers');
    await seedUser({ userId: 'US99021', accountId: '99021' });
    const res = await request(app)
      .get('/api/v1/patients/me')
      .set(makeAuthHeader(makeRefreshToken('US99021', Role.USER)));
    expect(res.status).toBe(401);
  });
});
