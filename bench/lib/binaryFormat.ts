/**
 * "AEGB1" (AegisTag Binary v1) — a compact fixed/length-prefixed binary
 * encoding of the triage payload, designed for the V3/V4 encoding variants
 * in bench/encoding-variants.ts. This is a benchmark-only construct (not
 * wired into the production client) that demonstrates the byte cost of
 * avoiding JSON + base64 for the public key and signatures.
 *
 * Layout (all integers big-endian, all strings UTF-8):
 *   [1]  versionMajor
 *   [1]  versionMinor
 *   [4]  timestamp (unix seconds, uint32)
 *   [1]  flags: bit0=dnrStatus, bit1=hasAuthoritySignature
 *   [1]  bloodGroupCode (0-7, see BLOOD_GROUP_CODES)
 *   [1+N] fhirPatientId: 1-byte length prefix + UTF-8 bytes
 *   [1+N] name: 1-byte length prefix + UTF-8 bytes
 *   [1]  allergyCount
 *        repeated: [1+N] length-prefixed UTF-8 allergy string
 *   [1]  contactCount
 *        repeated: [1+N] length-prefixed userId, [1+N] length-prefixed name
 *   [33] publicKey: SEC1-compressed P-256 point (see ecPoint.ts)
 *   [64] signature: raw IEEE P1363 r||s
 *   [64] authoritySignature: raw IEEE P1363 r||s (only present if flag bit1 set)
 *
 * Length-prefixed fields assume each string is under 255 bytes, which holds
 * for realistic triage data (see bench/sensitivity.ts for the string-length
 * assumptions used across this suite); this is a benchmark simplification,
 * not a claim that longer fields are unsupported in principle.
 */
import { compressPointFromJwk, publicKeyFromCompressedPoint } from './ecPoint';
import type { FullPayload } from './shortFormat';

const BLOOD_GROUP_CODES = [
  'O-Negative', 'O-Positive', 'A-Negative', 'A-Positive',
  'B-Negative', 'B-Positive', 'AB-Negative', 'AB-Positive',
] as const;

function writeLenPrefixed(chunks: Buffer[], str: string): void {
  const buf = Buffer.from(str, 'utf8');
  if (buf.length > 255) throw new Error(`Field too long for 1-byte length prefix: "${str.slice(0, 30)}..." (${buf.length}B)`);
  chunks.push(Buffer.from([buf.length]), buf);
}

function readLenPrefixed(buf: Buffer, offset: { i: number }): string {
  const len = buf[offset.i];
  offset.i += 1;
  const str = buf.subarray(offset.i, offset.i + len).toString('utf8');
  offset.i += len;
  return str;
}

