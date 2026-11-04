/**
 * P-256 SEC1 point compression for the browser (mirror of bench/lib/ecPoint.ts).
 *
 * Web Crypto can export/import JWK (x, y) but cannot import a compressed
 * point, so the V3 tag format stores 33 bytes (0x02/0x03 parity + x) and this
 * module recovers y from the curve equation y^2 = x^3 - 3x + b (mod p).
 */

const P = BigInt("0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF");
const A = P - 3n;
const B = BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b");

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

export function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const toBigInt = (bytes: Uint8Array) => BigInt("0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
const toBytes32 = (n: bigint) => Uint8Array.from(n.toString(16).padStart(64, "0").match(/../g)!.map((h) => parseInt(h, 16)));

/** JWK base64url (x, y) -> 33-byte SEC1 compressed point. */
export function compressPoint(x: string, y: string): Uint8Array {
  const xb = base64UrlToBytes(x);
  const yb = base64UrlToBytes(y);
  if (xb.length !== 32 || yb.length !== 32) throw new Error("P-256 coordinates must be 32 bytes");
  const out = new Uint8Array(33);
  out[0] = (yb[31] & 1) === 0 ? 0x02 : 0x03;
  out.set(xb, 1);
  return out;
}

/** 33-byte SEC1 compressed point -> JWK base64url (x, y). Throws if x is not on the curve. */
export function decompressPoint(compressed: Uint8Array): { x: string; y: string } {
  if (compressed.length !== 33 || (compressed[0] !== 0x02 && compressed[0] !== 0x03)) {
    throw new Error("Expected a 33-byte SEC1 compressed point");
  }
  const xb = compressed.subarray(1);
  const x = toBigInt(xb);
  if (x >= P) throw new Error("Point x-coordinate out of range");
  const rhs = (((modPow(x, 3n, P) + A * x + B) % P) + P) % P;
  let y = modPow(rhs, (P + 1n) / 4n, P); // p ≡ 3 (mod 4)
  if ((y * y) % P !== rhs) throw new Error("Not a point on P-256");
  if ((y % 2n === 0n) !== (compressed[0] === 0x02)) y = P - y;
  return { x: bytesToBase64Url(new Uint8Array(xb)), y: bytesToBase64Url(toBytes32(y)) };
}
