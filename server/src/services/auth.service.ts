import { userRepository } from '../repositories/userRepository';
import { doctorRepository } from '../repositories/doctorRepository';
import { firstResponderRepository } from '../repositories/firstResponderRepository';
import { hashPassword, verifyPassword } from '../utils/password.utils';
import { generateToken } from '../utils/jwt.utils';
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
      throw { statusCode: 401, message: 'Invalid User ID or password' };
    }

    const isMatch = await verifyPassword(password, userRecord.password);
    if (!isMatch) {
      throw { statusCode: 401, message: 'Invalid User ID or password' };
    }

    const token = generateToken({ userId, role });
    const userWithoutPassword = stripPassword(userRecord);

    return {
      token,
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
    const userWithoutPassword = stripPassword(newUser);

    return {
      token,
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
  }
};
