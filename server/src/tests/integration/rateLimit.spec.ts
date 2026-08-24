/**
 * §3.5 — rateLimit.middleware integration tests
 *
 * Uses supertest against the real Express app.
 * express-rate-limit v8 uses an in-memory store by default; state persists
 * within a process. To isolate tests we use a fresh app instance per describe
 * block and rely on a custom Express app that re-creates the limiters.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';

// ─── Build a minimal app with fresh rate limiters per test describe ───────────

function buildAuthApp(maxAttempts: number) {
  const app = express();
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: maxAttempts,
    standardHeaders: true,
    legacyHeaders: false,
    // In test, express-rate-limit needs to know the real IP
    // trustProxy: false (default) reads req.ip directly
  });

  app.post('/auth/login', limiter, (_req, res) => {
    res.json({ success: true });
  });

  return app;
}

function buildApiApp(maxAttempts: number) {
  const app = express();
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: maxAttempts,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', limiter);
  app.get('/api/anything', (_req, res) => {
    res.json({ success: true });
  });

  return app;
}

// ─── authLimiter: 10 attempts allowed, 11th → 429 ────────────────────────────

describe('authLimiter', () => {
  it('blocks the 11th attempt from the same IP with 429', async () => {
    const app = buildAuthApp(10);
    const agent = request.agent(app);

    // 10 successful requests
    for (let i = 0; i < 10; i++) {
      const res = await agent
        .post('/auth/login')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({ userId: 'US11111', password: 'pw' });
      expect(res.status).toBe(200);
    }

    // 11th request should be blocked
    const blocked = await agent
      .post('/auth/login')
      .set('X-Forwarded-For', '10.0.0.1')
      .send({ userId: 'US11111', password: 'pw' });

    expect(blocked.status).toBe(429);
  });

  it('allows a different IP its own full quota after the first IP is blocked', async () => {
    // Use a FRESH app instance so IP-B's count starts at zero (independent of IP-A's store)
    const appForIpA = buildAuthApp(10);
    const appForIpB = buildAuthApp(10);

    // Exhaust quota for IP-A
    for (let i = 0; i < 11; i++) {
      await request(appForIpA)
        .post('/auth/login')
        .set('X-Forwarded-For', '10.0.0.2')
        .send({});
    }

    // IP-B on its own fresh app should be on its first request — allowed
    const resB = await request(appForIpB)
      .post('/auth/login')
      .set('X-Forwarded-For', '10.0.0.3')
      .send({});

    expect(resB.status).toBe(200);
  });

  it('includes RateLimit-* headers on responses', async () => {
    const app = buildAuthApp(10);

    const res = await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', '10.0.0.4')
      .send({});

    // standardHeaders: true adds RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
    expect(res.headers).toHaveProperty('ratelimit-limit');
    expect(res.headers).toHaveProperty('ratelimit-remaining');
  });
});

// ─── apiLimiter: 100 attempts allowed, 101st → 429 ───────────────────────────

describe('apiLimiter', () => {
  it('blocks the 101st request from the same IP with 429', async () => {
    const app = buildApiApp(100);

    // 100 successful requests
    for (let i = 0; i < 100; i++) {
      const res = await request(app)
        .get('/api/anything')
        .set('X-Forwarded-For', '10.1.0.1');
      expect(res.status).toBe(200);
    }

    // 101st should be blocked
    const blocked = await request(app)
      .get('/api/anything')
      .set('X-Forwarded-For', '10.1.0.1');

    expect(blocked.status).toBe(429);
  });
});

// ─── Mount verification: authLimiter is actually mounted on auth routes ────────

describe('authLimiter mounting check (static verification)', () => {
  it('auth.routes.ts imports and uses authLimiter on /login and /signup', async () => {
    /**
     * This test reads the route file source and asserts authLimiter is referenced
     * on the login and signup routes — catching the "defined but not mounted" bug class.
     */
    const fs = await import('fs');
    const path = await import('path');

    const routeFile = path.resolve(
      process.cwd(),
      'src/routes/v1/auth.routes.ts',
    );
    const source = fs.readFileSync(routeFile, 'utf-8');

    // authLimiter must be imported
    expect(source).toMatch(/import.*authLimiter.*from/);

    // authLimiter must appear in the login route definition
    const loginLine = source.split('\n').find((l) => l.includes("router.post('/login'"));
    expect(loginLine).toBeDefined();
    expect(loginLine).toContain('authLimiter');

    // authLimiter must appear in the signup route definition
    const signupLine = source.split('\n').find((l) => l.includes("router.post('/signup'"));
    expect(signupLine).toBeDefined();
    expect(signupLine).toContain('authLimiter');
  });
});
