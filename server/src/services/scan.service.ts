import { scanAuditRepository } from '../repositories/scanAuditRepository';

export const scanService = {
  logScan: async (scannedBy: string, patientAccount: string, deviceMeta?: string) => {
    return await scanAuditRepository.create({
      scannedBy,
      patientAccount,
      deviceMeta,
    });
  },

  getScanHistory: async (userId: string) => {
    return await scanAuditRepository.findByScanner(userId);
  }
};
