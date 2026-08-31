/** Deterministic-but-random single-byte/character corruption helpers for Phase 4. */

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ASCII_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function pickDifferent(alphabet: string, current: string): string {
  let next = current;
  while (next === current) next = alphabet[Math.floor(Math.random() * alphabet.length)];
  return next;
}

/** Flips one character of a plain ASCII string to a different ASCII letter at a random position. */
export function corruptAsciiString(s: string): string {
  if (s.length === 0) return 'X';
  const i = Math.floor(Math.random() * s.length);
  const chars = s.split('');
  chars[i] = pickDifferent(ASCII_LETTERS, chars[i]);
  return chars.join('');
}

/** Flips one character of a base64url string to a different valid base64url character. */
export function corruptBase64Url(s: string): string {
  const i = Math.floor(Math.random() * s.length);
  const chars = s.split('');
  chars[i] = pickDifferent(BASE64URL_ALPHABET, chars[i]);
  return chars.join('');
}

/** Flips one character of a base64 string to a different valid base64 character. */
export function corruptBase64(s: string): string {
  const i = Math.floor(Math.random() * s.length);
  const chars = s.split('');
  chars[i] = pickDifferent(BASE64_ALPHABET, chars[i]);
  return chars.join('');
}

/** Flips one random bit in a raw byte buffer, returning a new corrupted copy. */
export function corruptBufferBit(buf: Buffer): Buffer {
  const copy = Buffer.from(buf);
  const byteIndex = Math.floor(Math.random() * copy.length);
  const bitIndex = Math.floor(Math.random() * 8);
  copy[byteIndex] ^= (1 << bitIndex);
  return copy;
}
