/**
 * Phase 6 — Baseline comparison.
 *
 * Measures the SAME representative triage data (the "Medium Profile" used in
 * Phase 1/2/3 for comparability) encoded as plain, unsigned JSON — no public
 * key, no patient signature, no authority signature — compressed the same
 * way (gzip) as the current production V1 path, so the size/latency delta
 * this script computes isolates the cost of the cryptographic trust layer,
 * not a confound from a different compression choice.
 *
 * "Time-to-render" here means decompress + JSON.parse, the compute-only
 * portion measurable in Node — matching the same proxy-measurement
 * methodology used in Phase 3 (see that file's header comment). It is NOT a
 * real browser paint/render time. The genuinely end-to-end, human-experienced
 * number — physical tap to triage rendered on screen, for the SIGNED path —
 * requires a real device and a real NFC tag and is out of this script's
 * reach; it is bundled into the Phase 5 human handoff (NFC_PROTOCOL.md).
 */
import crypto from 'crypto';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

import { computeStats, timeOperation } from './lib/stats';
import { toShortFormat } from './lib/shortFormat';
import type { FullPayload } from './lib/shortFormat';
import { NTAG_CAPACITY_BYTES } from './lib/constants';
import { computeTagBytes } from './lib/ndefOverhead';

const WARMUP = 20;
const MEASURED = 100;

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

// Plaintext/no-trust baseline: same triage fields, no key, no signatures.
function toPlaintextShortFormat() {
  const bgMap: Record<string, string> = {
    'O-Negative': 'O-', 'O-Positive': 'O+', 'A-Negative': 'A-', 'A-Positive': 'A+',
    'B-Negative': 'B-', 'B-Positive': 'B+', 'AB-Negative': 'AB-', 'AB-Positive': 'AB+',
  };
  return {
    v: '2.0',
    t: Math.floor(Date.now() / 1000),
    id: '90003',
    d: {
      n: TRIAGE_DATA.name,
      b: bgMap[TRIAGE_DATA.bloodGroup] || TRIAGE_DATA.bloodGroup,
      a: TRIAGE_DATA.allergies,
      c: TRIAGE_DATA.emergencyContacts.map((c) => ({ u: c.userId, n: c.name })),
      dnr: TRIAGE_DATA.dnrStatus,
    },
  };
}

