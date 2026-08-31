/**
 * Byte-accounting for what actually sits in an NTAG21x's user memory, per
 * the NFC Forum "Type 2 Tag Operation" specification and the NDEF binary
 * message format — not just the compressed payload length.
 *
 * User memory layout (after the lock bytes / capability container, which
 * are outside the budgets this module computes):
 *
 *   [NDEF Message TLV] [Terminator TLV]
 *   0x03 <length> <NDEF message bytes...>  0xFE
 *
 * An NDEF message here is a single record (MB=1, ME=1, CF=0). Two record
 * shapes are used by the four encodings in bench/encoding-variants.ts:
 *
 *  - TEXT record (TNF=0x01 "well-known", type="T"), used by V1/V2 because
 *    the production client (client/src/components/nfc/NfcWriter.tsx) writes
 *    `recordType: "text"` for maximum reader compatibility. A short (SR)
 *    text record's payload itself carries a 1-byte status flag + a 2-byte
 *    IETF language code ("en") before the actual text.
 *  - UNKNOWN-type binary record (TNF=0x05), used by V3/V4. This TNF has NO
 *    type field at all (type length = 0), and the payload is raw bytes with
 *    no status/language header — the whole point of using it for V3/V4 is
 *    to skip both the base64 text-safety tax AND the text-record overhead.
 *    Web NFC's NDEFRecord API supports this via `recordType: "unknown"`
 *    with raw binary `data`.
 */

export type NdefRecordShape = 'text' | 'unknown-binary';

/** NDEF Message TLV (0x03) + Terminator TLV (0xFE) overhead, per Type 2 Tag spec. */
export function tlvOverheadBytes(ndefMessageLength: number): number {
  // TLV length field is 1 byte for messages <= 254 bytes, else 0xFF + 2-byte
  // big-endian length (3 bytes) per the Type 2 Tag Operation spec.
  const lengthFieldBytes = ndefMessageLength <= 254 ? 1 : 3;
  const tlvTypeByte = 1; // 0x03
  const terminatorTlv = 1; // 0xFE
  return tlvTypeByte + lengthFieldBytes + terminatorTlv;
}

/**
 * Fixed NDEF record overhead (header byte + type-length byte + payload-length
 * field(s) + type field + any payload-internal header) for a single,
 * standalone (MB=1/ME=1/CF=0) record. Does NOT include the record's actual
 * content bytes — call with contentBytes only to pick the short-record (SR)
 * vs. long-record payload-length field width.
 */
export function ndefRecordOverheadBytes(shape: NdefRecordShape, contentBytes: number): number {
  const isShortRecord = contentBytes < 256; // SR flag: payload length fits in 1 byte
  const payloadLengthFieldBytes = isShortRecord ? 1 : 4;
  const recordHeaderByte = 1; // MB|ME|CF|SR|IL|TNF

  if (shape === 'text') {
    const typeLengthByte = 1;
    const typeField = 1; // "T"
    const payloadInternalHeader = 1 /* status byte */ + 2; /* "en" language code */
    return recordHeaderByte + typeLengthByte + payloadLengthFieldBytes + typeField + payloadInternalHeader;
  }

  // TNF=0x05 Unknown: type length is always 0, no type field, no payload-internal header.
  const typeLengthByte = 1; // present, but value is 0
  return recordHeaderByte + typeLengthByte + payloadLengthFieldBytes;
}

export interface TagByteBreakdown {
  contentBytes: number;
  compressedBytes: number;
  encodedContentBytes: number; // what's actually placed in the NDEF payload (post base64, if any)
  ndefRecordBytes: number;
  tlvBytes: number;
  totalTagBytes: number;
}

/** Assembles the full on-tag byte breakdown for one encoded payload. */
export function computeTagBytes(
  contentBytes: number,
  compressedBytes: number,
  encodedContentBytes: number,
  shape: NdefRecordShape
): TagByteBreakdown {
  const ndefRecordBytes = ndefRecordOverheadBytes(shape, encodedContentBytes);
  const ndefMessageLength = ndefRecordBytes + encodedContentBytes;
  const tlvBytes = tlvOverheadBytes(ndefMessageLength);
  const totalTagBytes = tlvBytes + ndefMessageLength;

  return { contentBytes, compressedBytes, encodedContentBytes, ndefRecordBytes, tlvBytes, totalTagBytes };
}
