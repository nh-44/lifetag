/**
 * Phase 1 — Payload encoding comparison.
 *
 * Question: how many bytes does public-key trust cost on a passive NTAG21x
 * tag, and which encoding choices make it fit? Measures four variants
 * (V1 current production format, V2 raw-DEFLATE variant, V3 compact binary
 * no-compression, V4 compact binary + DEFLATE) across three profile sizes,
 * reporting the FULL on-tag byte breakdown (content -> compressed -> encoded
 * -> NDEF record -> TLV wrapper -> total), not just the compressed payload
 * length. See bench/lib/ndefOverhead.ts for the TLV/NDEF byte accounting and
 * bench/lib/binaryFormat.ts + bench/lib/ecPoint.ts for the V3/V4 format.
 *
 * Every variant is round-tripped (decode + signature verification) before
 * its sizes are reported — this file writes results/encoding.json only
 * after every round trip in the run has been asserted correct with Node's
 * built-in `assert`.
 */
import assert from 'assert';
import crypto from 'crypto';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

import { NTAG_CAPACITY_BYTES } from './lib/constants';
import { computeTagBytes, TagByteBreakdown } from './lib/ndefOverhead';
import { compressPointFromJwk, publicKeyFromCompressedPoint } from './lib/ecPoint';
import { toShortFormat, fromShortFormat, FullPayload } from './lib/shortFormat';
import { encodeBinaryPayload, decodeBinaryPayload } from './lib/binaryFormat';

// ---------------------------------------------------------------------------
// Sample profiles — same three sizes used by the pre-existing
// server/src/utils/benchmark.ts, for continuity with prior internal numbers.
// ---------------------------------------------------------------------------

interface ProfileInput {
  name: string;
  bloodGroup: string;
  allergies: string[];
  emergencyContacts: Array<{ userId: string; name: string }>;
  dnrStatus: boolean;
}

const PROFILES: Record<string, ProfileInput> = {
  'Small Profile': {
    name: 'Jane Doe',
    bloodGroup: 'A-Positive',
    allergies: [],
    emergencyContacts: [{ userId: 'US1', name: 'Bob' }],
    dnrStatus: false,
  },
  'Medium Profile': {
    name: 'John Doe',
    bloodGroup: 'O-Negative',
    allergies: ['Penicillin', 'Peanuts', 'Bee Stings'],
    emergencyContacts: [
      { userId: 'US98234', name: 'Jane Doe' },
      { userId: 'US54321', name: 'Bob Smith' },
    ],
    dnrStatus: true,
  },
  'Large Profile': {
    name: 'Jonathan Bartholomew Doe III',
    bloodGroup: 'AB-Negative',
    allergies: ['Penicillin', 'Peanuts', 'Bee Stings', 'Latex', 'Aspirin', 'Sulfa Drugs', 'Ibuprofen', 'Shellfish', 'Dairy', 'Gluten'],
    emergencyContacts: [
      { userId: 'US98234', name: 'Jane Doe' },
      { userId: 'US54321', name: 'Bob Smith' },
      { userId: 'US11111', name: 'Alice Jones' },
      { userId: 'US22222', name: 'Charlie Brown' },
      { userId: 'US33333', name: 'Eve White' },
    ],
    dnrStatus: true,
  },
};

// Throwaway authority key pair, generated fresh for this benchmark run —
// NOT the real production AUTHORITY_PRIVATE_KEY. The authority public key is
// never stored on the tag in any variant (it's a well-known constant baked
// into the client/server, per AUDIT.md §5) so it does not factor into
// on-tag byte counts; it's only needed here to produce and verify a
// realistic authoritySignature.
const AUTHORITY_KEYS = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });

