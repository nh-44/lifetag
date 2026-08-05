import { performance } from 'perf_hooks';
import crypto from 'crypto';
import zlib from 'zlib';
import { CryptoUtils } from './crypto.utils';
import { NfcService, TriagePayload } from '../services/nfc.service';

/**
 * Upgraded LifeTag Cryptographic, Key Generation, & Compression Latency Benchmark
 * Conducts exact performance profiling across 100 runs.
 */

const samplePayload: TriagePayload = {
  version: '2.0',
  timestamp: new Date().toISOString(),
  fhirPatientId: 'FHIR-PATIENT-9923412',
  tagId: JSON.stringify({
    kty: 'EC',
    crv: 'P-256',
    x: 'usVp5gJk88bY1L5T47DsqR_1T8N3rL6u7t3o0F_z_E8',
    y: 'qP2O5mJk88bY1L5T47DsqR_1T8N3rL6u7t3o0F_z_E8',
  }),
  triageData: {
    name: 'John Doe',
    bloodGroup: 'O-Negative',
    allergies: ['Penicillin', 'Peanuts', 'Bee Stings'],
    emergencyContacts: [
      { userId: 'US98234', name: 'Jane Doe' },
      { userId: 'US54321', name: 'Bob Smith' }
    ],
    dnrStatus: true,
  },
  signature: '',
};

function getPercentile(times: number[], percentile: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return Math.round(sorted[index] * 1000) / 1000;
}

