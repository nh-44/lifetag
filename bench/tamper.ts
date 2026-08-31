/**
 * Phase 4 — Tamper detection suite.
 *
 * Exercises the REAL production verification code (server/src/services/nfc.service.ts
 * NfcService.verifyTagIntegrity, which calls server/src/utils/crypto.utils.ts
 * CryptoUtils.verifyEcdsaSignature — the exact functions fixed for the P1363
 * encoding bug documented in RESULTS_LOG.md), not a reimplementation.
 *
 * Primary metric: `trustedAuthority`. This is the meaningful "is this tag
 * safe to treat as certified" signal per the system's own two-tier design —
 * `verified: true` alone only means "this content was signed by SOME key",
 * which is also true for a legitimate patient's own self-signed tag before
 * authority certification (see nfc.service.spec.ts's "verifies a valid
 * self-signed tag" test). A forged/tampered tag achieving `verified: true`
 * without `trustedAuthority: true` is expected and correct — the attacker
 * cannot forge the authority's certification. A forged/tampered tag
 * achieving `trustedAuthority: true` would be a real break. So "rejected"
 * for every class in this suite means `trustedAuthority !== true`, and the
 * `verified` breakdown is reported per class alongside it for full
 * diagnostic transparency — never rounded away, per the Phase 4 spec.
 *
 * N=200 per class x 8 classes (7 attacks + 1 control) = 1600 total trials.
 */
import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { NfcService, TriagePayload } from '../server/src/services/nfc.service';
import { corruptAsciiString, corruptBase64Url, corruptBufferBit } from './lib/corrupt';

const N_PER_CLASS = 200;
const AUTHORITY_KEYS = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });

// NfcService.verifyTagIntegrity checks authoritySignature against its own
// hardcoded AUTHORITY_PUBLIC_KEY_JWK static field, not an injectable
// parameter. Override it to match the throwaway AUTHORITY_KEYS generated
// above, exactly like server/src/tests/unit/nfc.service.spec.ts does —
// otherwise every authoritySignature this script produces (signed with
// AUTHORITY_KEYS.privateKey) would fail Tier 2 against the real production
// key it doesn't have the private half of.
(NfcService as any).AUTHORITY_PUBLIC_KEY_JWK = AUTHORITY_KEYS.publicKey.export({ format: 'jwk' });