export function encodeBinaryPayload(payload: FullPayload): Buffer {
  const [vMajorStr, vMinorStr] = payload.version.split('.');
  const vMajor = Number(vMajorStr) || 0;
  const vMinor = Number(vMinorStr) || 0;

  const bgCode = BLOOD_GROUP_CODES.indexOf(payload.triageData.bloodGroup as any);
  if (bgCode === -1) {
    throw new Error(`Unsupported blood group for binary format: ${payload.triageData.bloodGroup}`);
  }

  const hasAuthoritySignature = !!payload.authoritySignature;
  const flags = (payload.triageData.dnrStatus ? 0b01 : 0) | (hasAuthoritySignature ? 0b10 : 0);

  const timestampSec = Math.floor(new Date(payload.timestamp).getTime() / 1000);
  const timestampBuf = Buffer.alloc(4);
  timestampBuf.writeUInt32BE(timestampSec >>> 0, 0);

  const chunks: Buffer[] = [
    Buffer.from([vMajor & 0xff, vMinor & 0xff]),
    timestampBuf,
    Buffer.from([flags, bgCode]),
  ];

  writeLenPrefixed(chunks, payload.fhirPatientId);
  writeLenPrefixed(chunks, payload.triageData.name);

  const cleanAllergies = payload.triageData.allergies.filter(
    (a) => a.toLowerCase() !== 'none' && a.toLowerCase() !== 'no allergies'
  );
  if (cleanAllergies.length > 255) throw new Error('Too many allergies for 1-byte count');
  chunks.push(Buffer.from([cleanAllergies.length]));
  for (const a of cleanAllergies) writeLenPrefixed(chunks, a);

  const contacts = payload.triageData.emergencyContacts;
  if (contacts.length > 255) throw new Error('Too many contacts for 1-byte count');
  chunks.push(Buffer.from([contacts.length]));
  for (const c of contacts) {
    writeLenPrefixed(chunks, c.userId);
    writeLenPrefixed(chunks, c.name);
  }

  const jwk = JSON.parse(payload.tagId);
  const compressedPoint = compressPointFromJwk(jwk);
  if (compressedPoint.length !== 33) throw new Error(`Expected 33-byte compressed point, got ${compressedPoint.length}`);
  chunks.push(compressedPoint);

  const sigBuf = Buffer.from(payload.signature, 'base64');
  if (sigBuf.length !== 64) throw new Error(`Expected 64-byte raw P1363 signature, got ${sigBuf.length}`);
  chunks.push(sigBuf);

  if (hasAuthoritySignature) {
    const authSigBuf = Buffer.from(payload.authoritySignature!, 'base64');
    if (authSigBuf.length !== 64) throw new Error(`Expected 64-byte raw P1363 authority signature, got ${authSigBuf.length}`);
    chunks.push(authSigBuf);
  }

  return Buffer.concat(chunks);
}

export function decodeBinaryPayload(buf: Buffer): FullPayload {
  const offset = { i: 0 };
  const vMajor = buf[offset.i]; offset.i += 1;
  const vMinor = buf[offset.i]; offset.i += 1;
  const timestampSec = buf.readUInt32BE(offset.i); offset.i += 4;
  const flags = buf[offset.i]; offset.i += 1;
  const bgCode = buf[offset.i]; offset.i += 1;

  const fhirPatientId = readLenPrefixed(buf, offset);
  const name = readLenPrefixed(buf, offset);

  const allergyCount = buf[offset.i]; offset.i += 1;
  const allergies: string[] = [];
  for (let i = 0; i < allergyCount; i++) allergies.push(readLenPrefixed(buf, offset));

  const contactCount = buf[offset.i]; offset.i += 1;
  const emergencyContacts: Array<{ userId: string; name: string }> = [];
  for (let i = 0; i < contactCount; i++) {
    const userId = readLenPrefixed(buf, offset);
    const cName = readLenPrefixed(buf, offset);
    emergencyContacts.push({ userId, name: cName });
  }

  const compressedPoint = buf.subarray(offset.i, offset.i + 33); offset.i += 33;
  const publicKey = publicKeyFromCompressedPoint(Buffer.from(compressedPoint));
  const publicKeyJwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };

  const signature = buf.subarray(offset.i, offset.i + 64); offset.i += 64;

  let authoritySignature: string | undefined;
  if (flags & 0b10) {
    const authSig = buf.subarray(offset.i, offset.i + 64); offset.i += 64;
    authoritySignature = authSig.toString('base64');
  }

  return {
    version: `${vMajor}.${vMinor}`,
    timestamp: new Date(timestampSec * 1000).toISOString(),
    fhirPatientId,
    triageData: {
      name,
      bloodGroup: BLOOD_GROUP_CODES[bgCode],
      allergies, // must stay [] when empty — see shortFormat.ts's matching note
      emergencyContacts,
      dnrStatus: !!(flags & 0b01),
    },
    tagId: JSON.stringify({ kty: 'EC', crv: 'P-256', x: publicKeyJwk.x, y: publicKeyJwk.y }),
    signature: signature.toString('base64'),
    authoritySignature,
  };
}
