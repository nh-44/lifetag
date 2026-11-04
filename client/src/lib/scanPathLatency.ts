/**
 * On-device compute benchmark for the scan path, run from the NFC Lab.
 *
 * Measures the production code paths (NfcCryptoService + tagCodec) on the Medium
 * profile for both tag formats. The seven legacy keys feed bench/generate-tables.ts
 * unchanged. New keys separate:
 *   - verification only (Tier 1 + Tier 2): what "sub-millisecond" can honestly refer to;
 *   - the full scan path per format (decode + Tier 1 + Tier 2): V1 includes gunzip, V3 does not.
 * It also records the timer resolution: Chrome coarsens performance.now() to 100 µs
 * on pages that are not cross-origin isolated, which bounds what these means can resolve.
 */
import { NfcCryptoService, TAG_FORMAT_VERSION } from "@/services/nfcCryptoService";
import { encodeTag, decodeTagMessage } from "@/lib/tagCodec";
import { buildLabPayload } from "@/lib/nfcLabRunner";

export interface LatencyStats { n: number; meanMs: number; medianMs: number; stdDevMs: number; minMs: number; maxMs: number; p95Ms: number }

export function computeStats(samples: number[]): LatencyStats {
  const n = samples.length;
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { n, meanMs: r(mean), medianMs: r(median), stdDevMs: r(Math.sqrt(variance)), minMs: r(sorted[0]), maxMs: r(sorted[n - 1]), p95Ms: r(p95) };
}

/** Smallest non-zero step performance.now() advances by on this page. */
export function measureTimerResolutionMs(): number {
  let best = Infinity;
  for (let i = 0; i < 50; i++) {
    const a = performance.now();
    let b = performance.now();
    while (b === a) b = performance.now();
    best = Math.min(best, b - a);
  }
  return Math.round(best * 1e6) / 1e6;
}

const textRecord = (s: string) => ({ recordType: "text", encoding: "utf-8", data: new DataView(new TextEncoder().encode(s).buffer) });

export async function runScanPathLatency(device: { model: string; androidVersion: string; chromeVersion: string }, warmup = 20, measured = 100) {
  const time = async (fn: () => Promise<unknown>) => {
    const samples: number[] = [];
    for (let i = 0; i < warmup + measured; i++) {
      const t0 = performance.now();
      await fn();
      const t1 = performance.now();
      if (i >= warmup) samples.push(t1 - t0);
    }
    return computeStats(samples);
  };

  const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
  const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
  const payload = await buildLabPayload("medium");
  const v3 = await encodeTag(payload, "v3-binary");
  const v1 = await encodeTag(payload, "v1-text");
  const v3Message = { records: [{ recordType: "unknown", data: new DataView(v3.content.slice().buffer) }] };
  const v1Message = { records: [textRecord(new TextDecoder().decode(v1.content))] };
  const gz = await NfcCryptoService.compressPayload(payload);

  // Isolated Tier 1 / Tier 2 on the real v3 signing strings
  const keyPair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const authority = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const contentBytes = new TextEncoder().encode(NfcCryptoService.contentSigningString(payload));
  const { x, y } = JSON.parse(payload.tagId!);
  const certBytes = new TextEncoder().encode(NfcCryptoService.certSigningString(payload.fhirPatientId, NfcCryptoService.issuedAtSeconds(payload.timestamp), x, y));
  const contentSig = await crypto.subtle.sign(SIGN, keyPair.privateKey, contentBytes);
  const certSig = await crypto.subtle.sign(SIGN, authority.privateKey, certBytes);

  const tier1 = () => crypto.subtle.verify(SIGN, keyPair.publicKey, contentSig, contentBytes);
  const tier2 = () => crypto.subtle.verify(SIGN, authority.publicKey, certSig, certBytes);

  const operations = {
    ecdsaKeyGeneration: await time(() => crypto.subtle.generateKey(P256, false, ["sign", "verify"])),
    signatureCreation: await time(() => crypto.subtle.sign(SIGN, keyPair.privateKey, contentBytes)),
    tier1Verification_contentSignature: await time(tier1),
    tier2Verification_authoritySignature: await time(tier2),
    compression_gzip: await time(() => NfcCryptoService.compressPayload(payload)),
    decompression_gunzip: await time(() => NfcCryptoService.decompressPayload(gz)),
    scanPathTotal_decompressPlusTier1PlusTier2: await time(async () => { await NfcCryptoService.decompressPayload(gz); await tier1(); await tier2(); }),
    // New in lab v2
    verificationOnly_tier1PlusTier2: await time(async () => { await tier1(); await tier2(); }),
    v3Decode_binaryPlusPointDecompression: await time(() => decodeTagMessage(v3Message)),
    v1Decode_base64PlusGunzipPlusParse: await time(() => decodeTagMessage(v1Message)),
    scanPathTotal_v3_decodePlusTier1PlusTier2: await time(async () => { await decodeTagMessage(v3Message); await tier1(); await tier2(); }),
    scanPathTotal_v1_decodePlusTier1PlusTier2: await time(async () => { await decodeTagMessage(v1Message); await tier1(); await tier2(); }),
  };

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      platform: "mobile-web-crypto",
      deviceModel: device.model,
      androidVersion: device.androidVersion,
      chromeVersion: device.chromeVersion,
      warmupIterations: warmup,
      measuredIterations: measured,
      tagFormatVersion: TAG_FORMAT_VERSION,
      profile: "medium",
      onTagBytes: { v3: v3.tagBytes, v1: v1.tagBytes },
      timerResolutionMs: measureTimerResolutionMs(),
      crossOriginIsolated: typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : false,
      encoding: "both: V1 (gzip text) and V3 (compact binary); legacy keys measure V1",
    },
    operations,
  };
}