function buildValidPayload(fhirPatientId: string, namePrefix: string): TriagePayload {
  const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const patientPublicJwk = patientKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const tagId = JSON.stringify({ kty: 'EC', crv: 'P-256', x: patientPublicJwk.x, y: patientPublicJwk.y });

  const triageData = {
    name: `${namePrefix} Patient`,
    bloodGroup: 'O-Negative',
    allergies: ['Penicillin'],
    emergencyContacts: [{ userId: '+919876543210', name: 'Emergency Contact' }],
    dnrStatus: false,
  };

  const signature = crypto
    .sign('sha256', Buffer.from(JSON.stringify(triageData)), { key: patientKeys.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64');
  const authoritySignature = crypto
    .sign('sha256', Buffer.from(tagId), { key: AUTHORITY_KEYS.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64');

  return {
    version: '2.0',
    timestamp: new Date().toISOString(),
    fhirPatientId,
    triageData,
    tagId,
    signature,
    authoritySignature,
  };
}

interface TrialOutcome {
  verified: boolean;
  trustedAuthority: boolean;
  decompressionOrParseFailed?: boolean;
}

function runTrial(payload: TriagePayload): TrialOutcome {
  const result = NfcService.verifyTagIntegrity(payload);
  return { verified: result.verified, trustedAuthority: result.trustedAuthority };
}

// --- Attack class implementations -------------------------------------------------

function classContentCorruption(): TrialOutcome {
  const payload = buildValidPayload('90101', 'Content');
  payload.triageData.name = corruptAsciiString(payload.triageData.name);
  return runTrial(payload);
}

function classPublicKeyCorruption(): TrialOutcome {
  const payload = buildValidPayload('90102', 'Key');
  const jwk = JSON.parse(payload.tagId);
  jwk.x = corruptBase64Url(jwk.x);
  payload.tagId = JSON.stringify(jwk);
  return runTrial(payload);
}

function classPatientSignatureCorruption(): TrialOutcome {
  const payload = buildValidPayload('90103', 'PatientSig');
  // Corrupt at the raw byte level, not the base64 character level: a base64
  // signature's final character encodes some unused/padding bits that don't
  // map to any real byte, so a single character-level substitution can
  // occasionally leave the decoded bytes unchanged (this was measured
  // directly — see RESULTS_LOG.md's Phase 4 entry for the ~2% anomaly rate
  // it produced before this fix).
  const raw = Buffer.from(payload.signature, 'base64');
  payload.signature = corruptBufferBit(raw).toString('base64');
  return runTrial(payload);
}

function classAuthoritySignatureCorruption(): TrialOutcome {
  const payload = buildValidPayload('90104', 'AuthSig');
  const raw = Buffer.from(payload.authoritySignature!, 'base64');
  payload.authoritySignature = corruptBufferBit(raw).toString('base64');
  return runTrial(payload);
}

function classTruncation(): TrialOutcome {
  const payload = buildValidPayload('90105', 'Truncate');
  const compressedHex = NfcService.compressTag(payload);
  const compressedBuf = Buffer.from(compressedHex, 'hex');
  // Truncate at a random offset strictly before the end (guarantees data loss).
  const cutAt = 1 + Math.floor(Math.random() * (compressedBuf.length - 1));
  const truncated = compressedBuf.subarray(0, cutAt);

  try {
    const decompressed = NfcService.decompressTag(truncated.toString('hex'));
    // If decompression somehow "succeeds" on truncated data, the result must
    // still fail real verification — check it explicitly rather than assuming.
    return runTrial(decompressed);
  } catch {
    // Decompression/JSON-parse failure on a truncated tag is a correct
    // rejection — the system refuses to process an unreadable payload.
    return { verified: false, trustedAuthority: false, decompressionOrParseFailed: true };
  }
}

function classCrossPatientGraft(): TrialOutcome {
  const patientA = buildValidPayload('90106', 'PatientA');
  const patientB = buildValidPayload('90107', 'PatientB');
  const grafted: TriagePayload = {
    ...patientA, // A's tagId + signature + authoritySignature
    triageData: patientB.triageData, // B's content
    fhirPatientId: patientB.fhirPatientId,
  };
  return runTrial(grafted);
}

function classForgedKey(): TrialOutcome {
  // Adversary generates their own valid P-256 pair and signs fabricated
  // content with it — a structurally valid self-signature over content they
  // invented. They do not have AUTHORITY_PRIVATE_KEY, so they attempt a
  // garbage authoritySignature (a naive forgery attempt) rather than a real one.
  const attackerKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const attackerPublicJwk = attackerKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const tagId = JSON.stringify({ kty: 'EC', crv: 'P-256', x: attackerPublicJwk.x, y: attackerPublicJwk.y });

  const forgedTriageData = {
    name: 'Forged Identity',
    bloodGroup: 'AB-Positive',
    allergies: [],
    emergencyContacts: [],
    dnrStatus: false,
  };
  const signature = crypto
    .sign('sha256', Buffer.from(JSON.stringify(forgedTriageData)), { key: attackerKeys.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64');

  const garbageAuthoritySignature = crypto.randomBytes(64).toString('base64'); // naive forgery attempt, not derived from the real authority key

  const payload: TriagePayload = {
    version: '2.0',
    timestamp: new Date().toISOString(),
    fhirPatientId: '90108',
    triageData: forgedTriageData,
    tagId,
    signature,
    authoritySignature: garbageAuthoritySignature,
  };
  return runTrial(payload);
}

function classControl(): TrialOutcome {
  const payload = buildValidPayload('90109', 'Control');
  return runTrial(payload);
}

// --- Run ----------------------------------------------------------------------

interface ClassResult {
  className: string;
  expectedOutcome: 'reject' | 'accept';
  n: number;
  trustedAuthorityTrueCount: number;
  verifiedTrueCount: number;
  decompressionFailedCount: number;
  rejectionRate: number; // fraction with trustedAuthority !== true (for attack classes) / acceptance rate (for control)
  anomalies: TrialOutcome[]; // trials where the outcome did NOT match expectedOutcome — never rounded away
}

function runClass(className: string, expectedOutcome: 'reject' | 'accept', trialFn: () => TrialOutcome): ClassResult {
  const outcomes: TrialOutcome[] = [];
  for (let i = 0; i < N_PER_CLASS; i++) outcomes.push(trialFn());

  const trustedAuthorityTrueCount = outcomes.filter((o) => o.trustedAuthority).length;
  const verifiedTrueCount = outcomes.filter((o) => o.verified).length;
  const decompressionFailedCount = outcomes.filter((o) => o.decompressionOrParseFailed).length;

  const anomalies = outcomes.filter((o) =>
    expectedOutcome === 'reject' ? o.trustedAuthority === true : o.trustedAuthority !== true
  );

  const rejectionRate = expectedOutcome === 'reject'
    ? (N_PER_CLASS - trustedAuthorityTrueCount) / N_PER_CLASS
    : trustedAuthorityTrueCount / N_PER_CLASS;

  return {
    className, expectedOutcome, n: N_PER_CLASS,
    trustedAuthorityTrueCount, verifiedTrueCount, decompressionFailedCount,
    rejectionRate, anomalies,
  };
}

function main() {
  const classes: ClassResult[] = [
    runClass('Single-byte corruption: clinical content', 'reject', classContentCorruption),
    runClass('Single-byte corruption: public key field', 'reject', classPublicKeyCorruption),
    runClass('Single-byte corruption: patient signature', 'reject', classPatientSignatureCorruption),
    runClass('Single-byte corruption: authority signature', 'reject', classAuthoritySignatureCorruption),
    runClass('Payload truncation at random offset', 'reject', classTruncation),
    runClass("Cross-patient graft (A's key+sig on B's content)", 'reject', classCrossPatientGraft),
    runClass('Forged-key (attacker-generated keypair + garbage authority sig)', 'reject', classForgedKey),
    runClass('Valid unmodified payload (control)', 'accept', classControl),
  ];

  const totalN = classes.reduce((a, c) => a + c.n, 0);
  assert.ok(totalN >= 1000, `Total N must be >= 1000, got ${totalN}`);

  const controlFalseRejects = classes.find((c) => c.expectedOutcome === 'accept')!.anomalies.length;

  const results = {
    meta: {
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      nPerClass: N_PER_CLASS,
      totalN,
      metric: "reject == trustedAuthority !== true (see file header comment for why this, not raw `verified`, is the meaningful security metric)",
      verifiedAgainst: 'server/src/services/nfc.service.ts NfcService.verifyTagIntegrity (real production code, post P1363 fix)',
    },
    classes: classes.map((c) => ({
      className: c.className,
      expectedOutcome: c.expectedOutcome,
      n: c.n,
      trustedAuthorityTrueCount: c.trustedAuthorityTrueCount,
      verifiedTrueCount: c.verifiedTrueCount,
      decompressionFailedCount: c.decompressionFailedCount,
      rejectionOrAcceptanceRate: c.rejectionRate,
      anomalyCount: c.anomalies.length,
      anomalies: c.anomalies,
    })),
    summary: {
      controlFalseRejects,
      controlFalseRejectRate: controlFalseRejects / N_PER_CLASS,
      allAttackClassesFullyRejected: classes.filter((c) => c.expectedOutcome === 'reject').every((c) => c.anomalies.length === 0),
    },
  };

  const outDir = path.resolve(__dirname, '..', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'tamper.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log(`Wrote ${outPath}\n`);
  console.log(`Total trials: ${totalN}\n`);
  for (const c of classes) {
    console.log(
      `${c.className} [expected: ${c.expectedOutcome}] — trustedAuthority=true: ${c.trustedAuthorityTrueCount}/${c.n}, ` +
      `verified=true: ${c.verifiedTrueCount}/${c.n}, decompFailed: ${c.decompressionFailedCount}/${c.n}, ` +
      `${c.expectedOutcome === 'reject' ? 'rejectionRate' : 'acceptanceRate'}=${(c.rejectionRate * 100).toFixed(2)}%, anomalies=${c.anomalies.length}`
    );
  }
  console.log(`\nControl false-reject rate: ${controlFalseRejects}/${N_PER_CLASS} (${((controlFalseRejects / N_PER_CLASS) * 100).toFixed(2)}%)`);
  console.log(`All attack classes fully rejected (0 anomalies each): ${results.summary.allAttackClassesFullyRejected}`);
}

main();
