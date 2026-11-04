/**
 * Builds real v3 tag payloads (real ECDSA P-256, P1363 signatures, the same
 * canonical signing strings the client uses) so tests exercise production
 * verification instead of mocking it.
 */
import crypto from 'crypto';
import {
  NfcService,
  TriagePayload,
  TAG_FORMAT_VERSION,
  contentSigningString,
  certSigningString,
} from '../../services/nfc.service';

export interface AuthorityFixture {
  privateKey: crypto.KeyObject;
  publicJwk: crypto.webcrypto.JsonWebKey;
  restore: () => void;
}

/** Generates a throwaway authority key and installs it as both signer (env) and trust anchor. */
export function installTestAuthority(): AuthorityFixture {
  const originalEnv = process.env.AUTHORITY_PRIVATE_KEY;
  const originalOverride = NfcService.authorityPublicKeysOverride;
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  process.env.AUTHORITY_PRIVATE_KEY = JSON.stringify(privateKey.export({ format: 'jwk' }));
  NfcService.authorityPublicKeysOverride = [publicJwk];
  return {
    privateKey,
    publicJwk,
    restore: () => {
      if (originalEnv === undefined) delete process.env.AUTHORITY_PRIVATE_KEY;
      else process.env.AUTHORITY_PRIVATE_KEY = originalEnv;
      NfcService.authorityPublicKeysOverride = originalOverride;
    },
  };
}

const sign = (key: crypto.KeyObject, data: string) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }).toString('base64');

export function buildTag(opts: {
  fhirPatientId: string;
  issuedAtSec?: number;
  authorityKey?: crypto.KeyObject | null; // null => self-signed (no certificate)
  triageData?: Partial<TriagePayload['triageData']>;
}): TriagePayload {
  const issuedAtSec = opts.issuedAtSec ?? Math.floor(Date.now() / 1000);
  const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { x, y } = patientKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };

  const payload: TriagePayload = {
    version: TAG_FORMAT_VERSION,
    timestamp: new Date(issuedAtSec * 1000).toISOString(),
    fhirPatientId: opts.fhirPatientId,
    tagId: JSON.stringify({ kty: 'EC', crv: 'P-256', x, y }),
    triageData: {
      name: 'John Doe',
      bloodGroup: 'O-Negative',
      allergies: ['Penicillin'],
      emergencyContacts: [{ userId: 'US98234', name: 'Jane Doe' }],
      dnrStatus: true,
      ...opts.triageData,
    },
    signature: '',
  };
  payload.signature = sign(patientKeys.privateKey, contentSigningString(payload));
  if (opts.authorityKey) {
    payload.authoritySignature = sign(opts.authorityKey, certSigningString(opts.fhirPatientId, issuedAtSec, x, y));
  }
  return payload;
}
