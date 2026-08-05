import zlib from 'zlib';
import { CryptoUtils } from '../utils/crypto.utils';

export interface TriagePayload {
  version: string;
  tagId: string; // Contains stringified JWK public key
  timestamp: string;
  fhirPatientId: string;
  triageData: {
    name: string;
    bloodGroup: string;
    allergies: string[];
    emergencyContacts: any[];
    dnrStatus: boolean;
    organDonor: boolean;
  };
  signature: string;
}

export class NfcService {
  /**
   * Decompresses a Gzip hex string back to a TriagePayload JSON object
   */
  static decompressTag(compressedHex: string): TriagePayload {
    try {
      const buffer = Buffer.from(compressedHex, 'hex');
      const decompressed = zlib.gunzipSync(buffer);
      return JSON.parse(decompressed.toString('utf8')) as TriagePayload;
    } catch (e) {
      throw new Error('Failed to decompress tag payload: invalid Gzip buffer');
    }
  }

  /**
   * Compresses a TriagePayload JSON object to a Gzip hex string
   */
  static compressTag(payload: TriagePayload): string {
    try {
      const jsonStr = JSON.stringify(payload);
      const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
      return compressed.toString('hex');
    } catch (e) {
      throw new Error('Failed to compress tag payload');
    }
  }

  /**
   * Fully validates a decompressed tag payload's integrity and ECDSA signature
   */
  static verifyTagIntegrity(payload: TriagePayload): boolean {
    if (!payload.signature || !payload.tagId) return false;

    try {
      // Parse public key from tagId field (JWK)
      const publicKeyJwk = JSON.parse(payload.tagId);
      
      // Verify signature matches the triageData structure
      return CryptoUtils.verifyEcdsaSignature(
        payload.triageData,
        payload.signature,
        publicKeyJwk
      );
    } catch (e) {
      console.error('NfcService integrity check failed:', e);
      return false;
    }
  }

  /**
   * Returns byte budget details of the payload compared to NTAG215 (504 bytes limit)
   */
  static getByteBudget(payload: TriagePayload): {
    rawBytes: number;
    compressedBytes: number;
    fitsNtag215: boolean;
    efficiencyGainPercent: number;
  } {
    const rawString = JSON.stringify(payload);
    const rawBytes = Buffer.byteLength(rawString, 'utf8');

    try {
      const hexString = this.compressTag(payload);
      const compressedBytes = hexString.length / 2; // Hex characters represent 0.5 bytes each
      const efficiencyGain = ((rawBytes - compressedBytes) / rawBytes) * 100;

      return {
        rawBytes,
        compressedBytes,
        fitsNtag215: compressedBytes <= 504,
        efficiencyGainPercent: Math.round(efficiencyGain * 100) / 100,
      };
    } catch (e) {
      return {
        rawBytes,
        compressedBytes: rawBytes,
        fitsNtag215: rawBytes <= 504,
        efficiencyGainPercent: 0,
      };
    }
  }
}
