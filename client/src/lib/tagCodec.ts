/**
 * AegisTag NDEF codec: payload <-> NDEF records, plus exact on-tag byte counts.
 *
 * Write formats:
 *  - "v3-binary": one NDEF record with TNF=Unknown (Web NFC recordType "unknown")
 *    holding the compact AEGB layout below. SEC1-compressed key, raw 64-byte
 *    signatures, no JSON/base64/gzip. This is the paper's V3 encoding, now
 *    deployed (identical layout to bench/lib/binaryFormat.ts).
 *  - "v1-text": one text record "gzip:<base64(gzip(short JSON))>", the original
 *    encoding. Kept for compatibility and for V1-vs-V3 physical trials.
 *  - "id-only": a text record holding just the 5-digit account ID. No clinical
 *    data at all (fits NTAG213); the responder must look the patient up online.
 *
 * AEGB layout (big-endian):
 *   [1] versionMajor [1] versionMinor [4] issuedAt (uint32 unix s)
 *   [1] flags: bit0 dnr, bit1 hasAuthoritySignature
 *   [1] bloodGroup code 0-7, or 0xFF followed by a length-prefixed string
 *   [1+N] fhirPatientId  [1+N] name
 *   [1] allergyCount, then [1+N] each
 *   [1] contactCount, then [1+N] userId + [1+N] name each
 *   [33] SEC1 compressed public key  [64] signature  [64] authoritySignature (if flag)
 */
import { NfcTagPayload } from "@/types";
import { NfcCryptoService } from "@/services/nfcCryptoService";
import { compressPoint, decompressPoint } from "@/lib/ecPoint";

export type TagFormat = "v3-binary" | "v1-text" | "id-only";
export type DecodedFormat = TagFormat | "legacy-binary-gzip" | "plain-json";

/** Minimal shape of a Web NFC NDEFRecordInit we produce. */
export interface NdefRecordInit {
  recordType: "unknown" | "text" | "empty";
  data?: ArrayBuffer | string;
  lang?: string;
}

/** Minimal shape of a Web NFC NDEFRecord we consume (as delivered in a "reading" event). */
export interface NdefRecordLike {
  recordType: string;
  mediaType?: string | null;
  data?: DataView | ArrayBuffer | Uint8Array | null;
  encoding?: string | null;
}

export const TAG_CAPACITY_BYTES = { NTAG213: 144, NTAG215: 504, NTAG216: 888 } as const;
export type TagModel = keyof typeof TAG_CAPACITY_BYTES;

export class TagDecodeError extends Error {
  constructor(public reason: "empty" | "unrecognized" | "corrupt", message: string) {
    super(message);
    this.name = "TagDecodeError";
  }
}

const BLOOD_GROUP_CODES = [
  "O-Negative", "O-Positive", "A-Negative", "A-Positive",
  "B-Negative", "B-Positive", "AB-Negative", "AB-Positive",
];

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

// ---------------------------------------------------------------------------
// Byte accounting (NFC Forum Type 2 Tag: NDEF TLV + record header), mirrors bench/lib/ndefOverhead.ts
// ---------------------------------------------------------------------------

/** Total bytes the message occupies in tag user memory, including TLV wrapper and terminator. */
export function onTagBytes(recordType: "text" | "unknown", contentBytes: number): number {
  // A text record's payload is status byte + "en" + the text; TNF=Unknown has no type field.
  const recordPayload = recordType === "text" ? 3 + contentBytes : contentBytes;
  const lengthField = recordPayload < 256 ? 1 : 4; // short-record (SR) flag
  const typeField = recordType === "text" ? 1 : 0; // "T"
  const message = 1 /* header */ + 1 /* type length */ + lengthField + typeField + recordPayload;
  const tlv = 1 /* 0x03 */ + (message <= 254 ? 1 : 3) + 1; /* 0xFE terminator */
  return message + tlv;
}

// ---------------------------------------------------------------------------
// V3 binary
// ---------------------------------------------------------------------------

