/**
 * Phase 3 (Node.js half) — Cryptographic and compression latency.
 *
 * Measures the operations on the CURRENT PRODUCTION encoding path (V1:
 * short-format JSON, JWK public key, base64 signatures, gzip) since this is
 * what actually runs today — Phase 1/2 already cover the encoding-variant
 * comparison. Phase 6 separately measures the no-crypto plaintext baseline.
 *
 * N=100 measured iterations per operation, preceded by 20 discarded warmup
 * iterations (JIT/engine warmup), per the Phase 3 spec. Reports mean,
 * median, standard deviation, min, max, and p95 — see bench/lib/stats.ts.
 *
 * This is the SERVER-SIDE (Node) half only. Phase 3 also requires the same
 * measurement on real Android Chrome via Web Crypto — that requires a
 * physical device and is out of this script's reach; see
 * bench/browser/crypto-latency.html and NFC_PROTOCOL.md for the
 * human-operated counterpart that produces results/crypto-latency-mobile.json.
 * The paper must lead with the mobile numbers once collected — a
 * server-side timing is not evidence of field performance.
 */
import crypto from 'crypto';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { computeStats, timeOperation } from './lib/stats';
import { toShortFormat } from './lib/shortFormat';
import type { FullPayload } from './lib/shortFormat';

const WARMUP = 20;
const MEASURED = 100;

// Representative "Medium Profile" payload, same fixture used across Phase 1/2.
const TRIAGE_DATA = {
  name: 'John Doe',
  bloodGroup: 'O-Negative',
  allergies: ['Penicillin', 'Peanuts', 'Bee Stings'],
  emergencyContacts: [
    { userId: '+919876543210', name: 'Jane Doe' },
    { userId: '+918765432109', name: 'Bob Smith' },
  ],
  dnrStatus: true,
};

function main() {
  // Fixed keypairs reused across sign/verify timing loops so we measure the
  // operation cost itself, not keygen cost (keygen is measured separately).
  const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const authorityKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const patientPublicJwk = patientKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const tagId = JSON.stringify({ kty: 'EC', crv: 'P-256', x: patientPublicJwk.x, y: patientPublicJwk.y });

  const triageDataBuf = Buffer.from(JSON.stringify(TRIAGE_DATA));
  const patientSignature = crypto.sign('sha256', triageDataBuf, { key: patientKeys.privateKey, dsaEncoding: 'ieee-p1363' });
  const authoritySignature = crypto.sign('sha256', Buffer.from(tagId), { key: authorityKeys.privateKey, dsaEncoding: 'ieee-p1363' });

  const fullPayload: FullPayload = {
    version: '2.0',
    timestamp: new Date().toISOString(),
    fhirPatientId: '90002',
    triageData: TRIAGE_DATA,
    tagId,
    signature: patientSignature.toString('base64'),
    authoritySignature: authoritySignature.toString('base64'),
  };
  const shortJson = JSON.stringify(toShortFormat(fullPayload));
  const compressedForDecompTiming = zlib.gzipSync(Buffer.from(shortJson, 'utf8'));

  // 1. ECDSA P-256 key generation
  const keyGenSamples = timeOperation(() => {
    crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  }, WARMUP, MEASURED);

  // 2. Signature creation (patient signing triageData)
  const signSamples = timeOperation(() => {
    crypto.sign('sha256', triageDataBuf, { key: patientKeys.privateKey, dsaEncoding: 'ieee-p1363' });
  }, WARMUP, MEASURED);

  // 3. Tier 1 verification: content signature against on-tag public key
  const tier1Samples = timeOperation(() => {
    crypto.verify('sha256', triageDataBuf, { key: patientKeys.publicKey, dsaEncoding: 'ieee-p1363' }, patientSignature);
  }, WARMUP, MEASURED);

  // 4. Tier 2 verification: authority signature over the patient's public key
  const tier2Samples = timeOperation(() => {
    crypto.verify('sha256', Buffer.from(tagId), { key: authorityKeys.publicKey, dsaEncoding: 'ieee-p1363' }, authoritySignature);
  }, WARMUP, MEASURED);

  // 5. Compression (gzip, current production path)
  const compressSamples = timeOperation(() => {
    zlib.gzipSync(Buffer.from(shortJson, 'utf8'));
  }, WARMUP, MEASURED);

  // 6. Decompression (gunzip)
  const decompressSamples = timeOperation(() => {
    zlib.gunzipSync(compressedForDecompTiming);
  }, WARMUP, MEASURED);

  // 7. Scan-path total = decompress + Tier1 + Tier2, measured as one
  // contiguous block per iteration (not summed from the separate means)
  // so any sequential overhead between steps is captured.
  const scanPathSamples = timeOperation(() => {
    const decompressed = zlib.gunzipSync(compressedForDecompTiming);
    JSON.parse(decompressed.toString('utf8')); // mirrors real parse cost on the scan path
    crypto.verify('sha256', triageDataBuf, { key: patientKeys.publicKey, dsaEncoding: 'ieee-p1363' }, patientSignature);
    crypto.verify('sha256', Buffer.from(tagId), { key: authorityKeys.publicKey, dsaEncoding: 'ieee-p1363' }, authoritySignature);
  }, WARMUP, MEASURED);

  const results = {
    meta: {
      generatedAt: new Date().toISOString(),
      platform: 'node',
      nodeVersion: process.version,
      os: `${os.type()} ${os.release()}`,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      warmupIterations: WARMUP,
      measuredIterations: MEASURED,
      encoding: 'V1 (current production: short-format JSON, JWK public key, base64 signatures, gzip)',
    },
    operations: {
      ecdsaKeyGeneration: computeStats(keyGenSamples),
      signatureCreation: computeStats(signSamples),
      tier1Verification_contentSignature: computeStats(tier1Samples),
      tier2Verification_authoritySignature: computeStats(tier2Samples),
      compression_gzip: computeStats(compressSamples),
      decompression_gunzip: computeStats(decompressSamples),
      scanPathTotal_decompressPlusTier1PlusTier2: computeStats(scanPathSamples),
    },
  };

  const outDir = path.resolve(__dirname, '..', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'crypto-latency-node.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log(`Wrote ${outPath}\n`);
  console.log('--- Node.js crypto/compression latency (ms) ---');
  for (const [op, stats] of Object.entries(results.operations)) {
    console.log(`${op}: mean=${stats.meanMs} median=${stats.medianMs} sd=${stats.stdDevMs} min=${stats.minMs} max=${stats.maxMs} p95=${stats.p95Ms} (n=${stats.n})`);
  }
}

main();
