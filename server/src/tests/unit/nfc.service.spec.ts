import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { NfcService, TriagePayload, canonicalTriage, contentSigningString, certSigningString } from '../../services/nfc.service';
import { CryptoUtils } from '../../utils/crypto.utils';
import { buildTag, installTestAuthority, AuthorityFixture } from '../helpers/tagFactory';

describe('NfcService', () => {
  let authority: AuthorityFixture;

  beforeEach(() => {
    authority = installTestAuthority();
  });

  afterEach(() => {
    authority.restore();
  });

  const generateValidPatientPayload = (): TriagePayload => buildTag({ fhirPatientId: '12345', authorityKey: null });
  const certifiedTag = (fhirPatientId = '12345') => buildTag({ fhirPatientId, authorityKey: authority.privateKey });
  const signP1363 = (key: crypto.KeyObject, data: string) =>
    crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }).toString('base64');

  describe('verifyTagIntegrity', () => {
    it('verifies a valid self-signed tag (patient signed, missing authority signature)', () => {
      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(generateValidPatientPayload());
      expect(verified).toBe(true);
      expect(trustedAuthority).toBe(false);
    });

    it('verifies a valid Authority-certified tag correctly', () => {
      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(certifiedTag());
      expect(verified).toBe(true);
      expect(trustedAuthority).toBe(true);
    });

    it('accepts a certificate produced by CryptoUtils.signWithAuthorityKey (the issuance path)', () => {
      const payload = generateValidPatientPayload();
      const { x, y } = JSON.parse(payload.tagId);
      const issuedAt = Math.floor(new Date(payload.timestamp).getTime() / 1000);
      payload.authoritySignature = CryptoUtils.signWithAuthorityKey(certSigningString('12345', issuedAt, x, y));
      expect(NfcService.verifyTagIntegrity(payload).trustedAuthority).toBe(true);
    });

    it('rejects tampered patient triage data', () => {
      const payload = certifiedTag();
      payload.triageData.bloodGroup = 'A-Positive';
      expect(NfcService.verifyTagIntegrity(payload)).toEqual({ verified: false, trustedAuthority: false });
    });

    it('rejects an edited issuedAt (timestamp is signed, so stale tags cannot be made to look fresh)', () => {
      const payload = certifiedTag();
      payload.timestamp = new Date(Date.now() + 86_400_000).toISOString();
      expect(NfcService.verifyTagIntegrity(payload).verified).toBe(false);
    });

    it('rejects a swapped fhirPatientId (patient ID is signed)', () => {
      const payload = certifiedTag('12345');
      payload.fhirPatientId = '54321';
      expect(NfcService.verifyTagIntegrity(payload).verified).toBe(false);
    });

    it("rejects a certificate grafted from another patient's issuance", () => {
      // The attacker holds a genuine certificate for a key issued to patient A and
      // reuses that key + cert on a tag claiming to be patient B, re-signing the
      // content with the key so Tier 1 passes. Tier 2 must still fail: the cert names A.
      const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const { x, y } = patientKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
      const issuedAt = Math.floor(Date.now() / 1000);
      const tagForB: TriagePayload = {
        ...buildTag({ fhirPatientId: '22222', issuedAtSec: issuedAt, authorityKey: null }),
        tagId: JSON.stringify({ kty: 'EC', crv: 'P-256', x, y }),
        authoritySignature: signP1363(authority.privateKey, certSigningString('11111', issuedAt, x, y)),
      };
      tagForB.signature = signP1363(patientKeys.privateKey, contentSigningString(tagForB));

      const result = NfcService.verifyTagIntegrity(tagForB);
      expect(result.verified).toBe(true);
      expect(result.trustedAuthority).toBe(false);
    });

    it('rejects unsigned payloads', () => {
      const payload = generateValidPatientPayload();
      payload.signature = '';
      expect(NfcService.verifyTagIntegrity(payload)).toEqual({ verified: false, trustedAuthority: false });
    });

    it('rejects if tagId (public key) is missing', () => {
      const payload = generateValidPatientPayload();
      payload.tagId = '';
      expect(NfcService.verifyTagIntegrity(payload)).toEqual({ verified: false, trustedAuthority: false });
    });

    it('rejects legacy v2 tags, which carry no signed patient ID or issuedAt', () => {
      const payload = certifiedTag();
      payload.version = '2.0';
      expect(NfcService.verifyTagIntegrity(payload).verified).toBe(false);
    });

    it('rejects a forged authority signature (wrong signing key)', () => {
      const payload = generateValidPatientPayload();
      const { x, y } = JSON.parse(payload.tagId);
      const issuedAt = Math.floor(new Date(payload.timestamp).getTime() / 1000);
      const rogueKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      payload.authoritySignature = signP1363(rogueKeys.privateKey, certSigningString('12345', issuedAt, x, y));

      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(payload);
      expect(verified).toBe(true);
      expect(trustedAuthority).toBe(false);
    });

    it('accepts certificates from any listed authority key (rotation), and none once the key is removed', () => {
      const retired = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const tag = buildTag({ fhirPatientId: '12345', authorityKey: retired.privateKey });

      NfcService.authorityPublicKeysOverride = [authority.publicJwk, retired.publicKey.export({ format: 'jwk' })];
      expect(NfcService.verifyTagIntegrity(tag).trustedAuthority).toBe(true);

      NfcService.authorityPublicKeysOverride = [authority.publicJwk];
      expect(NfcService.verifyTagIntegrity(tag).trustedAuthority).toBe(false);
    });

    it('derives its trust anchor from AUTHORITY_PRIVATE_KEY when no override is set', () => {
      NfcService.authorityPublicKeysOverride = null;
      expect(NfcService.verifyTagIntegrity(certifiedTag()).trustedAuthority).toBe(true);
    });

    it('fails closed (never trusted) when no authority key is configured', () => {
      const tag = certifiedTag();
      NfcService.authorityPublicKeysOverride = null;
      delete process.env.AUTHORITY_PRIVATE_KEY;
      expect(NfcService.verifyTagIntegrity(tag).trustedAuthority).toBe(false);
    });
  });

  describe('canonicalTriage', () => {
    it('makes short-format round-trip differences irrelevant to the signature', () => {
      const asEntered = {
        name: 'A', bloodGroup: 'O+', allergies: ['None'],
        emergencyContacts: [{ userId: 'US1', name: 'B', phone: '555' }], dnrStatus: false,
      };
      const afterTagRoundTrip = {
        name: 'A', bloodGroup: 'O-Positive', allergies: [],
        emergencyContacts: [{ userId: 'US1', name: 'B' }], dnrStatus: false,
      };
      expect(JSON.stringify(canonicalTriage(asEntered))).toBe(JSON.stringify(canonicalTriage(afterTagRoundTrip)));
    });

    it('CROSS-IMPLEMENTATION VECTOR: canonical strings match client/src/tests/nfcCryptoService.spec.ts', () => {
      const content = contentSigningString({
        version: '3.0',
        fhirPatientId: '12345',
        timestamp: '2026-10-31T12:00:00.000Z',
        triageData: {
          name: 'Jane Doe', bloodGroup: 'O+', allergies: ['None'],
          emergencyContacts: [{ userId: 'US99999', name: 'Mom', phone: '555-0100' }], dnrStatus: true,
        },
      });
      expect(content).toBe(
        '["aegistag-content-v3","3.0","12345",1793448000,{"name":"Jane Doe","bloodGroup":"O-Positive","allergies":[],"emergencyContacts":[{"userId":"US99999","name":"Mom"}],"dnrStatus":true}]'
      );
      expect(certSigningString('12345', 1793448000, 'X', 'Y')).toBe('["aegistag-cert-v3","12345",1793448000,"X","Y"]');
    });
  });

  describe('classifyFreshness', () => {
    const at = (sec: number) => new Date(sec * 1000);

    it('is current only for the most recently certified issuance', () => {
      expect(NfcService.classifyFreshness(1000, { tagIssuedAt: at(1000), tagRevokedAt: null })).toBe('current');
    });

    it('marks an older, still validly signed tag as superseded', () => {
      expect(NfcService.classifyFreshness(900, { tagIssuedAt: at(1000), tagRevokedAt: null })).toBe('superseded');
    });

    it('marks every tag issued at or before revocation as revoked', () => {
      expect(NfcService.classifyFreshness(1000, { tagIssuedAt: at(1000), tagRevokedAt: at(1500) })).toBe('revoked');
    });

    it('treats tags the server never certified as unregistered', () => {
      expect(NfcService.classifyFreshness(1000, { tagIssuedAt: null, tagRevokedAt: null })).toBe('unregistered');
      expect(NfcService.classifyFreshness(2000, { tagIssuedAt: at(1000), tagRevokedAt: null })).toBe('unregistered');
      expect(NfcService.classifyFreshness(1000, null)).toBe('unregistered');
    });
  });

  describe('Compression & Byte Budget', () => {
    it('compresses and decompresses payload correctly', () => {
      const payload = generateValidPatientPayload();
      const compressedHex = NfcService.compressTag(payload);
      expect(typeof compressedHex).toBe('string');
      expect(compressedHex.length).toBeGreaterThan(0);

      const decompressed = NfcService.decompressTag(compressedHex);
      expect(decompressed.fhirPatientId).toBe(payload.fhirPatientId);
      expect(decompressed.triageData.name).toBe(payload.triageData.name);
    });

    it('getByteBudget: handles a small profile', () => {
      const payload = generateValidPatientPayload();
      payload.triageData.allergies = [];
      payload.triageData.emergencyContacts = [];

      const budget = NfcService.getByteBudget(payload);
      expect(budget.rawBytes).toBeGreaterThan(0);
      expect(budget.compressedBytes).toBeLessThan(budget.rawBytes);
      expect(budget.fitsNtag215).toBeDefined();
    });

    it('getByteBudget: handles a realistically large profile and accurately reports capacity limit', () => {
      const payload = generateValidPatientPayload();

      // Bloat the profile to find out when it crosses NTAG215 boundary
      for (let i = 0; i < 15; i++) {
        payload.triageData.allergies.push(`Allergy Number ${i} - Severe Reaction`);
      }
      for (let i = 0; i < 10; i++) {
        payload.triageData.emergencyContacts.push({
          userId: `USER-${i}`,
          name: `Emergency Contact Person ${i}`
        });
      }

      const budget = NfcService.getByteBudget(payload);
      expect(budget.rawBytes).toBeGreaterThan(504); // Raw is definitely too large

      // We expect compression to still help, but it might cross 504.
      // We are just validating that the method correctly flags fitsNtag215
      expect(budget.fitsNtag215).toBe(budget.compressedBytes <= 504);
      expect(budget.efficiencyGainPercent).toBeGreaterThan(0);
    });
  });
});
