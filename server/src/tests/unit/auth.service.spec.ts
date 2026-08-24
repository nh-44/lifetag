/**
 * §3.1 — auth.service unit tests
 *
 * All Prisma calls are mocked via vi.mock so no real DB is needed.
 * bcrypt calls are also mocked to keep the suite fast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock dependencies BEFORE importing the module under test ──────────────
vi.mock('../../repositories/userRepository', () => ({
  userRepository: {
    findByUserId: vi.fn(),
    existsByUserId: vi.fn(),
    createWithProfile: vi.fn(),
  },
}));
vi.mock('../../repositories/doctorRepository', () => ({
  doctorRepository: {
    findByUserId: vi.fn(),
    existsByUserId: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('../../repositories/firstResponderRepository', () => ({
  firstResponderRepository: {
    findByUserId: vi.fn(),
    existsByUserId: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('../../utils/password.utils', () => ({
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  verifyPassword: vi.fn(async (plain: string, hash: string) => hash === `hashed:${plain}`),
}));
vi.mock('../../config/database', () => ({
  prisma: {
    refreshToken: {
      create: vi.fn(async () => ({ id: 'rt-id' })),
      findUnique: vi.fn(),
      delete: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}));

import { authService } from '../../services/auth.service';
import { userRepository } from '../../repositories/userRepository';
import { doctorRepository } from '../../repositories/doctorRepository';
import { firstResponderRepository } from '../../repositories/firstResponderRepository';
import { prisma } from '../../config/database';
import { Role } from '../../constants/roles';

// Typed mock helpers
const mockUserRepo = userRepository as {
  findByUserId: ReturnType<typeof vi.fn>;
  existsByUserId: ReturnType<typeof vi.fn>;
  createWithProfile: ReturnType<typeof vi.fn>;
};
const mockDoctorRepo = doctorRepository as {
  findByUserId: ReturnType<typeof vi.fn>;
  existsByUserId: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};
const mockFRRepo = firstResponderRepository as {
  findByUserId: ReturnType<typeof vi.fn>;
  existsByUserId: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};
const mockPrisma = prisma as unknown as {
  refreshToken: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('authService.login', () => {
  it('returns token + refreshToken + user (no password) for a valid US user', async () => {
    mockUserRepo.findByUserId.mockResolvedValue({
      userId: 'US12345',
      name: 'Alice',
      password: 'hashed:Password1!',
    });

    const result = await authService.login({ userId: 'US12345', password: 'Password1!' });

    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).toMatchObject({ userId: 'US12345', role: Role.USER });
  });

  it('returns token + refreshToken + user for a valid DR doctor', async () => {
    mockDoctorRepo.findByUserId.mockResolvedValue({
      userId: 'DR54321',
      name: 'Dr. Bob',
      password: 'hashed:Pass123!',
    });

    const result = await authService.login({ userId: 'DR54321', password: 'Pass123!' });

    expect(result.user).toMatchObject({ role: Role.DOCTOR });
    expect(result.user).not.toHaveProperty('password');
  });

  it('returns token for a valid FR first responder', async () => {
    mockFRRepo.findByUserId.mockResolvedValue({
      userId: 'FR99999',
      name: 'Frank',
      password: 'hashed:Resp0nd!',
    });

    const result = await authService.login({ userId: 'FR99999', password: 'Resp0nd!' });

    expect(result.user).toMatchObject({ role: Role.FIRST_RESPONDER });
  });

  it('throws 400 for an unrecognized prefix', async () => {
    await expect(
      authService.login({ userId: 'XX12345', password: 'any' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 401 for a non-existent userId — same generic message as wrong-password', async () => {
    mockUserRepo.findByUserId.mockResolvedValue(null);

    const err = await authService
      .login({ userId: 'US00001', password: 'irrelevant' })
      .catch((e) => e);

    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Invalid User ID or password');
  });

  it('throws 401 for a wrong password — same generic message as missing user', async () => {
    mockUserRepo.findByUserId.mockResolvedValue({
      userId: 'US00002',
      name: 'Carla',
      password: 'hashed:RealPass!',
    });

    const err = await authService
      .login({ userId: 'US00002', password: 'WrongPass!' })
      .catch((e) => e);

    expect(err.statusCode).toBe(401);
    // Must be the same message — no user enumeration
    expect(err.message).toBe('Invalid User ID or password');
  });

  it('saves a RefreshToken row to the DB on successful login', async () => {
    mockUserRepo.findByUserId.mockResolvedValue({
      userId: 'US11111',
      name: 'Dave',
      password: 'hashed:Pwd123!',
    });

    await authService.login({ userId: 'US11111', password: 'Pwd123!' });

    expect(mockPrisma.refreshToken.create).toHaveBeenCalledOnce();
  });
});

// ─── signup ───────────────────────────────────────────────────────────────────

describe('authService.signup', () => {
  it('throws 400 when US role is given a non-US userId prefix', async () => {
    await expect(
      authService.signup({
        userId: 'DR12345',
        name: 'Mismatch',
        password: 'Abc123!',
        confirmPassword: 'Abc123!',
        role: Role.USER,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when DOCTOR role is given a non-DR prefix', async () => {
    await expect(
      authService.signup({
        userId: 'US12345',
        name: 'Mismatch',
        password: 'Abc123!',
        confirmPassword: 'Abc123!',
        role: Role.DOCTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when FIRST_RESPONDER role is given a non-FR prefix', async () => {
    await expect(
      authService.signup({
        userId: 'DR12345',
        name: 'Mismatch',
        password: 'Abc123!',
        confirmPassword: 'Abc123!',
        role: Role.FIRST_RESPONDER,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 409 when userId is already taken', async () => {
    mockUserRepo.existsByUserId.mockResolvedValue(true);

    await expect(
      authService.signup({
        userId: 'US11111',
        name: 'Dup',
        password: 'Abc123!',
        confirmPassword: 'Abc123!',
        role: Role.USER,
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: 'User ID is already taken' });
  });

  it('successfully signs up a USER and returns token + refreshToken + user without password', async () => {
    mockUserRepo.existsByUserId.mockResolvedValue(false);
    mockUserRepo.createWithProfile.mockResolvedValue({
      userId: 'US22222',
      accountId: '22222',
      name: 'Eve',
      password: 'hashed:Eve123!',
      role: 'USER',
    });

    const result = await authService.signup({
      userId: 'US22222',
      name: 'Eve',
      password: 'Eve123!',
      confirmPassword: 'Eve123!',
      role: Role.USER,
    });

    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).toMatchObject({ role: Role.USER });
  });

  it('successfully signs up a DOCTOR', async () => {
    mockDoctorRepo.existsByUserId.mockResolvedValue(false);
    mockDoctorRepo.create.mockResolvedValue({
      userId: 'DR33333',
      name: 'Dr. Frank',
      password: 'hashed:Frank!',
    });

    const result = await authService.signup({
      userId: 'DR33333',
      name: 'Dr. Frank',
      password: 'Frank!',
      confirmPassword: 'Frank!',
      role: Role.DOCTOR,
    });

    expect(result.user).toMatchObject({ role: Role.DOCTOR });
  });

  it('successfully signs up a FIRST_RESPONDER', async () => {
    mockFRRepo.existsByUserId.mockResolvedValue(false);
    mockFRRepo.create.mockResolvedValue({
      userId: 'FR44444',
      name: 'Gary',
      password: 'hashed:Gary!',
    });

    const result = await authService.signup({
      userId: 'FR44444',
      name: 'Gary',
      password: 'Gary!',
      confirmPassword: 'Gary!',
      role: Role.FIRST_RESPONDER,
    });

    expect(result.user).toMatchObject({ role: Role.FIRST_RESPONDER });
  });
});

// ─── refresh ──────────────────────────────────────────────────────────────────

describe('authService.refresh', () => {
  it('returns a new access token for a valid, unexpired, non-revoked refresh token', async () => {
    const { makeRefreshToken } = await import('../helpers/authHelpers');
    const rt = makeRefreshToken('US55555', Role.USER);

    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      token: rt,
      userId: 'US55555',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    });

    const result = await authService.refresh(rt);

    expect(result).toHaveProperty('token');
  });

  it('throws 401 "has been revoked" when token is not in the DB', async () => {
    const { makeRefreshToken } = await import('../helpers/authHelpers');
    const rt = makeRefreshToken('US55555', Role.USER);
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

    const err = await authService.refresh(rt).catch((e) => e);

    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/revoked/i);
  });

  it('throws 401 and deletes the expired row when token is past its expiresAt', async () => {
    const { makeRefreshToken } = await import('../helpers/authHelpers');
    const rt = makeRefreshToken('US55555', Role.USER, '7d');

    // Stored as expired (expiresAt is in the past)
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-expired',
      token: rt,
      userId: 'US55555',
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    });

    const err = await authService.refresh(rt).catch((e) => e);

    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/expired/i);
    // Confirm the stale row was cleaned up
    expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({
      where: { id: 'rt-expired' },
    });
  });

  it('throws 401 before DB lookup when the JWT itself is malformed', async () => {
    const err = await authService.refresh('not.a.jwt').catch((e) => e);

    expect(err.statusCode).toBe(401);
    // DB should never have been queried
    expect(mockPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it('throws 401 before DB lookup when the JWT signature is expired (-1s)', async () => {
    const { makeExpiredToken } = await import('../helpers/authHelpers');
    const expiredJwt = makeExpiredToken('US55555', Role.USER);

    const err = await authService.refresh(expiredJwt).catch((e) => e);

    expect(err.statusCode).toBe(401);
    expect(mockPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

describe('authService.logout', () => {
  it('deletes the matching RefreshToken row and returns success', async () => {
    const result = await authService.logout('some-valid-rt');

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'some-valid-rt' },
    });
    expect(result).toEqual({ success: true });
  });

  it('returns success without crashing when called with no token', async () => {
    const result = await authService.logout('');

    expect(result).toEqual({ success: true });
    // deleteMany should NOT have been called for empty token
    expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});
