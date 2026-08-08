/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Database seeding is disabled in production environments.');
  }

  // 1. Clear existing database records
  await prisma.scanAuditLog.deleteMany({});
  await prisma.medicalHistory.deleteMany({});
  await prisma.triageProfile.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.doctorProfile.deleteMany({});
  await prisma.firstResponderProfile.deleteMany({});

  console.log('🧹 Cleaned existing database tables.');

  // Common password hash for test users
  const passwordHash = await bcrypt.hash('password123', 12);

  // 2. Create User Profiles (Patients)
  const patient1 = await prisma.user.create({
    data: {
      userId: 'US12345',
      accountId: '12345',
      name: 'John Doe',
      password: passwordHash,
      role: 'USER',
    },
  });

  const patient2 = await prisma.user.create({
    data: {
      userId: 'US54321',
      accountId: '54321',
      name: 'Jane Smith',
      password: passwordHash,
      role: 'USER',
    },
  });

  console.log('👤 Created user accounts (patients).');

  // 3. Create Triage Profiles
  await prisma.triageProfile.create({
    data: {
      userId: patient1.userId,
      age: 35,
      bloodGroup: 'O-Negative',
      allergies: ['Penicillin', 'Peanuts'],
      emergencyContacts: [
        { userId: 'US54321', name: 'Jane Smith' }
      ],
      dnrStatus: false,
      organDonor: true,
      insuranceId: 'INS-123456',
      primaryPhysician: 'DR98765',
      authoritySignature: 'AUTH-SIG-PROD-DEV-SIMULATED-JohnDoe-ECDSA-P256',
    },
  });

  await prisma.triageProfile.create({
    data: {
      userId: patient2.userId,
      age: 28,
      bloodGroup: 'A-Positive',
      allergies: ['Shellfish', 'Latex'],
      emergencyContacts: [
        { userId: 'US12345', name: 'John Doe' }
      ],
      dnrStatus: false,
      organDonor: false,
      insuranceId: 'INS-654321',
      primaryPhysician: 'DR98765',
      authoritySignature: undefined,
    },
  });

  console.log('🏥 Created patient triage profiles.');

  // 4. Create Medical Histories
  await prisma.medicalHistory.create({
    data: {
      userId: patient1.userId,
      drinkingHabits: 'Occasional',
      smokingHabits: 'No',
      medications: ['Lisinopril 10mg', 'Vitamin D 1000IU'],
      illnesses: ['Hypertension', 'Seasonal allergies'],
      surgeries: ['Appendectomy (2010)'],
      lastCheckup: {
        weight: 82,
        bmi: 24.5,
        sugar: 98,
        bp: '120/80',
      },
    },
  });

  await prisma.medicalHistory.create({
    data: {
      userId: patient2.userId,
      drinkingHabits: 'Social',
      smokingHabits: 'Yes',
      medications: ['Claritin 10mg'],
      illnesses: ['Asthma'],
      surgeries: [],
      lastCheckup: {
        weight: 62,
        bmi: 21.3,
        sugar: 85,
        bp: '110/70',
      },
    },
  });

  console.log('🩺 Created patient medical histories.');

  // 5. Create Doctor Profiles
  // For DOCTOR and FIRST_RESPONDER roles, they authenticate using the specific profile tables as defined in AuthController.
  await prisma.doctorProfile.create({
    data: {
      userId: 'DR98765',
      name: 'Dr. Gregory House',
      password: passwordHash,
      contactInfo: '+1-555-0101',
      medicalLicenseNumber: 'LIC-99234',
      qualifications: ['M.D. Johns Hopkins University', 'Board Certified in Nephrology'],
      hospitalClinic: 'Princeton-Plainsboro Teaching Hospital',
      specialty: 'Diagnostic Medicine',
    },
  });

  console.log('👨‍⚕️ Created Doctor profile.');

  // 6. Create First Responder Profiles
  await prisma.firstResponderProfile.create({
    data: {
      userId: 'FR55555',
      name: 'Paramedic Bob',
      password: passwordHash,
      occupation: 'Lead Paramedic',
      contactInfo: '+1-555-0911',
      agency: 'Metro Emergency Medical Services',
      agencyId: 'EMS-METRO-404',
      organizationType: 'GOVERNMENT',
      qualification: 'EMT-Paramedic Certified',
    },
  });

  console.log('🚒 Created First Responder profile.');

  console.log('🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
