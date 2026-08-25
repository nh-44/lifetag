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
  checkRecentScan: async (scannedBy: string, patientAccount: string, hours: number = 24) => {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const log = await prisma.scanAuditLog.findFirst({
      where: {
        scannedBy,
        patientAccount,
        timestamp: { gte: cutoff },
        deviceMeta: { contains: '[Authority-Certified]' }
      }
    });
    return !!log;
  }
};
