import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export const doctorRepository = {
  findByUserId: async (userId: string) => {
    return await prisma.doctorProfile.findUnique({
      where: { userId },
    });
  },
  existsByUserId: async (userId: string) => {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return !!doctor;
  },
  create: async (data: Prisma.DoctorProfileCreateInput) => {
    return await prisma.doctorProfile.create({
      data,
    });
  },
  update: async (userId: string, data: Prisma.DoctorProfileUpdateInput) => {
    return await prisma.doctorProfile.update({
      where: { userId },
      data,
    });
  },
};
