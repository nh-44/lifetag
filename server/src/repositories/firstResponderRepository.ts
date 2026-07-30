import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export const firstResponderRepository = {
  findByUserId: async (userId: string) => {
    return await prisma.firstResponderProfile.findUnique({
      where: { userId },
    });
  },
  existsByUserId: async (userId: string) => {
    const responder = await prisma.firstResponderProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return !!responder;
  },
  create: async (data: Prisma.FirstResponderProfileCreateInput) => {
    return await prisma.firstResponderProfile.create({
      data,
    });
  },
  update: async (userId: string, data: Prisma.FirstResponderProfileUpdateInput) => {
    return await prisma.firstResponderProfile.update({
      where: { userId },
      data,
    });
  },
};
