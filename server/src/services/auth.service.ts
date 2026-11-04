import { prisma } from '../config/database';
import { userRepository } from '../repositories/userRepository';
import { doctorRepository } from '../repositories/doctorRepository';
import { firstResponderRepository } from '../repositories/firstResponderRepository';
import { hashPassword, verifyPassword, verifyAgainstDummy } from '../utils/password.utils';
import { generateToken, generateRefreshToken, verifyRefreshToken, hashRefreshToken } from '../utils/jwt.utils';
import { LoginRequestBody, SignupRequestBody } from '../types/auth.types';
import { Role } from '../constants/roles';

interface UserRecord {
  userId: string;
  name: string;
  password: string;
  [key: string]: unknown;
}

const stripPassword = <T extends { password: string }>(record: T): Omit<T, 'password'> => {
  const { password: _pwd, ...rest } = record;
  return rest;
};

/** How long an exchanged refresh token may still be presented (concurrent tabs) before it counts as reuse. */
const ROTATION_GRACE_MS = 30_000;

/** Creates and stores (hashed) a 7-day refresh token. */
async function issueRefreshToken(userId: string, role: Role): Promise<string> {
  const refreshToken = generateRefreshToken({ userId, role });
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await prisma.refreshToken.create({
    data: { token: hashRefreshToken(refreshToken), userId, expiresAt },
  });
  return refreshToken;
}

export const authService = {
  login: async (body: LoginRequestBody) => {
    const { userId, password } = body;
    const prefix = userId.substring(0, 2);
    
    let userRecord: UserRecord | null = null;
    let role: Role;

    if (prefix === 'US') {
      userRecord = await userRepository.findByUserId(userId) as UserRecord | null;
      role = Role.USER;
    } else if (prefix === 'DR') {
      userRecord = await doctorRepository.findByUserId(userId) as UserRecord | null;
      role = Role.DOCTOR;
    } else if (prefix === 'FR') {
      userRecord = await firstResponderRepository.findByUserId(userId) as UserRecord | null;
      role = Role.FIRST_RESPONDER;
    } else {
      throw { statusCode: 400, message: 'Invalid User ID format' };
    }

    if (!userRecord) {
      // Spend the same bcrypt time as a real check, so response timing does not reveal
      // which IDs exist (the error message is already identical).
      await verifyAgainstDummy(password);
      throw { statusCode: 401, message: 'Invalid User ID or password' };
    }

    const isMatch = await verifyPassword(password, userRecord.password);
    if (!isMatch) {
      throw { statusCode: 401, message: 'Invalid User ID or password' };
    }

    const token = generateToken({ userId, role });
    const refreshToken = await issueRefreshToken(userId, role);

    const userWithoutPassword = stripPassword(userRecord);

    return {
      token,
      refreshToken,
      user: {
        ...userWithoutPassword,
        role,
      },
    };
  },

  signup: async (body: SignupRequestBody) => {
    const { userId, password, name, role } = body;
    const prefix = userId.substring(0, 2);

    // Validate prefix
    if (role === Role.USER && prefix !== 'US') throw { statusCode: 400, message: 'User ID must start with US' };
    if (role === Role.DOCTOR && prefix !== 'DR') throw { statusCode: 400, message: 'User ID must start with DR' };
    if (role === Role.FIRST_RESPONDER && prefix !== 'FR') throw { statusCode: 400, message: 'User ID must start with FR' };

    const { available } = await authService.checkAvailability(userId);
    if (!available) {
      throw { statusCode: 409, message: 'User ID is already taken' };
    }

    const hashedPassword = await hashPassword(password);
    let newUser: UserRecord | null = null;

    if (role === Role.USER) {
      const accountId = userId.substring(2);
      newUser = await userRepository.createWithProfile({
        userId,
        accountId,
        name,
        password: hashedPassword,
      }) as UserRecord;
    } else if (role === Role.DOCTOR) {
      newUser = await doctorRepository.create({
        userId,
        name,
        password: hashedPassword,
        contactInfo: '',
        medicalLicenseNumber: `ML-${Math.floor(Math.random() * 900000) + 100000}`,
        qualifications: [],
        hospitalClinic: '',
        specialty: '',
      }) as UserRecord;
    } else if (role === Role.FIRST_RESPONDER) {
      newUser = await firstResponderRepository.create({
        userId,
        name,
        password: hashedPassword,
        occupation: '',
        contactInfo: '',
        agency: '',
        agencyId: '',
        organizationType: 'GOVERNMENT',
        qualification: '',
      }) as UserRecord;
    }

    if (!newUser) {
      throw { statusCode: 400, message: 'Failed to create user' };
    }

    const token = generateToken({ userId, role: role as Role });
    const refreshToken = await issueRefreshToken(userId, role as Role);

    const userWithoutPassword = stripPassword(newUser);

    return {
      token,
      refreshToken,
      user: {
        ...userWithoutPassword,
        role,
      },
    };
  },

  checkAvailability: async (userId: string) => {
    const prefix = userId.substring(0, 2);
    let exists = false;

    if (prefix === 'US') {
      exists = await userRepository.existsByUserId(userId);
    } else if (prefix === 'DR') {
      exists = await doctorRepository.existsByUserId(userId);
    } else if (prefix === 'FR') {
      exists = await firstResponderRepository.existsByUserId(userId);
    }

    return { available: !exists };
  },

  /**
   * Rotates the refresh token: the presented one is consumed and a new one issued.
   * A token that verifies cryptographically but is no longer stored was already
   * rotated or logged out, i.e. it is being replayed (likely stolen), so every
   * session of that user is revoked.
   */
  refresh: async (refreshToken: string) => {
    if (!refreshToken) throw { statusCode: 400, message: 'Refresh token is required' };

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (e) {
      throw { statusCode: 401, message: 'Invalid or expired refresh token' };
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: hashRefreshToken(refreshToken) },
    });

    if (!storedToken) {
      await prisma.refreshToken.deleteMany({ where: { userId: payload.userId } });
      throw { statusCode: 401, message: 'Refresh token has been revoked' };
    }

    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      throw { statusCode: 401, message: 'Refresh token has expired' };
    }

    const now = Date.now();
    if (storedToken.rotatedAt) {
      // Already exchanged. Within the grace window this is a concurrent refresh (two tabs
      // racing); after it, the token is being replayed, so end every session of the user.
      if (now - storedToken.rotatedAt.getTime() > ROTATION_GRACE_MS) {
        await prisma.refreshToken.deleteMany({ where: { userId: payload.userId } });
        throw { statusCode: 401, message: 'Refresh token has been revoked' };
      }
    } else {
      await prisma.refreshToken.update({ where: { id: storedToken.id }, data: { rotatedAt: new Date(now) } });
    }
    // Housekeeping: rotated tokens past the grace window are no longer needed.
    await prisma.refreshToken.deleteMany({
      where: { userId: payload.userId, rotatedAt: { lt: new Date(now - ROTATION_GRACE_MS) } },
    });

    const token = generateToken({ userId: payload.userId, role: payload.role });
    const newRefreshToken = await issueRefreshToken(payload.userId, payload.role);
    return { token, refreshToken: newRefreshToken };
  },

  logout: async (refreshToken: string) => {
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: hashRefreshToken(refreshToken) },
      });
    }
    return { success: true };
  },

  /** Ends every session of a user (account deletion, credential change). */
  revokeAllSessions: async (userId: string) => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }
};
