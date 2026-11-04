import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NfcCryptoService, CertifyFn } from '@/services/nfcCryptoService';

const P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/** Stands in for POST /issuance/certify: signs the cert string with a test authority key. */
let certify: CertifyFn;
let authorityPublic: { x: string; y: string };

beforeAll(async () => {
  const authority = await crypto.subtle.generateKey(P256, true, ['sign', 'verify']);
  const { x, y } = await crypto.subtle.exportKey('jwk', authority.publicKey);
  authorityPublic = { x: x!, y: y! };
  certify = async (pub, issuedAt) => {
    const certString = NfcCryptoService.certSigningString('12345', issuedAt, pub.x, pub.y);
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, authority.privateKey, new TextEncoder().encode(certString));
    return toB64(sig);
  };
});

afterEach(() => vi.unstubAllEnvs());

const patient = {
  name: 'Jane Doe',
  bloodGroup: 'O+', // short form, as stored in the DB
  allergies: ['None'], // filtered out on the tag
  emergencyContacts: [{ userId: 'US99999', name: 'Mom', phone: '555-0100' } as any], // extra field dropped on the tag
  dnrStatus: true,
  fhirPatientId: '12345',
};

describe('NfcCryptoService v3', () => {
  it('a certified tag verifies after the real compress/decompress round trip', async () => {
    vi.stubEnv('VITE_AUTHORITY_PUBLIC_KEYS', JSON.stringify([authorityPublic]));
    const payload = await NfcCryptoService.generateTagPayload(patient, certify);
    const onTag = await NfcCryptoService.decompressPayload(await NfcCryptoService.compressPayload(payload));

    expect(await NfcCryptoService.verifyTagIntegrity(onTag)).toEqual({ verified: true, trustedAuthority: true });
    expect(onTag.triageData.bloodGroup).toBe('O-Positive');
    expect(onTag.triageData.allergies).toEqual([]);
  });

  it('is only self-signed when the certifying key is not a configured trust anchor', async () => {
    const payload = await NfcCryptoService.generateTagPayload(patient, certify); // default (production) anchor
    expect(await NfcCryptoService.verifyTagIntegrity(payload)).toEqual({ verified: true, trustedAuthority: false });
  });

  it('rejects an edited issuedAt and a swapped patient ID', async () => {
    vi.stubEnv('VITE_AUTHORITY_PUBLIC_KEYS', JSON.stringify([authorityPublic]));
    const payload = await NfcCryptoService.generateTagPayload(patient, certify);

    const fresher = { ...payload, timestamp: new Date(Date.now() + 86_400_000).toISOString() };
    expect((await NfcCryptoService.verifyTagIntegrity(fresher)).verified).toBe(false);

    const otherPatient = { ...payload, fhirPatientId: '54321' };
    expect((await NfcCryptoService.verifyTagIntegrity(otherPatient)).verified).toBe(false);
  });

  it('rejects legacy v2 tags with a re-issue message', async () => {
    const payload = await NfcCryptoService.generateTagPayload(patient);
    const result = await NfcCryptoService.verifyTagIntegrity({ ...payload, version: '2.0' });
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/re-issued/);
  });

  it('uses a fresh key for every issuance (nothing persisted on the issuing device)', async () => {
    const a = await NfcCryptoService.generateTagPayload(patient);
    const b = await NfcCryptoService.generateTagPayload(patient);
    expect(a.tagId).not.toBe(b.tagId);
  });

  it('CROSS-IMPLEMENTATION VECTOR: canonical strings match server/src/tests/unit/nfc.service.spec.ts', () => {
    const content = NfcCryptoService.contentSigningString({
      version: '3.0',
      fhirPatientId: '12345',
      timestamp: '2026-10-31T12:00:00.000Z',
      triageData: patient,
    });
    expect(content).toBe(
      '["aegistag-content-v3","3.0","12345",1793448000,{"name":"Jane Doe","bloodGroup":"O-Positive","allergies":[],"emergencyContacts":[{"userId":"US99999","name":"Mom"}],"dnrStatus":true}]'
    );
    expect(NfcCryptoService.certSigningString('12345', 1793448000, 'X', 'Y')).toBe(
      '["aegistag-cert-v3","12345",1793448000,"X","Y"]'
    );
  });
});
