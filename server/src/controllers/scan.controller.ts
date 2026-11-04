import { Request, Response, NextFunction } from 'express';
import { scanService } from '../services/scan.service';
import { sendSuccess } from '../utils/response.utils';
import { NfcService, TagFreshness, issuedAtSeconds } from '../services/nfc.service';
import { userRepository } from '../repositories/userRepository';

/**
 * Decides what a verified, patient-bound scan means for the audit log and
 * the consent gate. Called only after both signatures were checked and the
 * tag's signed fhirPatientId matched patientAccount.
 *
 * Policy: every such scan is LOGGED (the audit trail is most valuable exactly
 * when something is wrong, e.g. a patient learning their stolen tag was used),
 * but only one combination is `certified`, the sole flag requireMedicalConsent
 * trusts. `alert` is returned to the scanning clinician and must be shown.
 */
export function decideScanOutcome(
  trustedAuthority: boolean,
  freshness: TagFreshness
): { certified: boolean; alert?: string } {
  if (freshness === 'revoked') {
    return {
      certified: false,
      alert: 'This tag was reported lost or stolen and is revoked. Do not rely on its data; confirm identity and use the online record.',
    };
  }
  if (trustedAuthority && freshness === 'unregistered') {
    // A certificate that verifies but matches no issuance the server recorded means the
    // authority key signed something outside the issuance service: possible key compromise.
    return {
      certified: false,
      alert: 'Authority certificate does not match any recorded issuance. Treat this tag as untrusted; the incident has been logged.',
    };
  }
  if (freshness === 'superseded') {
    return {
      certified: false,
      alert: 'A newer tag has been issued for this patient. This tag may hold outdated information; use the online record.',
    };
  }
  return { certified: trustedAuthority && freshness === 'current' };
}

export const scanController = {
  logScan: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { patientAccount, deviceMeta, tagPayload } = req.body;
      
      if (!tagPayload || !tagPayload.signature || !tagPayload.tagId) {
        throw { statusCode: 400, message: 'Cryptographic proof of physical NFC tag proximity is required.' };
      }

      // Verify tag integrity (Tier 1 covers fhirPatientId + issuedAt; Tier 2 binds the key to both)
      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(tagPayload);
      if (!verified) {
        throw { statusCode: 400, message: 'Invalid tag signature. Cryptographic verification failed.' };
      }

      // The scan only counts for the patient the tag was signed for. Without this check, any
      // certified tag could be presented with an arbitrary patientAccount to unlock that
      // patient's full history through the consent gate.
      if (tagPayload.fhirPatientId !== patientAccount) {
        throw { statusCode: 400, message: 'Tag does not belong to the requested patient account.' };
      }

      const patient = await userRepository.findByAccountId(patientAccount);
      if (!patient) {
        throw { statusCode: 404, message: 'Patient not found' };
      }

      const freshness = NfcService.classifyFreshness(
        issuedAtSeconds(tagPayload.timestamp),
        patient.triageProfile
      );
      const outcome = decideScanOutcome(trustedAuthority, freshness);
      if (outcome.alert) {
        console.warn(`[scan-alert] scanner=${req.user!.userId} patient=${patientAccount} freshness=${freshness}: ${outcome.alert}`);
      }

      const result = await scanService.logScan(
        req.user!.userId,
        patientAccount,
        deviceMeta,
        outcome.certified,
        freshness
      );
      sendSuccess(res, { ...result, trustedAuthority, freshness, alert: outcome.alert }, 201);
    } catch (error) {
      next(error);
    }
  },

  getScanHistory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await scanService.getScanHistory(req.user!.userId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  exportScanHistory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await scanService.getScanHistory(req.user!.userId);
      
      if (!result || result.length === 0) {
        return res.status(404).json({ success: false, message: 'No scan history found' });
      }
      
      const headers = ['id', 'patientAccount', 'timestamp', 'certified', 'tagFreshness', 'deviceMeta'];
      const csvRows = [headers.join(',')];
      
      for (const row of result) {
        const values = headers.map(header => {
          const val = (row as any)[header];
          const escaped = ('' + (val || '')).replace(/"/g, '""');
          return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
      }
      
      const csvData = csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="scan-history.csv"');
      res.status(200).send(csvData);
    } catch (error) {
      next(error);
    }
  }
};
