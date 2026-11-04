import zlib from 'zlib';
import crypto from 'crypto';
import { CryptoUtils } from '../utils/crypto.utils';

export interface TriagePayload {
  version: string;
  tagId: string; // Contains stringified JWK public key
  timestamp: string; // issuedAt, ISO 8601. Signed (second precision) as part of the content.
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

export type TagFreshness = 'current' | 'superseded' | 'revoked' | 'unregistered';

/**
 * Tag format v3. Unlike v2 (which signed only triageData), v3 signs the
 * patient ID and issuedAt alongside the clinical content, and the authority
 * certificate binds the patient key to that same patient ID and issuedAt.
 * A v2 tag is rejected outright: it cannot be checked for freshness or
 * patient binding, so it must be re-issued.
 */
export const TAG_FORMAT_VERSION = '3.0';

const BLOOD_GROUP_LONG: Record<string, string> = {
  'O-': 'O-Negative', 'O+': 'O-Positive',
  'A-': 'A-Negative', 'A+': 'A-Positive',
  'B-': 'B-Negative', 'B+': 'B-Positive',
  'AB-': 'AB-Negative', 'AB+': 'AB-Positive',
};

/**
 * The exact triage object that is signed. The on-tag short format drops
 * extra contact fields, maps blood groups to short codes and filters
 * "None" allergies, so signing anything other than this canonical form
 * makes genuine tags fail verification after a round trip (the class of
 * bug behind the empty-allergy defect). Must stay byte-identical to the
 * client's NfcCryptoService.canonicalTriage.
 */
export function canonicalTriage(t: TriagePayload['triageData']) {
  return {
    name: t.name,
    bloodGroup: BLOOD_GROUP_LONG[t.bloodGroup] || t.bloodGroup,
    allergies: (t.allergies || []).filter(
      (a) => a.toLowerCase() !== 'none' && a.toLowerCase() !== 'no allergies'
    ),
    emergencyContacts: (t.emergencyContacts || []).map((c: { userId: string; name: string }) => ({ userId: c.userId, name: c.name })),
    dnrStatus: !!t.dnrStatus,
  };
}

export function issuedAtSeconds(isoTimestamp: string): number {
  return Math.floor(new Date(isoTimestamp).getTime() / 1000);
}

/** Tier 1 message. The leading tag separates it from the Tier 2 message, so one signature can't be replayed as the other. */
export function contentSigningString(p: Pick<TriagePayload, 'version' | 'fhirPatientId' | 'timestamp' | 'triageData'>): string {
  return JSON.stringify([
    'aegistag-content-v3',
    p.version,
    p.fhirPatientId,
    issuedAtSeconds(p.timestamp),
    canonicalTriage(p.triageData),
  ]);
}

/** Tier 2 message: the authority certifies this key, for this patient, for this issuance only. */
export function certSigningString(fhirPatientId: string, issuedAtSec: number, x: string, y: string): string {
  return JSON.stringify(['aegistag-cert-v3', fhirPatientId, issuedAtSec, x, y]);
}

export class NfcService {
  /**
   * Test/benchmark hook. When null, trust anchors are derived from the
   * server's own AUTHORITY_PRIVATE_KEY (plus any retired keys listed in
   * AUTHORITY_TRUSTED_PUBLIC_KEYS), so server-side verification can never
   * drift from the key the server actually signs with.
   */
  static authorityPublicKeysOverride: crypto.webcrypto.JsonWebKey[] | null = null;

  static getAuthorityPublicKeys(): crypto.webcrypto.JsonWebKey[] {
    if (this.authorityPublicKeysOverride) return this.authorityPublicKeysOverride;
    const keys: crypto.webcrypto.JsonWebKey[] = [];
    const current = CryptoUtils.getAuthorityPublicJwk();
    if (current) keys.push(current);
    if (process.env.AUTHORITY_TRUSTED_PUBLIC_KEYS) {
      try {
        keys.push(...(JSON.parse(process.env.AUTHORITY_TRUSTED_PUBLIC_KEYS) as crypto.webcrypto.JsonWebKey[]));
      } catch {
        console.error('AUTHORITY_TRUSTED_PUBLIC_KEYS is not a JSON array of JWKs; ignoring it');
      }
    }
    return keys;
  }

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
    if (!payload.signature || !payload.tagId || payload.version !== TAG_FORMAT_VERSION) {
      return { verified: false, trustedAuthority: false };
    }
    if (!payload.fhirPatientId || Number.isNaN(issuedAtSeconds(payload.timestamp))) {
      return { verified: false, trustedAuthority: false };
    }

    try {
      // 1. Verify Patient Signature over patient ID + issuedAt + triage data
      const patientPublicKeyJwk = JSON.parse(payload.tagId);
      const isPatientVerified = CryptoUtils.verifyEcdsaSignature(
        contentSigningString(payload),
        payload.signature,
        patientPublicKeyJwk
      );

      if (!isPatientVerified) {
        return { verified: false, trustedAuthority: false };
      }

      // 2. Verify the Authority certificate binding this key to this patient and issuance
      let isAuthorityVerified = false;
      if (payload.authoritySignature) {
        const certString = certSigningString(
          payload.fhirPatientId,
          issuedAtSeconds(payload.timestamp),
          patientPublicKeyJwk.x,
          patientPublicKeyJwk.y
        );
        isAuthorityVerified = this.getAuthorityPublicKeys().some((authorityKey) =>
          CryptoUtils.verifyEcdsaSignature(certString, payload.authoritySignature!, authorityKey)
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
   * Compares a tag's signed issuedAt against the server's issuance record.
   * Only the most recently certified tag is 'current': re-issuing a tag
   * supersedes every older one, and revocation invalidates every tag issued
   * at or before the revocation time. Signature validity alone cannot tell a
   * stale record from a current one, so this check is what lets the server
   * refuse a valid-but-outdated tag.
   */
  static classifyFreshness(
    tagIssuedAtSec: number,
    record: { tagIssuedAt: Date | null; tagRevokedAt: Date | null } | null | undefined
  ): TagFreshness {
    if (!record || !record.tagIssuedAt) return 'unregistered';
    if (record.tagRevokedAt && tagIssuedAtSec <= issuedAtSeconds(record.tagRevokedAt.toISOString())) {
      return 'revoked';
    }
    const currentSec = issuedAtSeconds(record.tagIssuedAt.toISOString());
    if (tagIssuedAtSec < currentSec) return 'superseded';
    if (tagIssuedAtSec > currentSec) return 'unregistered';
    return 'current';
  }

  /** Throws if (x, y) is not a valid P-256 public point. */
  static assertValidP256Point(x: string, y: string): void {
    crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x, y }, format: 'jwk' });
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
