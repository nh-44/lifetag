import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

export const scanAuditRepository = {
  create: async (data: Prisma.ScanAuditLogCreateInput) => {
    return await prisma.scanAuditLog.create({
      data,
    });
  },
  findByScanner: async (userId: string) => {
    return await prisma.scanAuditLog.findMany({
      where: { scannedBy: userId },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
  },
};