function buildSignedPayload(input: ProfileInput, fhirPatientId: string): FullPayload {
  const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const patientPublicJwk = patientKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };

  const triageData = {
    name: input.name,
    bloodGroup: input.bloodGroup,
    allergies: input.allergies,
    emergencyContacts: input.emergencyContacts,
    dnrStatus: input.dnrStatus,
  };

  // Real patient signatures are raw IEEE P1363 (Web Crypto ECDSA output) —
  // see the dsaEncoding fix in server/src/utils/crypto.utils.ts and
  // RESULTS_LOG.md's "Critical fix" entry. Sign the same way here.
  const signature = crypto
    .sign('sha256', Buffer.from(JSON.stringify(triageData)), { key: patientKeys.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64');

  const tagId = JSON.stringify({ kty: 'EC', crv: 'P-256', x: patientPublicJwk.x, y: patientPublicJwk.y });

  const authoritySignature = crypto
    .sign('sha256', Buffer.from(tagId, 'utf8'), { key: AUTHORITY_KEYS.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64');

  return {
    version: '2.0',
    timestamp: new Date().toISOString(),
    fhirPatientId,
    triageData,
    tagId,
    signature,
    authoritySignature,
  };
}

function verifyPatientSignature(payload: FullPayload): boolean {
  const jwk = JSON.parse(payload.tagId);
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return crypto.verify(
    'sha256',
    Buffer.from(JSON.stringify(payload.triageData)),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(payload.signature, 'base64')
  );
}

function verifyAuthoritySignature(payload: FullPayload): boolean {
  if (!payload.authoritySignature) return false;
  return crypto.verify(
    'sha256',
    Buffer.from(payload.tagId, 'utf8'),
    { key: AUTHORITY_KEYS.publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(payload.authoritySignature, 'base64')
  );
}

// ---------------------------------------------------------------------------
// Reference-size sanity checks (Phase 1 spec: uncompressed point = 65B,
// compressed = 33B, raw P-256 signature = 64B). These are cheap invariants
// to assert once up front, before trusting any variant's byte counts.
// ---------------------------------------------------------------------------
function sanityCheckReferenceSizes() {
  const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = keys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const uncompressedPointBytes = 1 + Buffer.from(jwk.x, 'base64url').length + Buffer.from(jwk.y, 'base64url').length; // 0x04 || x || y
  assert.strictEqual(uncompressedPointBytes, 65, 'uncompressed P-256 point must be 65 bytes');

  const compressed = compressPointFromJwk(jwk);
  assert.strictEqual(compressed.length, 33, 'compressed P-256 point must be 33 bytes');

  const sig = crypto.sign('sha256', Buffer.from('probe'), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  assert.strictEqual(sig.length, 64, 'raw IEEE P1363 P-256 signature must be 64 bytes');
}

// ---------------------------------------------------------------------------
// V1: current production format — JWK (base64url x/y), base64 signatures, gzip
// ---------------------------------------------------------------------------
function encodeV1(payload: FullPayload) {
  const shortPayload = toShortFormat(payload);
  const contentString = JSON.stringify(shortPayload);
  const contentBytes = Buffer.byteLength(contentString, 'utf8');

  const compressed = zlib.gzipSync(Buffer.from(contentString, 'utf8'));
  const compressedBytes = compressed.length;

  const encodedContentString = `gzip:${compressed.toString('base64')}`;
  const encodedContentBytes = Buffer.byteLength(encodedContentString, 'utf8');

  const breakdown = computeTagBytes(contentBytes, compressedBytes, encodedContentBytes, 'text');

  // Round trip
  const prefix = 'gzip:';
  assert.ok(encodedContentString.startsWith(prefix));
  const decompressed = zlib.gunzipSync(Buffer.from(encodedContentString.slice(prefix.length), 'base64'));
  const decoded = fromShortFormat(JSON.parse(decompressed.toString('utf8')));
  assert.strictEqual(decoded.triageData.name, payload.triageData.name);
  assert.ok(verifyPatientSignature(decoded), 'V1 round-trip: patient signature must verify');
  assert.ok(verifyAuthoritySignature(decoded), 'V1 round-trip: authority signature must verify');

  return breakdown;
}

// ---------------------------------------------------------------------------
// V2: JWK + base64 signatures, raw DEFLATE (no gzip header/trailer) instead of gzip
// ---------------------------------------------------------------------------
function encodeV2(payload: FullPayload) {
  const shortPayload = toShortFormat(payload);
  const contentString = JSON.stringify(shortPayload);
  const contentBytes = Buffer.byteLength(contentString, 'utf8');

  const compressed = zlib.deflateRawSync(Buffer.from(contentString, 'utf8'));
  const compressedBytes = compressed.length;

  const encodedContentString = `defl:${compressed.toString('base64')}`;
  const encodedContentBytes = Buffer.byteLength(encodedContentString, 'utf8');

  const breakdown = computeTagBytes(contentBytes, compressedBytes, encodedContentBytes, 'text');

  const prefix = 'defl:';
  const decompressed = zlib.inflateRawSync(Buffer.from(encodedContentString.slice(prefix.length), 'base64'));
  const decoded = fromShortFormat(JSON.parse(decompressed.toString('utf8')));
  assert.strictEqual(decoded.triageData.name, payload.triageData.name);
  assert.ok(verifyPatientSignature(decoded), 'V2 round-trip: patient signature must verify');
  assert.ok(verifyAuthoritySignature(decoded), 'V2 round-trip: authority signature must verify');

  return breakdown;
}

// ---------------------------------------------------------------------------
// V3: compressed EC point + raw r||s signatures, no compression, written as
// a raw binary NDEF record (no base64 — see bench/lib/ndefOverhead.ts)
// ---------------------------------------------------------------------------
function encodeV3(payload: FullPayload) {
  const binary = encodeBinaryPayload(payload);
  const contentBytes = binary.length;
  const compressedBytes = contentBytes; // "none" compression
  const encodedContentBytes = binary.length; // written raw, no base64 inflation

  const breakdown = computeTagBytes(contentBytes, compressedBytes, encodedContentBytes, 'unknown-binary');

  const decoded = decodeBinaryPayload(binary);
  assert.strictEqual(decoded.triageData.name, payload.triageData.name);
  assert.ok(verifyPatientSignature(decoded), 'V3 round-trip: patient signature must verify');
  assert.ok(verifyAuthoritySignature(decoded), 'V3 round-trip: authority signature must verify');

  return breakdown;
}

// ---------------------------------------------------------------------------
// V4: compressed EC point + raw r||s signatures, DEFLATE-compressed, raw binary NDEF record
// ---------------------------------------------------------------------------
function encodeV4(payload: FullPayload) {
  const binary = encodeBinaryPayload(payload);
  const contentBytes = binary.length;

  const compressed = zlib.deflateRawSync(binary);
  const compressedBytes = compressed.length;
  const encodedContentBytes = compressed.length; // still raw binary, no base64

  const breakdown = computeTagBytes(contentBytes, compressedBytes, encodedContentBytes, 'unknown-binary');

  const decompressed = zlib.inflateRawSync(compressed);
  const decoded = decodeBinaryPayload(decompressed);
  assert.strictEqual(decoded.triageData.name, payload.triageData.name);
  assert.ok(verifyPatientSignature(decoded), 'V4 round-trip: patient signature must verify');
  assert.ok(verifyAuthoritySignature(decoded), 'V4 round-trip: authority signature must verify');

  return breakdown;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
function withMargins(b: TagByteBreakdown) {
  return {
    ...b,
    marginVsNtag215: NTAG_CAPACITY_BYTES.NTAG215 - b.totalTagBytes,
    marginVsNtag216: NTAG_CAPACITY_BYTES.NTAG216 - b.totalTagBytes,
    fitsNtag215: b.totalTagBytes <= NTAG_CAPACITY_BYTES.NTAG215,
    fitsNtag216: b.totalTagBytes <= NTAG_CAPACITY_BYTES.NTAG216,
  };
}

function main() {
  sanityCheckReferenceSizes();

  const results: any = {
    meta: {
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      capacityBytes: NTAG_CAPACITY_BYTES,
      variants: {
        V1: { publicKey: 'JWK base64url x/y', signatures: 'base64', compression: 'gzip', ndefRecord: 'text' },
        V2: { publicKey: 'JWK base64url x/y', signatures: 'base64', compression: 'raw DEFLATE', ndefRecord: 'text' },
        V3: { publicKey: 'SEC1 compressed point (33B)', signatures: 'raw r||s (64B each)', compression: 'none', ndefRecord: 'unknown-binary' },
        V4: { publicKey: 'SEC1 compressed point (33B)', signatures: 'raw r||s (64B each)', compression: 'raw DEFLATE', ndefRecord: 'unknown-binary' },
      },
    },
    profiles: {},
  };

  let fhirCounter = 1000;
  for (const [profileName, input] of Object.entries(PROFILES)) {
    const payload = buildSignedPayload(input, `FHIR-PATIENT-${fhirCounter++}`);

    // Sanity: the payload we just built must itself verify before we trust
    // any encoding's round trip against it.
    assert.ok(verifyPatientSignature(payload), `${profileName}: base payload patient signature must verify`);
    assert.ok(verifyAuthoritySignature(payload), `${profileName}: base payload authority signature must verify`);

    const v1 = withMargins(encodeV1(payload));
    const v2 = withMargins(encodeV2(payload));
    const v3 = withMargins(encodeV3(payload));
    const v4 = withMargins(encodeV4(payload));

    results.profiles[profileName] = { V1: v1, V2: v2, V3: v3, V4: v4 };
  }

  const outDir = path.resolve(__dirname, '..', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'encoding.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log(`\nAll round-trip assertions passed (decode + patient-signature + authority-signature verification for every variant x profile).`);
  console.log(`Wrote ${outPath}\n`);

  console.log('--- totalTagBytes by variant (NTAG215 budget = 504B, NTAG216 = 888B) ---');
  for (const [profileName, variants] of Object.entries<any>(results.profiles)) {
    console.log(`\n${profileName}:`);
    for (const v of ['V1', 'V2', 'V3', 'V4']) {
      const b = variants[v];
      console.log(
        `  ${v}: content=${b.contentBytes}B compressed=${b.compressedBytes}B encoded=${b.encodedContentBytes}B ` +
        `ndefRecord=${b.ndefRecordBytes}B tlv=${b.tlvBytes}B total=${b.totalTagBytes}B ` +
        `| fits215=${b.fitsNtag215} (margin ${b.marginVsNtag215}B) fits216=${b.fitsNtag216} (margin ${b.marginVsNtag216}B)`
      );
    }
  }
}

main();
