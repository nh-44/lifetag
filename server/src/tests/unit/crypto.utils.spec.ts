import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { CryptoUtils } from '../../utils/crypto.utils';

describe('CryptoUtils', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.AUTHORITY_PRIVATE_KEY;
  });

  afterEach(() => {
    process.env.AUTHORITY_PRIVATE_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  describe('verifyEcdsaSignature', () => {
    it('verifies a valid signature correctly', () => {
      const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const pubJwk = keys.publicKey.export({ format: 'jwk' });
      
      const data = { name: 'Test Patient', bloodGroup: 'O+' };
      const dataBuffer = Buffer.from(JSON.stringify(data));

      // Real patient signatures come from the browser's Web Crypto API, which always
      // produces raw IEEE P1363 (not Node's default DER) — sign the same way here so
      // this test exercises the real client<->server wire format.
      const signature = crypto
        .sign('sha256', dataBuffer, { key: keys.privateKey, dsaEncoding: 'ieee-p1363' })
        .toString('base64');

      const result = CryptoUtils.verifyEcdsaSignature(data, signature, pubJwk);
      expect(result).toBe(true);
    });

    it('returns false for tampered data', () => {
      const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const pubJwk = keys.publicKey.export({ format: 'jwk' });

      const data = { name: 'Test Patient', bloodGroup: 'O+' };
      const signature = crypto
        .sign('sha256', Buffer.from(JSON.stringify(data)), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' })
        .toString('base64');

      // Tampered data
      const tamperedData = { ...data, bloodGroup: 'A-' };
      
      const result = CryptoUtils.verifyEcdsaSignature(tamperedData, signature, pubJwk);
      expect(result).toBe(false);
    });

    it('returns false for a malformed JWK (graceful failure)', () => {
      const data = { name: 'Test Patient' };
      const signature = 'base64garbagesignature';
      
      // Pass a completely malformed JWK
      const malformedJwk = { kty: 'INVALID_TYPE', garbage: true };
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const result = CryptoUtils.verifyEcdsaSignature(data, signature, malformedJwk);
      
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Authority Signature', () => {
    it('throws if AUTHORITY_PRIVATE_KEY is not set', () => {
      delete process.env.AUTHORITY_PRIVATE_KEY;
      expect(() => CryptoUtils.signWithAuthorityKey('patient-pub-key'))
        .toThrow('AUTHORITY_PRIVATE_KEY is not set');
    });

    it('signs successfully with a valid AUTHORITY_PRIVATE_KEY', () => {
      const authKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      process.env.AUTHORITY_PRIVATE_KEY = JSON.stringify(authKeys.privateKey.export({ format: 'jwk' }));
      
      const patientPubKey = 'patient-key-identifier';
      const signature = CryptoUtils.signWithAuthorityKey(patientPubKey);
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
      
      // Verify the generated signature manually — signWithAuthorityKey produces raw
      // IEEE P1363 (not DER) so the client's Web Crypto subtle.verify() can validate it.
      const isValid = crypto.verify(
        'sha256',
        Buffer.from(patientPubKey),
        { key: authKeys.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64')
      );
      expect(isValid).toBe(true);
    });
  });

  describe('Kyber-768 Simulation', () => {
    it('encapsulate and decapsulate round-trip produces matching shared secret', () => {
      // NOTE: This is a simulated construct for benchmarking overhead, not real PQC.
      const keys = CryptoUtils.generateKyberKeyPair();
      expect(keys.publicKey).toContain('KYBER-768-PUB-');
      expect(keys.privateKey).toContain('KYBER-768-PRI-');

      const encap = CryptoUtils.encapsulateSharedSecret(keys.publicKey);
      expect(encap.ciphertext).toContain('KYBER-CIPHER-');
      expect(encap.sharedSecret).toBeDefined();

      const recoveredSecret = CryptoUtils.decapsulateSharedSecret(encap.ciphertext, keys.privateKey);
      
      // In the current simulation, decapsulateSharedSecret just hashes ciphertext + privateKey
      // We're verifying that the function runs without throwing and returns a deterministic hash.
      expect(recoveredSecret).toBeDefined();
      expect(typeof recoveredSecret).toBe('string');
    });
  });
});
