import { Request, Response, NextFunction } from 'express';
import { scanService } from '../services/scan.service';
import { sendSuccess } from '../utils/response.utils';
import { NfcService } from '../services/nfc.service';

export const scanController = {
  logScan: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { patientAccount, deviceMeta, tagPayload } = req.body;
      
      if (!tagPayload || !tagPayload.signature || !tagPayload.tagId) {
        throw { statusCode: 400, message: 'Cryptographic proof of physical NFC tag proximity is required.' };
      }

      // Verify tag integrity
      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(tagPayload);
      if (!verified) {
        throw { statusCode: 400, message: 'Invalid tag signature. Cryptographic verification failed.' };
      }

      // Verify payload timestamp freshness (within 48 hours)
      const payloadTime = new Date(tagPayload.timestamp).getTime();
      const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
      if (!tagPayload.timestamp || isNaN(payloadTime) || payloadTime < fortyEightHoursAgo) {
        throw { statusCode: 400, message: 'Tag payload timestamp has expired (stale replay attack detected).' };
      }

      let finalDeviceMeta = deviceMeta || '';
      if (trustedAuthority) {
        finalDeviceMeta += ' [Authority-Certified]';
      } else {
        finalDeviceMeta += ' [Self-Signed]';
      }
      
      const result = await scanService.logScan(req.user!.userId, patientAccount, finalDeviceMeta.trim());
      sendSuccess(res, result, 201);
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
      
      const headers = ['id', 'patientAccount', 'timestamp', 'deviceMeta'];
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
