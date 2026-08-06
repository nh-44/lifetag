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
  };
  signature: string;
  authoritySignature?: string; // Signature from Healthcare Authority
}

export class NfcService {
  // Same Healthcare Authority Public Key JWK (for verification)
  private static AUTHORITY_PUBLIC_KEY_JWK = {
    kty: "EC",
    crv: "P-256",
    x: "Sy52YAL3SADCzj6OTAiLmHGTiJR3-AjJimHizE3n3Eg",
    y: "KHaR_N-H8tgqAy4zKrzs64HN1PBy-1mEQHDL5SzLXOU",
  };

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
   * Validates a tag payload using two-tier verification: Authority signature + Patient signature
   */
  static verifyTagIntegrity(payload: TriagePayload): {
    verified: boolean;
    trustedAuthority: boolean;
  } {
    if (!payload.signature || !payload.tagId) {
      return { verified: false, trustedAuthority: false };
    }

    try {
      // 1. Verify Patient Signature over Triage Data
      const patientPublicKeyJwk = JSON.parse(payload.tagId);
      const isPatientVerified = CryptoUtils.verifyEcdsaSignature(
        payload.triageData,
        payload.signature,
        patientPublicKeyJwk
      );

      if (!isPatientVerified) {
        return { verified: false, trustedAuthority: false };
      }

      // 2. Verify Authority Certification Signature over Patient Public Key
      let isAuthorityVerified = false;
      if (payload.authoritySignature) {
        isAuthorityVerified = CryptoUtils.verifyEcdsaSignature(
          payload.tagId, // Authority signs the stringified patient public key
          payload.authoritySignature,
          this.AUTHORITY_PUBLIC_KEY_JWK
        );
      }

      return {
        verified: true,
        trustedAuthority: isAuthorityVerified,
      };
    } catch (e) {
      console.error('NfcService integrity check failed:', e);
      return { verified: false, trustedAuthority: false };
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
