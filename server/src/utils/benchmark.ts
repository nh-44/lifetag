import { performance } from 'perf_hooks';
import { CryptoUtils } from './crypto.utils';
import { NfcService, TriagePayload } from '../services/nfc.service';

/**
 * LifeTag System Cryptographic & Compression Benchmark Runner
 * Runs simulation cycles to gather empirical metrics for academic publication.
 */

// Sample patient profile payload matching schema DTO
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
      { name: 'Jane Doe', phone: '+1-555-0199', relation: 'Spouse' },
      { name: 'Dr. Sarah Jenkins', phone: '+1-555-0210', relation: 'Physician' }
    ],
    dnrStatus: true,
    organDonor: true,
  },
  signature: 'MEQCIDV4nJz8tY1L5T47DsqR_1T8N3rL6u7t3o0F_z_E8AiA7tP2O5mJk88bY1L5T47DsqR_1T8N3rL6u7t3o0F_z_E8',
};

// Quick mock helper to compute deterministic verification times
function getPercentile(times: number[], percentile: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return Math.round(sorted[index] * 1000) / 1000;
}

export function runBenchmark(iterations: number = 100) {
  console.log(`\n======================================================`);
  console.log(`Starting LifeTag Cryptographic & NFC Benchmarks (${iterations} runs)`);
  console.log(`======================================================\n`);

  const compressionTimes: number[] = [];
  const decompressionTimes: number[] = [];
  const signatureTimes: number[] = [];
  const encapsulationTimes: number[] = [];
  const decapsulationTimes: number[] = [];

  // 1. Compression and Size tests
  const budget = NfcService.getByteBudget(samplePayload);
  console.log(`--- Payload Size Metrics ---`);
  console.log(`Raw JSON Payload Size:        ${budget.rawBytes} bytes`);
  console.log(`Compressed (Gzip) Size:       ${budget.compressedBytes} bytes`);
  console.log(`Fits standard NTAG215 limit?  ${budget.fitsNtag215 ? 'YES (<= 504 bytes)' : 'NO'}`);
  console.log(`Compression Efficiency Gain:  ${budget.efficiencyGainPercent}%\n`);

  const compressedHex = NfcService.compressTag(samplePayload);

  // Benchmarking loop
  for (let i = 0; i < iterations; i++) {
    // A. Compression Latency
    const t0 = performance.now();
    NfcService.compressTag(samplePayload);
    const t1 = performance.now();
    compressionTimes.push(t1 - t0);

    // B. Decompression Latency
    const t2 = performance.now();
    NfcService.decompressTag(compressedHex);
    const t3 = performance.now();
    decompressionTimes.push(t3 - t2);

    // C. Simulated Kyber Keypair & Encapsulation
    const keys = CryptoUtils.generateKyberKeyPair();
    const t4 = performance.now();
    const encap = CryptoUtils.encapsulateSharedSecret(keys.publicKey);
    const t5 = performance.now();
    encapsulationTimes.push(t5 - t4);

    // D. Decapsulation Handshake
    const t6 = performance.now();
    CryptoUtils.decapsulateSharedSecret(encap.ciphertext, keys.privateKey);
    const t7 = performance.now();
    decapsulationTimes.push(t7 - t6);
  }

  // Latency Output Table
  console.log(`--- Latency Performance Metrics (ms) ---`);
  console.table({
    'Payload Compression': {
      p50: getPercentile(compressionTimes, 50),
      p95: getPercentile(compressionTimes, 95),
      p99: getPercentile(compressionTimes, 99),
    },
    'Payload Decompression': {
      p50: getPercentile(decompressionTimes, 50),
      p95: getPercentile(decompressionTimes, 95),
      p99: getPercentile(decompressionTimes, 99),
    },
    'Kyber-768 Encapsulation (KEM)': {
      p50: getPercentile(encapsulationTimes, 50),
      p95: getPercentile(encapsulationTimes, 95),
      p99: getPercentile(encapsulationTimes, 99),
    },
    'Kyber-768 Decapsulation': {
      p50: getPercentile(decapsulationTimes, 50),
      p95: getPercentile(decapsulationTimes, 95),
      p99: getPercentile(decapsulationTimes, 99),
    }
  });
  console.log(`======================================================\n`);
}

// Automatically execute if run directly
if (require.main === module) {
  runBenchmark();
}
