/**
 * Test database helpers
 *
 * Provides a shared Prisma client wired to the test DB,
 * a cleanDb() function for table teardown, and seed factories
 * for creating fixtures without going through the full service layer.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Use a dedicated client for tests — not the singleton from src/config/database
// so it doesn't conflict with the app's global instance
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: [],
});

/**
 * Truncates all tables in a safe order (children before parents)
 * so foreign-key constraints don't block the delete.
 */
export async function cleanDb() {
  // Disable FK checks for speed; re-enable after
  await testPrisma.$executeRawUnsafe('TRUNCATE TABLE "RefreshToken" CASCADE');
  await testPrisma.$executeRawUnsafe('TRUNCATE TABLE "ScanAuditLog" CASCADE');
  await testPrisma.$executeRawUnsafe('TRUNCATE TABLE "TriageProfile" CASCADE');
  await testPrisma.$executeRawUnsafe('TRUNCATE TABLE "MedicalHistory" CASCADE');
  await testPrisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
  await testPrisma.$executeRawUnsafe('TRUNCATE TABLE "DoctorProfile" CASCADE');
  await testPrisma.$executeRawUnsafe('TRUNCATE TABLE "FirstResponderProfile" CASCADE');
}

// ─── Seed Factories ──────────────────────────────────────────────────────────

const DEFAULT_PLAIN_PASSWORD = 'Password123!';

/** Creates a User row with a real bcrypt hash + empty TriageProfile & MedicalHistory */
export async function seedUser(overrides?: {
  userId?: string;
  accountId?: string;
  name?: string;
  password?: string;
}) {
  const userId = overrides?.userId ?? `US${Math.floor(10000 + Math.random() * 90000)}`;
  const accountId = overrides?.accountId ?? userId.substring(2);
  const name = overrides?.name ?? 'Test Patient';
  const plainPassword = overrides?.password ?? DEFAULT_PLAIN_PASSWORD;
  const hashed = await bcrypt.hash(plainPassword, 10); // low rounds for speed in tests

  const user = await testPrisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        userId,
        accountId,
        name,
        password: hashed,
        role: 'USER',
      },
    });

    await tx.triageProfile.create({
      data: {
        userId,
        age: 30,
        bloodGroup: 'O+',
        allergies: ['Peanuts'],
        emergencyContacts: [],
        dnrStatus: false,
        organDonor: false,
        insuranceId: '',
        primaryPhysician: null,
      },
    });

    await tx.medicalHistory.create({
      data: {
        userId,
        drinkingHabits: 'None',
        smokingHabits: 'None',
        medications: [],
        illnesses: [],
        surgeries: [],
        lastCheckup: { weight: 70, bmi: 22, sugar: 90, bp: '120/80' },
      },
    });

    return created;
  });

  return { user, plainPassword };
}

/** Creates a DoctorProfile row */
export async function seedDoctor(overrides?: {
  userId?: string;
  name?: string;
  password?: string;
}) {
  const userId = overrides?.userId ?? `DR${Math.floor(10000 + Math.random() * 90000)}`;
  const name = overrides?.name ?? 'Dr. Test';
  const plainPassword = overrides?.password ?? DEFAULT_PLAIN_PASSWORD;
  const hashed = await bcrypt.hash(plainPassword, 10);

  const doctor = await testPrisma.doctorProfile.create({
    data: {
      userId,
      name,
      password: hashed,
      contactInfo: '555-0100',
      medicalLicenseNumber: `ML-${Math.floor(100000 + Math.random() * 900000)}`,
      qualifications: ['MBBS'],
      hospitalClinic: 'Test Hospital',
      specialty: 'General',
    },
  });

  return { doctor, plainPassword };
}

/** Creates a FirstResponderProfile row */
export async function seedFirstResponder(overrides?: {
  userId?: string;
  name?: string;
  password?: string;
}) {
  const userId = overrides?.userId ?? `FR${Math.floor(10000 + Math.random() * 90000)}`;
  const name = overrides?.name ?? 'FR Test';
  const plainPassword = overrides?.password ?? DEFAULT_PLAIN_PASSWORD;
  const hashed = await bcrypt.hash(plainPassword, 10);

  const responder = await testPrisma.firstResponderProfile.create({
    data: {
      userId,
      name,
      password: hashed,
      occupation: 'Paramedic',
      contactInfo: '555-0200',
      agency: 'City EMS',
      agencyId: 'EMS-001',
      organizationType: 'GOVERNMENT',
      qualification: 'EMT-Basic',
    },
  });

  return { responder, plainPassword };
}

export async function seedScanAuditLog(data: {
  scannedBy: string;
  patientAccount: string;
  timestamp?: Date;
  deviceMeta?: string;
}) {
  return testPrisma.scanAuditLog.create({
    data: {
      scannedBy: data.scannedBy,
      patientAccount: data.patientAccount,
      timestamp: data.timestamp ?? new Date(),
      deviceMeta: data.deviceMeta ?? 'test-device [Authority-Certified]',
    },
  });
}