function main() {
  // --- Signed path (V1, current production) — for the delta ---
  const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const authorityKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const patientPublicJwk = patientKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const tagId = JSON.stringify({ kty: 'EC', crv: 'P-256', x: patientPublicJwk.x, y: patientPublicJwk.y });
  const signature = crypto
    .sign('sha256', Buffer.from(JSON.stringify(TRIAGE_DATA)), { key: patientKeys.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64');
  const authoritySignature = crypto
    .sign('sha256', Buffer.from(tagId), { key: authorityKeys.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64');

  const signedPayload: FullPayload = {
    version: '2.0', timestamp: new Date().toISOString(), fhirPatientId: '90003',
    triageData: TRIAGE_DATA, tagId, signature, authoritySignature,
  };
  const signedShortJson = JSON.stringify(toShortFormat(signedPayload));
  const signedContentBytes = Buffer.byteLength(signedShortJson, 'utf8');
  const signedCompressed = zlib.gzipSync(Buffer.from(signedShortJson, 'utf8'));
  const signedEncoded = `gzip:${signedCompressed.toString('base64')}`;
  const signedEncodedBytes = Buffer.byteLength(signedEncoded, 'utf8');
  const signedTagBytes = computeTagBytes(signedContentBytes, signedCompressed.length, signedEncodedBytes, 'text');

  const signedTimeToRenderSamples = timeOperation(() => {
    const decompressed = zlib.gunzipSync(signedCompressed);
    JSON.parse(decompressed.toString('utf8'));
  }, WARMUP, MEASURED);

  const signedScanPathSamples = timeOperation(() => {
    const decompressed = zlib.gunzipSync(signedCompressed);
    JSON.parse(decompressed.toString('utf8'));
    crypto.verify('sha256', Buffer.from(JSON.stringify(TRIAGE_DATA)), { key: patientKeys.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64'));
    crypto.verify('sha256', Buffer.from(tagId), { key: authorityKeys.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(authoritySignature, 'base64'));
  }, WARMUP, MEASURED);

  // --- Baseline path (plaintext, no crypto) ---
  const plainShort = toPlaintextShortFormat();
  const plainJson = JSON.stringify(plainShort);
  const plainContentBytes = Buffer.byteLength(plainJson, 'utf8');
  const plainCompressed = zlib.gzipSync(Buffer.from(plainJson, 'utf8'));
  const plainEncoded = `gzip:${plainCompressed.toString('base64')}`;
  const plainEncodedBytes = Buffer.byteLength(plainEncoded, 'utf8');
  const plainTagBytes = computeTagBytes(plainContentBytes, plainCompressed.length, plainEncodedBytes, 'text');

  const plainTimeToRenderSamples = timeOperation(() => {
    const decompressed = zlib.gunzipSync(plainCompressed);
    JSON.parse(decompressed.toString('utf8'));
  }, WARMUP, MEASURED);

  const signedStats = computeStats(signedTimeToRenderSamples);
  const plainStats = computeStats(plainTimeToRenderSamples);
  const scanPathStats = computeStats(signedScanPathSamples);

  const results = {
    meta: {
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      warmupIterations: WARMUP,
      measuredIterations: MEASURED,
      note: 'time-to-render = decompress + JSON.parse only (compute-only proxy, not real browser paint time). See file header for what is and is not measured here.',
    },
    signedPath: {
      totalTagBytes: signedTagBytes.totalTagBytes,
      fitsNtag215: signedTagBytes.totalTagBytes <= NTAG_CAPACITY_BYTES.NTAG215,
      timeToRenderMs: signedStats,
      scanPathTotalMs_decompressPlusTier1PlusTier2: scanPathStats,
    },
    baselinePlaintextPath: {
      totalTagBytes: plainTagBytes.totalTagBytes,
      fitsNtag215: plainTagBytes.totalTagBytes <= NTAG_CAPACITY_BYTES.NTAG215,
      timeToRenderMs: plainStats,
    },
    delta: {
      bytesAddedByTrustLayer: signedTagBytes.totalTagBytes - plainTagBytes.totalTagBytes,
      bytesAddedByTrustLayerPercent: Math.round(((signedTagBytes.totalTagBytes - plainTagBytes.totalTagBytes) / plainTagBytes.totalTagBytes) * 10000) / 100,
      timeToRenderDeltaMeanMs: Math.round((signedStats.meanMs - plainStats.meanMs) * 1000) / 1000,
      scanPathVsPlainTimeToRenderDeltaMeanMs: Math.round((scanPathStats.meanMs - plainStats.meanMs) * 1000) / 1000,
    },
  };

  const outDir = path.resolve(__dirname, '..', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'baseline.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log(`Wrote ${outPath}\n`);
  console.log(`Signed (V1) path:    ${signedTagBytes.totalTagBytes} B on tag, time-to-render mean ${signedStats.meanMs} ms, scan-path-total mean ${scanPathStats.meanMs} ms`);
  console.log(`Baseline (plaintext): ${plainTagBytes.totalTagBytes} B on tag, time-to-render mean ${plainStats.meanMs} ms`);
  console.log(`Delta: +${results.delta.bytesAddedByTrustLayer} B (+${results.delta.bytesAddedByTrustLayerPercent}%) on tag; time-to-render +${results.delta.timeToRenderDeltaMeanMs} ms mean; full scan-path (incl. verification) +${results.delta.scanPathVsPlainTimeToRenderDeltaMeanMs} ms mean vs. plaintext render alone.`);
}

main();
