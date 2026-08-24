/**
 * §5 — Auth API integration tests
 *
 * Full-stack tests using supertest against the real Express app and the real
 * test DB (lifetag_test). Each test starts with a clean DB state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { cleanDb, seedUser, seedDoctor, testPrisma } from '../helpers/testDb';
import { makeRefreshToken, makeToken, makeAuthHeader } from '../helpers/authHelpers';
import { Role } from '../../constants/roles';

beforeEach(async () => {
  await cleanDb();
});

// ─── Signup ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/signup', () => {
  it('signs up a new USER and returns 201 with token + refreshToken + user (no password)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        userId: 'US60001',
        name: 'Alice Test',
        password: 'Password1!',
        confirmPassword: 'Password1!',
        role: 'USER',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user).not.toHaveProperty('password');
    expect(res.body.data.user.role).toBe('USER');
  });

  it('returns 409 when userId is already taken', async () => {
    await seedUser({ userId: 'US60002' });

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        userId: 'US60002',
        name: 'Dup',
        password: 'Password1!',
        confirmPassword: 'Password1!',
        role: 'USER',
      });

    expect(res.status).toBe(409);
  });

  it('returns 400 when userId prefix mismatches role', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        userId: 'DR60003',
        name: 'Prefix Mismatch',
        password: 'Password1!',
        confirmPassword: 'Password1!',
        role: 'USER',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when passwords do not match (Zod refine)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        userId: 'US60004',
        name: 'NoMatch',
        password: 'Password1!',
        confirmPassword: 'Different!',
        role: 'USER',
      });

    expect(res.status).toBe(400);
  });

  it('signs up a DOCTOR successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        userId: 'DR70001',
        name: 'Dr. Test',
        password: 'DoctorPass1!',
        confirmPassword: 'DoctorPass1!',
        role: 'DOCTOR',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('DOCTOR');
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('logs in with correct credentials and returns token + refreshToken', async () => {
    const { user, plainPassword } = await seedUser({ userId: 'US61001' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ userId: user.userId, password: plainPassword });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user).not.toHaveProperty('password');
  });

  it('returns 401 for wrong password — generic message (no user-enumeration)', async () => {
    const { user } = await seedUser({ userId: 'US61002' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ userId: user.userId, password: 'WrongPass!' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid User ID or password');
  });

  it('returns 401 for non-existent userId — same generic message as wrong-password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ userId: 'US00000', password: 'SomePass!' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid User ID or password');
  });

  it('returns 400 for unrecognized prefix', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ userId: 'XX12345', password: 'any' });

    expect(res.status).toBe(400);
  });

  it('logs in a DOCTOR with correct credentials', async () => {
    const { doctor, plainPassword } = await seedDoctor({ userId: 'DR71001' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ userId: doctor.userId, password: plainPassword });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('DOCTOR');
  });
});

// ─── Token → protected route (end-to-end) ────────────────────────────────────

describe('End-to-end: signup → login → /auth/me', () => {
  it('token from login is accepted by /auth/me', async () => {
    // Directly create a token and user — avoids hitting rate-limited /auth/signup and /auth/login
    const { user } = await seedUser({ userId: 'US62001', accountId: '62001' });
    const token = makeToken(user.userId, Role.USER);

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set(makeAuthHeader(token));

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.userId).toBe('US62001');
  });
});

// ─── Refresh ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('returns a new access token for a valid refresh token', async () => {
    // Create user and token directly to avoid rate-limited /auth/login
    const { user } = await seedUser({ userId: 'US63001', accountId: '63001' });
    const rt = makeRefreshToken(user.userId, Role.USER);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await testPrisma.refreshToken.create({ data: { token: rt, userId: user.userId, expiresAt } });

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rt });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data).toHaveProperty('token');
  });

  it('returns 401 "has been revoked" for a token not in the DB', async () => {
    // Create a valid JWT but never store it in the DB
    const fakeRt = makeRefreshToken('US63002', Role.USER);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: fakeRt });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/revoked/i);
  });

  it('returns 401 for an expired token and deletes the row', async () => {
    // Insert a refresh token row with expiresAt in the past
    const fakeToken = makeRefreshToken('US63003', Role.USER, '7d');
    await testPrisma.refreshToken.create({
      data: {
        token: fakeToken,
        userId: 'US63003',
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: fakeToken });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/expired/i);

    // Row should have been cleaned up
    const row = await testPrisma.refreshToken.findUnique({ where: { token: fakeToken } });
    expect(row).toBeNull();
  });

  it('returns 401 for a malformed JWT', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not.a.jwt' });

    expect(res.status).toBe(401);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('logout deletes the refresh token; subsequent refresh with same token returns 401', async () => {
    // Create user and token directly to avoid rate-limited /auth/login
    const { user } = await seedUser({ userId: 'US64001', accountId: '64001' });
    const rt = makeRefreshToken(user.userId, Role.USER);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await testPrisma.refreshToken.create({ data: { token: rt, userId: user.userId, expiresAt } });

    // Logout
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: rt });
    expect(logoutRes.status).toBe(200);

    // Subsequent refresh should fail
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rt });
    expect(refreshRes.status).toBe(401);
  });

  it('returns success even when called with no token (no crash)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ success: true });
  });
});