function pushLenPrefixed(out: number[], s: string) {
  const b = enc.encode(s);
  if (b.length > 255) throw new Error(`Field too long for the binary tag format (${b.length} B): "${s.slice(0, 24)}…"`);
  out.push(b.length, ...b);
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

export function encodeV3(payload: NfcTagPayload): Uint8Array {
  if (!payload.signature || !payload.tagId) throw new Error("V3 tags must be signed");
  const t = NfcCryptoService.canonicalTriage(payload.triageData);
  const [maj, min] = payload.version.split(".").map((n) => Number(n) || 0);
  const issuedAt = NfcCryptoService.issuedAtSeconds(payload.timestamp);
  const out: number[] = [maj & 0xff, min & 0xff, (issuedAt >>> 24) & 0xff, (issuedAt >>> 16) & 0xff, (issuedAt >>> 8) & 0xff, issuedAt & 0xff];
  out.push((t.dnrStatus ? 1 : 0) | (payload.authoritySignature ? 2 : 0));
  const bg = BLOOD_GROUP_CODES.indexOf(t.bloodGroup);
  if (bg >= 0) out.push(bg);
  else {
    out.push(0xff);
    pushLenPrefixed(out, t.bloodGroup);
  }
  pushLenPrefixed(out, payload.fhirPatientId);
  pushLenPrefixed(out, t.name);
  if (t.allergies.length > 255 || t.emergencyContacts.length > 255) throw new Error("Too many list entries for the binary tag format");
  out.push(t.allergies.length);
  t.allergies.forEach((a) => pushLenPrefixed(out, a));
  out.push(t.emergencyContacts.length);
  t.emergencyContacts.forEach((c) => {
    pushLenPrefixed(out, c.userId);
    pushLenPrefixed(out, c.name);
  });
  const { x, y } = JSON.parse(payload.tagId);
  out.push(...compressPoint(x, y));
  const sig = fromBase64(payload.signature);
  if (sig.length !== 64) throw new Error(`Expected a 64-byte P1363 signature, got ${sig.length}`);
  out.push(...sig);
  if (payload.authoritySignature) {
    const asig = fromBase64(payload.authoritySignature);
    if (asig.length !== 64) throw new Error(`Expected a 64-byte authority signature, got ${asig.length}`);
    out.push(...asig);
  }
  return Uint8Array.from(out);
}

export function decodeV3(bytes: Uint8Array): NfcTagPayload {
  let i = 0;
  const need = (n: number) => {
    if (i + n > bytes.length) throw new TagDecodeError("corrupt", "Binary tag data is truncated");
  };
  const u8 = () => {
    need(1);
    return bytes[i++];
  };
  const take = (n: number) => {
    need(n);
    const s = bytes.subarray(i, i + n);
    i += n;
    return s;
  };
  const str = () => {
    try {
      return dec.decode(take(u8()));
    } catch (e) {
      if (e instanceof TagDecodeError) throw e;
      throw new TagDecodeError("corrupt", "Binary tag contains invalid text");
    }
  };

  const maj = u8();
  const min = u8();
  const issuedAt = ((u8() << 24) | (u8() << 16) | (u8() << 8) | u8()) >>> 0;
  const flags = u8();
  const bgCode = u8();
  const bloodGroup = bgCode === 0xff ? str() : BLOOD_GROUP_CODES[bgCode];
  if (!bloodGroup) throw new TagDecodeError("corrupt", "Unknown blood group code");
  const fhirPatientId = str();
  const name = str();
  const allergies = Array.from({ length: u8() }, str);
  const emergencyContacts = Array.from({ length: u8() }, () => ({ userId: str(), name: str() }));
  let point: { x: string; y: string };
  try {
    point = decompressPoint(take(33));
  } catch (e) {
    if (e instanceof TagDecodeError) throw e;
    throw new TagDecodeError("corrupt", "Tag public key is not a valid P-256 point");
  }
  const signature = toBase64(take(64));
  const authoritySignature = flags & 2 ? toBase64(take(64)) : undefined;
  if (i !== bytes.length) throw new TagDecodeError("corrupt", `Unexpected ${bytes.length - i} trailing bytes`);

  return {
    version: `${maj}.${min}`,
    timestamp: new Date(issuedAt * 1000).toISOString(),
    fhirPatientId,
    triageData: { name, bloodGroup, allergies, emergencyContacts, dnrStatus: !!(flags & 1) },
    tagId: JSON.stringify({ kty: "EC", crv: "P-256", x: point.x, y: point.y }),
    signature,
    authoritySignature,
  };
}

// ---------------------------------------------------------------------------
// Encode for writing
// ---------------------------------------------------------------------------

export interface EncodedTag {
  format: TagFormat;
  records: NdefRecordInit[];
  /** Exact bytes the NDEF message will occupy in tag user memory. */
  tagBytes: number;
  /** The record payload, for read-back comparison. */
  content: Uint8Array;
}

export async function encodeTag(payload: NfcTagPayload, format: TagFormat): Promise<EncodedTag> {
  if (format === "v3-binary") {
    const content = encodeV3(payload);
    return {
      format,
      records: [{ recordType: "unknown", data: content.slice().buffer }],
      tagBytes: onTagBytes("unknown", content.length),
      content,
    };
  }
  if (format === "id-only") {
    if (!/^\d{5}$/.test(payload.fhirPatientId)) throw new Error("ID-only tags need a 5-digit account ID");
    const text = payload.fhirPatientId;
    return { format, records: [{ recordType: "text", data: text, lang: "en" }], tagBytes: onTagBytes("text", text.length), content: enc.encode(text) };
  }
  const gz = await NfcCryptoService.compressPayload(payload);
  const text = `gzip:${toBase64(gz)}`;
  return { format, records: [{ recordType: "text", data: text, lang: "en" }], tagBytes: onTagBytes("text", text.length), content: enc.encode(text) };
}

// ---------------------------------------------------------------------------
// Decode what was read
// ---------------------------------------------------------------------------

export function recordBytes(data: NdefRecordLike["data"]): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Web NFC (Chromium) delivers a text record's data WITHOUT the NDEF status byte
 * and language code. Some readers/polyfills hand over the raw payload instead, so
 * strip "status + lang" only when the first byte is a plausible status byte and the
 * remainder doesn't already look like our content.
 */
export function decodeTextRecord(record: NdefRecordLike): string {
  const bytes = recordBytes(record.data);
  const direct = new TextDecoder(record.encoding || "utf-8").decode(bytes);
  if (/^(gzip:|\{|\d{5}\s*$)/.test(direct)) return direct;
  const status = bytes[0];
  const langLen = status & 0x3f;
  if (bytes.length > 1 + langLen && langLen > 0 && langLen < 8 && (status & 0x40) === 0) {
    return new TextDecoder(status & 0x80 ? "utf-16" : "utf-8").decode(bytes.subarray(1 + langLen));
  }
  return direct;
}

export interface DecodedTag {
  payload: NfcTagPayload;
  format: DecodedFormat;
  contentBytes: number;
}

const idOnlyPayload = (id: string): NfcTagPayload => ({
  // No clinical data exists on an ID-only tag: never invent defaults here.
  version: "id-only",
  timestamp: "",
  fhirPatientId: id,
  isUnsigned: true,
  triageData: { name: "Unknown (ID-only tag)", bloodGroup: "Unknown", allergies: ["Unknown"], emergencyContacts: [], dnrStatus: false },
});

export async function decodeTagMessage(message: { records?: NdefRecordLike[] } | null | undefined): Promise<DecodedTag> {
  const records = (message?.records || []).filter((r) => r.recordType !== "empty");
  if (records.length === 0) throw new TagDecodeError("empty", "The tag is blank (no NDEF records)");

  let lastError: TagDecodeError | null = null;
  for (const record of records) {
    try {
      const bytes = recordBytes(record.data);
      if (record.recordType === "unknown") {
        if (bytes[0] !== 3) throw new TagDecodeError("unrecognized", `Unsupported binary tag version ${bytes[0]}`);
        return { payload: decodeV3(bytes), format: "v3-binary", contentBytes: bytes.length };
      }
      if (record.recordType === "mime" && record.mediaType === "application/octet-stream") {
        return { payload: await NfcCryptoService.decompressPayload(bytes), format: "legacy-binary-gzip", contentBytes: bytes.length };
      }
      if (record.recordType === "text") {
        const text = decodeTextRecord(record).trim();
        if (text.startsWith("gzip:")) {
          const gz = fromBase64(text.slice(5));
          return { payload: await NfcCryptoService.decompressPayload(gz), format: "v1-text", contentBytes: bytes.length };
        }
        if (/^\d{5}$/.test(text)) return { payload: idOnlyPayload(text), format: "id-only", contentBytes: bytes.length };
        const jsonStart = text.indexOf("{");
        if (jsonStart !== -1) {
          const obj = JSON.parse(text.slice(jsonStart));
          const payload = obj.d || obj.id ? NfcCryptoService.fromShortFormat(obj) : (obj as NfcTagPayload);
          if (!payload?.fhirPatientId || !payload?.triageData) throw new TagDecodeError("corrupt", "JSON on tag is not an AegisTag payload");
          return { payload, format: "plain-json", contentBytes: bytes.length };
        }
        throw new TagDecodeError("unrecognized", `Text on tag is not an AegisTag payload: "${text.slice(0, 40)}"`);
      }
      throw new TagDecodeError("unrecognized", `Unsupported record type "${record.recordType}"`);
    } catch (e) {
      lastError = e instanceof TagDecodeError ? e : new TagDecodeError("corrupt", e instanceof Error ? e.message : String(e));
    }
  }
  throw lastError!;
}

/** Byte-for-byte comparison of what was read back against what was written. */
export function sameContent(written: EncodedTag, read: { records?: NdefRecordLike[] } | null | undefined): boolean {
  const rec = (read?.records || []).find((r) => r.recordType !== "empty");
  if (!rec) return false;
  const got = written.format === "v3-binary" ? recordBytes(rec.data) : enc.encode(decodeTextRecord(rec));
  return got.length === written.content.length && got.every((b, i) => b === written.content[i]);
}
