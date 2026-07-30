import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

interface CreateUserData {
  userId: string;
  accountId: string;
  name: string;
  password: string;
}

export const userRepository = {
  findByUserId: async (userId: string) => {
    return await prisma.user.findUnique({
      where: { userId },
      include: { triageProfile: true, medicalHistory: true },
    });
  },
  findByAccountId: async (accountId: string) => {
    return await prisma.user.findUnique({
      where: { accountId },
      include: { triageProfile: true, medicalHistory: true },
    });
  },
  existsByUserId: async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { id: true },
    });
    return !!user;
  },
  createWithProfile: async (data: CreateUserData) => {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          userId: data.userId,
          accountId: data.accountId,
          name: data.name,
          password: data.password,
          role: 'USER',
        },
      });

      await tx.triageProfile.create({
        data: {
          userId: data.userId,
          age: 0,
          bloodGroup: '',
          allergies: [],
          emergencyContacts: [],
          dnrStatus: false,
          organDonor: false,
          insuranceId: '',
          primaryPhysician: null,
        },
      });

      await tx.medicalHistory.create({
        data: {
          userId: data.userId,
          drinkingHabits: '',
          smokingHabits: '',
          medications: [],
          illnesses: [],
          surgeries: [],
          lastCheckup: {
            weight: 0,
            bmi: 0,
            sugar: 0,
            bp: '',
          },
        },
      });

      return user;
    });
  },
  updateTriageProfile: async (userId: string, data: Prisma.TriageProfileUpdateInput) => {
    return await prisma.triageProfile.upsert({
      where: { userId },
      create: { userId, ...data } as Prisma.TriageProfileCreateInput,
      update: data,
    });
  },
  updateMedicalHistory: async (userId: string, data: Prisma.MedicalHistoryUpdateInput) => {
    return await prisma.medicalHistory.upsert({
      where: { userId },
      create: { userId, ...data } as Prisma.MedicalHistoryCreateInput,
      update: data,
    });
  },
  deleteByUserId: async (userId: string) => {
    return await prisma.user.delete({
      where: { userId },
    });
  },
};