export function runBenchmark(iterations: number = 100) {
  console.log(`\n======================================================================`);
  console.log(`Executing LifeTag Empirical Security & Performance Benchmarks (${iterations} runs)`);
  console.log(`======================================================================\n`);

  // Size Comparison Metrics
  const rawString = JSON.stringify(samplePayload);
  const rawBytes = Buffer.byteLength(rawString, 'utf8');
  
  const gzipBuffer = zlib.gzipSync(Buffer.from(rawString, 'utf8'));
  const gzipBytes = gzipBuffer.length;
  
  const deflateBuffer = zlib.deflateSync(Buffer.from(rawString, 'utf8'));
  const deflateBytes = deflateBuffer.length;

  console.log(`--- Payload Size Benchmark Results ---`);
  console.log(`1. Raw JSON Payload size:      ${rawBytes} bytes`);
  console.log(`2. Gzip Compressed size:        ${gzipBytes} bytes (Fits NTAG215: ${gzipBytes <= 504 ? 'YES' : 'NO'})`);
  console.log(`3. Deflate Compressed size:     ${deflateBytes} bytes (Fits NTAG215: ${deflateBytes <= 504 ? 'YES' : 'NO'})`);
  console.log(`Compression Efficiency (Gzip):  ${(Math.round(((rawBytes - gzipBytes) / rawBytes) * 10000) / 100)}%\n`);

  // Latency Metrics Arrays
  const ecdsaKeyGenTimes: number[] = [];
  const ecdsaSignTimes: number[] = [];
  const ecdsaVerifyTimes: number[] = [];
  const compressionTimes: number[] = [];
  const decompressionTimes: number[] = [];
  const kyberEncapTimes: number[] = [];
  const kyberDecapTimes: number[] = [];

  // Generate a baseline keypair for signature tests
  const baseKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const basePublicKeyJwk = baseKeyPair.publicKey.export({ format: 'jwk' });
  
  // Sign baseline triage payload
  const signObj = crypto.createSign('SHA256');
  signObj.update(JSON.stringify(samplePayload.triageData));
  const baseSignature = signObj.sign(baseKeyPair.privateKey).toString('base64');
  
  const executablePayload: TriagePayload = {
    ...samplePayload,
    tagId: JSON.stringify(basePublicKeyJwk),
    signature: baseSignature
  };
  const compressedHex = NfcService.compressTag(executablePayload);

  // Benchmarking loop
  for (let i = 0; i < iterations; i++) {
    // A. ECDSA P-256 Key Generation
    const t0 = performance.now();
    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const t1 = performance.now();
    ecdsaKeyGenTimes.push(t1 - t0);

    // B. ECDSA P-256 Signature Generation
    const t2 = performance.now();
    const signer = crypto.createSign('SHA256');
    signer.update(JSON.stringify(samplePayload.triageData));
    const signature = signer.sign(keyPair.privateKey).toString('base64');
    const t3 = performance.now();
    ecdsaSignTimes.push(t3 - t2);

    // C. ECDSA P-256 Signature Verification
    const publicKeyJwk = keyPair.publicKey.export({ format: 'jwk' });
    const t4 = performance.now();
    CryptoUtils.verifyEcdsaSignature(samplePayload.triageData, signature, publicKeyJwk);
    const t5 = performance.now();
    ecdsaVerifyTimes.push(t5 - t4);

    // D. Gzip Compression
    const t6 = performance.now();
    NfcService.compressTag(executablePayload);
    const t7 = performance.now();
    compressionTimes.push(t7 - t6);

    // E. Gzip Decompression
    const t8 = performance.now();
    NfcService.decompressTag(compressedHex);
    const t9 = performance.now();
    decompressionTimes.push(t9 - t8);

    // F. Kyber-768 Encapsulation
    const kyberKeys = CryptoUtils.generateKyberKeyPair();
    const t10 = performance.now();
    const encap = CryptoUtils.encapsulateSharedSecret(kyberKeys.publicKey);
    const t11 = performance.now();
    kyberEncapTimes.push(t11 - t10);

    // G. Kyber-768 Decapsulation
    const t12 = performance.now();
    CryptoUtils.decapsulateSharedSecret(encap.ciphertext, kyberKeys.privateKey);
    const t13 = performance.now();
    kyberDecapTimes.push(t13 - t12);
  }

  // Console output
  console.log(`--- Latency Performance Metrics (ms) ---`);
  console.table({
    'ECDSA P-256 Key Generation': {
      p50: getPercentile(ecdsaKeyGenTimes, 50),
      p95: getPercentile(ecdsaKeyGenTimes, 95),
      p99: getPercentile(ecdsaKeyGenTimes, 99),
    },
    'ECDSA P-256 Signing': {
      p50: getPercentile(ecdsaSignTimes, 50),
      p95: getPercentile(ecdsaSignTimes, 95),
      p99: getPercentile(ecdsaSignTimes, 99),
    },
    'ECDSA P-256 Verification': {
      p50: getPercentile(ecdsaVerifyTimes, 50),
      p95: getPercentile(ecdsaVerifyTimes, 95),
      p99: getPercentile(ecdsaVerifyTimes, 99),
    },
    'Gzip Payload Compression': {
      p50: getPercentile(compressionTimes, 50),
      p95: getPercentile(compressionTimes, 95),
      p99: getPercentile(compressionTimes, 99),
    },
    'Gzip Payload Decompression': {
      p50: getPercentile(decompressionTimes, 50),
      p95: getPercentile(decompressionTimes, 95),
      p99: getPercentile(decompressionTimes, 99),
    },
    'Kyber-768 Encapsulation (KEM)': {
      p50: getPercentile(kyberEncapTimes, 50),
      p95: getPercentile(kyberEncapTimes, 95),
      p99: getPercentile(kyberEncapTimes, 99),
    },
    'Kyber-768 Decapsulation': {
      p50: getPercentile(kyberDecapTimes, 50),
      p95: getPercentile(kyberDecapTimes, 95),
      p99: getPercentile(kyberDecapTimes, 99),
    }
  });
  console.log(`======================================================================\n`);
}

// Fix decap parameter mapping cleanly
const getPercentileWrapper = (arr: number[], pct: number) => getPercentile(arr, pct);

if (require.main === module) {
  runBenchmark();
}
