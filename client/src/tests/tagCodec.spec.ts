import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { NfcCryptoService, CertifyFn } from '@/services/nfcCryptoService';
import {
  encodeTag, decodeTagMessage, encodeV3, decodeV3, onTagBytes, sameContent, TagDecodeError,
} from '@/lib/tagCodec';
import { compressPoint, decompressPoint } from '@/lib/ecPoint';

const P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const;
let certify: CertifyFn;
let anchor: { x: string; y: string };

beforeAll(async () => {
  const authority = await crypto.subtle.generateKey(P256, true, ['sign', 'verify']);
  const { x, y } = await crypto.subtle.exportKey('jwk', authority.publicKey);
  anchor = { x: x!, y: y! };
  certify = async (pub, issuedAt) => {
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, authority.privateKey,
      new TextEncoder().encode(NfcCryptoService.certSigningString('12345', issuedAt, pub.x, pub.y))
    );
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  };
});
afterEach(() => vi.unstubAllEnvs());

const medium = {
  name: 'John Doe', bloodGroup: 'O-Negative', allergies: ['Penicillin', 'Peanuts', 'Bee Stings'],
  emergencyContacts: [{ userId: 'US98234', name: 'Jane Doe' }, { userId: 'US54321', name: 'Bob Smith' }],
  dnrStatus: true, fhirPatientId: '12345',
};

/** What a Chrome "reading" event hands over for our records. */
const asRead = (records: any[]) => ({
  records: records.map((r) => r.recordType === 'text'
    ? { recordType: 'text', encoding: 'utf-8', data: new DataView(new TextEncoder().encode(r.data).buffer) }
    : { recordType: r.recordType, data: new DataView(r.data) }),
});

describe('ecPoint', () => {
  it('compress/decompress round-trips real Web Crypto keys', async () => {
    for (let i = 0; i < 10; i++) {
      const k = await crypto.subtle.generateKey(P256, true, ['sign', 'verify']);
      const { x, y } = await crypto.subtle.exportKey('jwk', k.publicKey);
      expect(decompressPoint(compressPoint(x!, y!))).toEqual({ x, y });
    }
  });

  it('rejects an x that is not on the curve', () => {
    const bad = new Uint8Array(33); bad[0] = 2; bad[32] = 1; // x = 1: x^3 - 3x + b is a non-residue mod p
    expect(() => decompressPoint(bad)).toThrow(/Not a point/);
  });
});

describe('V3 binary format', () => {
  it('a certified tag survives encode -> NDEF read -> decode and still verifies as authority-certified', async () => {
    vi.stubEnv('VITE_AUTHORITY_PUBLIC_KEYS', JSON.stringify([anchor]));
    const payload = await NfcCryptoService.generateTagPayload(medium, certify);
    const encoded = await encodeTag(payload, 'v3-binary');
    const decoded = await decodeTagMessage(asRead(encoded.records));
    expect(decoded.format).toBe('v3-binary');
    expect(await NfcCryptoService.verifyTagIntegrity(decoded.payload)).toEqual({ verified: true, trustedAuthority: true });
  });

  it("reproduces the paper's V3 byte count (Medium profile: 263 B content, 274 B on tag)", async () => {
    // Same profile and patient-ID string as bench/encoding-variants.ts (counter starts at 1000; Medium is second).
    const payload = await NfcCryptoService.generateTagPayload({ ...medium, fhirPatientId: 'FHIR-PATIENT-1001' }, certify);
    const encoded = await encodeTag(payload, 'v3-binary');
    expect(encoded.content.length).toBe(263);
    expect(encoded.tagBytes).toBe(274);
  });

  it('V1 text byte accounting matches the paper (557 B content -> 572 B on tag)', () => {
    expect(onTagBytes('text', 557)).toBe(572);
  });

  it('encodes a non-standard blood group losslessly', async () => {
    const payload = await NfcCryptoService.generateTagPayload({ ...medium, bloodGroup: 'Bombay (hh)' });
    expect(decodeV3(encodeV3(payload)).triageData.bloodGroup).toBe('Bombay (hh)');
  });

  it('detects truncation and trailing garbage', async () => {
    const bytes = encodeV3(await NfcCryptoService.generateTagPayload(medium));
    expect(() => decodeV3(bytes.subarray(0, bytes.length - 10))).toThrow(TagDecodeError);
    expect(() => decodeV3(Uint8Array.from([...bytes, 0]))).toThrow(/trailing/);
  });

  it('a single flipped content bit fails signature verification', async () => {
    const bytes = encodeV3(await NfcCryptoService.generateTagPayload(medium));
    bytes[12] ^= 0x01; // inside the name field
    const result = await NfcCryptoService.verifyTagIntegrity(decodeV3(bytes));
    expect(result.verified).toBe(false);
  });
});

describe('V1 text and other formats', () => {
  it('V1 round-trips through a text record and verifies', async () => {
    const payload = await NfcCryptoService.generateTagPayload(medium);
    const encoded = await encodeTag(payload, 'v1-text');
    const decoded = await decodeTagMessage(asRead(encoded.records));
    expect(decoded.format).toBe('v1-text');
    expect((await NfcCryptoService.verifyTagIntegrity(decoded.payload)).verified).toBe(true);
    expect(encoded.tagBytes).toBeGreaterThan((await encodeTag(payload, 'v3-binary')).tagBytes);
  });

  it('ID-only tags carry no clinical data and are flagged unsigned', async () => {
    const encoded = await encodeTag({ ...(await NfcCryptoService.generateTagPayload(medium)) }, 'id-only');
    const decoded = await decodeTagMessage(asRead(encoded.records));
    expect(decoded.format).toBe('id-only');
    expect(decoded.payload.isUnsigned).toBe(true);
    expect(decoded.payload.triageData.bloodGroup).toBe('Unknown');
  });

  it('reads plain-text JSON written by third-party apps (e.g. NFC Tools) as plain-json', async () => {
    const decoded = await decodeTagMessage(asRead([{ recordType: 'text', data: JSON.stringify({ v: '3.0', t: 1, id: '12345', d: { n: 'A', b: 'O+', a: [], c: [], dnr: false } }) }]));
    expect(decoded.format).toBe('plain-json');
    expect(decoded.payload.fhirPatientId).toBe('12345');
  });

  it('strips a raw status byte + language code if a reader delivers them', async () => {
    const raw = Uint8Array.from([0x02, 0x65, 0x6e, ...new TextEncoder().encode('12345')]);
    const decoded = await decodeTagMessage({ records: [{ recordType: 'text', data: new DataView(raw.buffer) }] });
    expect(decoded.payload.fhirPatientId).toBe('12345');
  });

  it.each([
    [{ records: [] }, 'empty'],
    [{ records: [{ recordType: 'empty' }] }, 'empty'],
    [{ records: [{ recordType: 'url', data: new DataView(new Uint8Array([1]).buffer) }] }, 'unrecognized'],
    [{ records: [{ recordType: 'text', data: new DataView(new TextEncoder().encode('hello').buffer) }] }, 'unrecognized'],
  ])('classifies %j as %s', async (msg, reason) => {
    await expect(decodeTagMessage(msg as any)).rejects.toMatchObject({ reason });
  });

  it('sameContent confirms a byte-identical read-back and rejects a different tag', async () => {
    const payload = await NfcCryptoService.generateTagPayload(medium);
    const a = await encodeTag(payload, 'v3-binary');
    const b = await encodeTag(await NfcCryptoService.generateTagPayload(medium), 'v3-binary');
    expect(sameContent(a, asRead(a.records))).toBe(true);
    expect(sameContent(a, asRead(b.records))).toBe(false);
  });
});
