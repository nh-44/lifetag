import { TagFreshness } from './nfc.service';
import { scanAuditRepository } from '../repositories/scanAuditRepository';
import { prisma } from '../config/database';

export const scanService = {
  logScan: async (
    scannedBy: string,
    patientAccount: string,
    deviceMeta: string | undefined,
    certified: boolean,
    tagFreshness: TagFreshness
  ) => {
    return await scanAuditRepository.create({
      scannedBy,
      patientAccount,
      deviceMeta,
      certified,
      tagFreshness,
    });
  },

  /** Records an online triage lookup (no tag involved). Never certified, so it cannot open a consent window. */
  logLookup: async (scannedBy: string, patientAccount: string, deviceMeta: string | undefined) => {
    return await scanAuditRepository.create({
      scannedBy,
      patientAccount,
      deviceMeta: deviceMeta?.slice(0, 300),
      certified: false,
      accessType: 'online-lookup',
    });
  },

  getScanHistory: async (userId: string) => {
    return await scanAuditRepository.findByScanner(userId);
  },

  /**
   * Who accessed this patient's data: tag scans and online lookups, newest first,
   * with the clinician's name, so a patient can spot use of a lost or stolen tag.
   */
  getAccessLogForPatient: async (accountId: string) => {
    const rows = await scanAuditRepository.findByPatient(accountId);
    const ids = [...new Set(rows.map((r) => r.scannedBy))];
    const [doctors, responders] = await Promise.all([
      prisma.doctorProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, name: true, hospitalClinic: true } }),
      prisma.firstResponderProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, name: true, agency: true } }),
    ]);
    const who = new Map<string, { name: string; organization: string }>([
      ...doctors.map((d) => [d.userId, { name: d.name, organization: d.hospitalClinic }] as const),
      ...responders.map((f) => [f.userId, { name: f.name, organization: f.agency }] as const),
    ]);
    return rows.map((r) => ({
      timestamp: r.timestamp,
      scannedBy: r.scannedBy,
      scannerName: who.get(r.scannedBy)?.name ?? 'Unknown clinician',
      organization: who.get(r.scannedBy)?.organization ?? '',
      accessType: r.accessType,
      certified: r.certified,
      tagFreshness: r.tagFreshness,
    }));
  }
};
