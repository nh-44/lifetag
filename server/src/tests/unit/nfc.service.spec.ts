import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { NfcService, TriagePayload } from '../../services/nfc.service';
import { CryptoUtils } from '../../utils/crypto.utils';

describe('NfcService', () => {
  let originalAuthPubKey: any;
  let originalEnv: string | undefined;
  
  // Setup generated authority keys for testing
  let testAuthorityKeys: crypto.KeyPairSyncResult<string, string>;

  beforeEach(() => {
    originalAuthPubKey = (NfcService as any).AUTHORITY_PUBLIC_KEY_JWK;
    originalEnv = process.env.AUTHORITY_PRIVATE_KEY;

    testAuthorityKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const authPrivJwk = testAuthorityKeys.privateKey.export({ format: 'jwk' });
    const authPubJwk = testAuthorityKeys.publicKey.export({ format: 'jwk' });

    process.env.AUTHORITY_PRIVATE_KEY = JSON.stringify(authPrivJwk);
    (NfcService as any).AUTHORITY_PUBLIC_KEY_JWK = authPubJwk;
  });

  afterEach(() => {
    (NfcService as any).AUTHORITY_PUBLIC_KEY_JWK = originalAuthPubKey;
    process.env.AUTHORITY_PRIVATE_KEY = originalEnv;
  });

  const generateValidPatientPayload = (): TriagePayload => {
    const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const patientPublicKeyJwk = patientKeys.publicKey.export({ format: 'jwk' });
    
    const triageData = {
      name: 'John Doe',
      bloodGroup: 'O-Negative',
      allergies: ['Penicillin'],
      emergencyContacts: [{ userId: 'US98234', name: 'Jane Doe' }],
      dnrStatus: true,
    };
    
    const signer = crypto.createSign('SHA256');
    signer.update(Buffer.from(JSON.stringify(triageData)));
    const signature = signer.sign(patientKeys.privateKey).toString('base64');

    return {
      version: '2.0',
      timestamp: new Date().toISOString(),
      fhirPatientId: 'FHIR-PATIENT-9923412',
      tagId: JSON.stringify(patientPublicKeyJwk),
      triageData,
      signature
    };
  };

  describe('verifyTagIntegrity', () => {
    it('verifies a valid self-signed tag (patient signed, missing authority signature)', () => {
      const payload = generateValidPatientPayload();
      
      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(payload);
      expect(verified).toBe(true);
      expect(trustedAuthority).toBe(false); // No authority signature present
    });

    it('rejects tampered patient triage data', () => {
      const payload = generateValidPatientPayload();
      payload.triageData.bloodGroup = 'A-Positive'; // Tamper
      
      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(payload);
      expect(verified).toBe(false);
      expect(trustedAuthority).toBe(false);
    });

    it('rejects unsigned payloads', () => {
      const payload = generateValidPatientPayload();
      payload.signature = ''; // Missing
      
      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(payload);
      expect(verified).toBe(false);
      expect(trustedAuthority).toBe(false);
    });
    
    it('rejects if tagId (public key) is missing', () => {
      const payload = generateValidPatientPayload();
      payload.tagId = ''; // Missing
      
      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(payload);
      expect(verified).toBe(false);
      expect(trustedAuthority).toBe(false);
    });

    it('verifies a valid Authority-certified tag correctly', () => {
      const payload = generateValidPatientPayload();
      payload.authoritySignature = CryptoUtils.signWithAuthorityKey(payload.tagId);
      
      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(payload);
      expect(verified).toBe(true);
      expect(trustedAuthority).toBe(true); // Certified
    });

    it('rejects a forged authority signature (wrong signing key)', () => {
      const payload = generateValidPatientPayload();
      
      // Sign with a DIFFERENT generated key (rogue authority)
      const rogueKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const signer = crypto.createSign('SHA256');
      signer.update(payload.tagId);
      payload.authoritySignature = signer.sign(rogueKeys.privateKey).toString('base64');
      
      const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(payload);
      
      // The patient signature is still valid, but authority is forged
      expect(verified).toBe(true);
      expect(trustedAuthority).toBe(false); 
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
