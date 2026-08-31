/**
 * P-256 (secp256r1) EC point compression / decompression.
 *
 * The JWK format used throughout the production code (nfcCryptoService.ts,
 * crypto.utils.ts) stores public keys as uncompressed (x, y) coordinates,
 * base64url-encoded — 32 bytes each, 64 bytes of raw point data. The
 * standard SEC1 *compressed* point format stores only x plus a 1-byte
 * parity prefix (0x02 = even y, 0x03 = odd y) — 33 bytes total — because y
 * can always be recovered from x and the curve equation.
 *
 * This module implements that recovery so the compact "V3/V4" encodings in
 * bench/encoding-variants.ts can be decoded back into a real, usable
 * crypto.KeyObject and verified against a real signature — not just
 * asserted to be smaller.
 */
import crypto from 'crypto';

// NIST P-256 curve parameters (FIPS 186-4)
const P = BigInt(
  '0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF'
);
const A = P - 3n; // P-256 uses a = -3
const B = BigInt(
  '0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b'
);

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/** Compresses a raw (x, y) point (32 bytes each) into a 33-byte SEC1 compressed point. */
export function compressPoint(x: Buffer, y: Buffer): Buffer {
  if (x.length !== 32 || y.length !== 32) {
    throw new Error(`compressPoint expects 32-byte coordinates, got x=${x.length} y=${y.length}`);
  }
  const yBig = BigInt('0x' + y.toString('hex'));
  const prefix = yBig % 2n === 0n ? 0x02 : 0x03;
  return Buffer.concat([Buffer.from([prefix]), x]);
}

/**
 * Decompresses a 33-byte SEC1 compressed point back into raw (x, y), 32 bytes each.
 * P-256's prime p ≡ 3 (mod 4), so the modular square root of a quadratic
 * residue r is r^((p+1)/4) mod p — this is the standard Tonelli-Shanks
 * shortcut for that case.
 */
export function decompressPoint(compressed: Buffer): { x: Buffer; y: Buffer } {
  if (compressed.length !== 33 || (compressed[0] !== 0x02 && compressed[0] !== 0x03)) {
    throw new Error('decompressPoint expects a 33-byte SEC1 compressed point (0x02/0x03 prefix)');
  }
  const prefix = compressed[0];
  const xBuf = compressed.subarray(1, 33);
  const x = BigInt('0x' + xBuf.toString('hex'));

  const rhs = ((modPow(x, 3n, P) + A * x + B) % P + P) % P; // x^3 + a*x + b mod p
  let y = modPow(rhs, (P + 1n) / 4n, P);

  const gotEven = y % 2n === 0n;
  const wantEven = prefix === 0x02;
  if (gotEven !== wantEven) y = P - y;

  return { x: xBuf, y: Buffer.from(y.toString(16).padStart(64, '0'), 'hex') };
}

/** Convenience: compress directly from a JWK's base64url x/y fields. */
export function compressPointFromJwk(jwk: { x: string; y: string }): Buffer {
  return compressPoint(Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url'));
}

/** Convenience: rebuild a usable public KeyObject from a 33-byte compressed point. */
export function publicKeyFromCompressedPoint(compressed: Buffer): crypto.KeyObject {
  const { x, y } = decompressPoint(compressed);
  return crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: x.toString('base64url'), y: y.toString('base64url') },
    format: 'jwk',
  });
}
