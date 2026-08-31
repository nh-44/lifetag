import { performance } from 'perf_hooks';
import crypto from 'crypto';
import zlib from 'zlib';
import { CryptoUtils } from './crypto.utils';
import { NfcService, TriagePayload } from '../services/nfc.service';

/**
 * Minifies the payload to perfectly mirror the production WebNFC client output.
 */
function toShortFormat(payload: TriagePayload): Record<string, unknown> {
  let kStr = payload.tagId;
  try {
    const jwk = JSON.parse(payload.tagId);
    if (jwk.x && jwk.y) {
      kStr = `${jwk.x}.${jwk.y}`;
    }
  } catch (e) {
    // Ignore invalid JSON JWK
  }

  const tNum = Math.floor(new Date(payload.timestamp).getTime() / 1000);

  const bgMap: Record<string, string> = {
    "O-Negative": "O-", "O-Positive": "O+",
    "A-Negative": "A-", "A-Positive": "A+",
    "B-Negative": "B-", "B-Positive": "B+",
    "AB-Negative": "AB-", "AB-Positive": "AB+"
  };
  const shortBg = bgMap[payload.triageData.bloodGroup] || payload.triageData.bloodGroup;

  const cleanAllergies = payload.triageData.allergies.filter(
    (a: string) => a.toLowerCase() !== "none" && a.toLowerCase() !== "no allergies"
  );

  return {
    v: payload.version,
    t: tNum,
    id: payload.fhirPatientId,
    iu: undefined,
    d: {
      n: payload.triageData.name,
      b: shortBg,
      a: cleanAllergies,
      c: payload.triageData.emergencyContacts.map((c: { userId: string; name: string }) => ({
        u: c.userId,
        n: c.name
      })),
      dnr: payload.triageData.dnrStatus
    },
    k: kStr,
    s: payload.signature,
    as: payload.authoritySignature
  };
}

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
  const smallProfile: TriagePayload = {
    ...samplePayload,
    triageData: {
      name: 'Jane Doe',
      bloodGroup: 'A+',
      allergies: [],
      emergencyContacts: [{ userId: 'US1', name: 'Bob' }],
      dnrStatus: false,
    }
  };

  const largeProfile: TriagePayload = {
    ...samplePayload,
    triageData: {
      name: 'Jonathan Bartholomew Doe III',
      bloodGroup: 'AB-Negative',
      allergies: ['Penicillin', 'Peanuts', 'Bee Stings', 'Latex', 'Aspirin', 'Sulfa Drugs', 'Ibuprofen', 'Shellfish', 'Dairy', 'Gluten'],
      emergencyContacts: [
        { userId: 'US98234', name: 'Jane Doe' },
        { userId: 'US54321', name: 'Bob Smith' },
        { userId: 'US11111', name: 'Alice Jones' },
        { userId: 'US22222', name: 'Charlie Brown' },
        { userId: 'US33333', name: 'Eve White' }
      ],
      dnrStatus: true,
    }
  };

  const profiles = [
    { name: 'Small Profile', data: smallProfile },
    { name: 'Medium Profile', data: samplePayload },
    { name: 'Large Profile', data: largeProfile }
  ];

  console.log(`--- Payload Size Benchmark Results ---`);
  console.log(`Note: Emulating production NfcWriter.tsx behavior (toShortFormat -> Gzip -> Base64 -> "gzip:" prefix)`);
  console.log(`      Fits NTAG215 (504 bytes) is evaluated against this final application footprint.`);
  console.log(`      (This excludes the ~7 byte standard NDEF Text Record wrapper overhead).`);
  
  for (const p of profiles) {
    // Generate a valid JWK for the size simulation
    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pubJwk = keyPair.publicKey.export({ format: 'jwk' });
    
    // WebCrypto IEEE P1363 signatures are exactly 64 bytes (88 base64 chars). Node defaults to DER (~71 bytes).
    // To mirror production sizing exactly, we use a 64-byte dummy signature for the byte budget calculation.
    const dummyP1363Signature = crypto.randomBytes(64).toString('base64');
    
    const executableProfile = {
      ...p.data,
      tagId: JSON.stringify(pubJwk),
      signature: dummyP1363Signature
    };

    // Apply the production client-side minification
    const shortPayload = toShortFormat(executableProfile);

    const rawString = JSON.stringify(shortPayload);
    const rawBytes = Buffer.byteLength(rawString, 'utf8');
    
    const gzipBuffer = zlib.gzipSync(Buffer.from(rawString, 'utf8'));
    const gzipBytes = gzipBuffer.length;
    
    const base64String = gzipBuffer.toString('base64');
    const base64Bytes = Buffer.byteLength(base64String, 'utf8');
    
    const finalPayloadString = `gzip:${base64String}`;
    const finalPayloadBytes = Buffer.byteLength(finalPayloadString, 'utf8');
    
    const fits = finalPayloadBytes <= 504;
    
    console.log(`\n${p.name}:`);
    console.log(`  Raw Minified JSON bytes: ${rawBytes}`);
    console.log(`  Raw Gzip binary bytes:   ${gzipBytes}`);
    console.log(`  Base64 payload bytes:    ${base64Bytes}`);
    console.log(`  Final payload ("gzip:"): ${finalPayloadBytes}`);
    console.log(`  Fits NTAG215:            ${fits ? 'YES' : 'NO'}`);
  }
  console.log();

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
  
  // Sign baseline triage payload using the real client wire format (raw IEEE P1363,
  // not Node's default DER) so this benchmark exercises the same signatures
  // CryptoUtils.verifyEcdsaSignature actually verifies in production.
  const baseSignature = crypto
    .sign('sha256', Buffer.from(JSON.stringify(samplePayload.triageData)), {
      key: baseKeyPair.privateKey,
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64');
  
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

    // B. ECDSA P-256 Signature Generation (raw IEEE P1363, matching Web Crypto / production)
    const t2 = performance.now();
    const signature = crypto
      .sign('sha256', Buffer.from(JSON.stringify(samplePayload.triageData)), {
        key: keyPair.privateKey,
        dsaEncoding: 'ieee-p1363',
      })
      .toString('base64');
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

  // --- Security: Tamper Detection Rate ---
  let tamperDetectedCount = 0;
  let tamperMissedCount = 0;

  for (let i = 0; i < iterations; i++) {
    // Generate valid signed payload
    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pubJwk = keyPair.publicKey.export({ format: 'jwk' });
    const validSignature = crypto
      .sign('sha256', Buffer.from(JSON.stringify(samplePayload.triageData)), {
        key: keyPair.privateKey,
        dsaEncoding: 'ieee-p1363',
      })
      .toString('base64');
    
    // Mutate it maliciously
    const maliciouslyAlteredTriageData = {
      ...samplePayload.triageData,
      bloodGroup: 'B-Positive' // Altered field
    };
    
    const maliciousPayload: TriagePayload = {
      ...samplePayload,
      tagId: JSON.stringify(pubJwk),
      signature: validSignature,
      triageData: maliciouslyAlteredTriageData,
    };
    
    // Use existing application verification logic
    const integrity = NfcService.verifyTagIntegrity(maliciousPayload);
    
    if (!integrity.verified) {
      tamperDetectedCount++;
    } else {
      tamperMissedCount++;
    }
  }
  const detectionRate = (tamperDetectedCount / iterations) * 100;

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
  
  console.log(`\n--- Security Verification Metrics ---`);
  console.log(`Tamper Detection Run (${iterations} maliciously mutated payloads):`);
  console.log(`Detected: ${tamperDetectedCount}`);
  console.log(`Missed:   ${tamperMissedCount}`);
  console.log(`Tamper Detection Rate: ${detectionRate.toFixed(2)}%`);
  console.log(`======================================================================\n`);
}

if (require.main === module) {
  runBenchmark();
}
