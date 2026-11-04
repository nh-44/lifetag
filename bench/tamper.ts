/**
 * Phase 4 — Tamper detection suite (tag format v3).
 *
 * Exercises the REAL production verification code (server/src/services/nfc.service.ts
 * NfcService.verifyTagIntegrity + NfcService.classifyFreshness, which call
 * server/src/utils/crypto.utils.ts CryptoUtils.verifyEcdsaSignature), not a
 * reimplementation. Payloads are signed with the same canonical signing strings
 * (contentSigningString / certSigningString) the client uses.
 *
 * Primary metric: a trial is ACCEPTED iff the tag is authority-certified
 * (`trustedAuthority`) AND it is the patient's current issuance
 * (`classifyFreshness(...) === 'current'`). That conjunction is exactly the
 * condition under which the server logs a scan as certified, i.e. the only
 * outcome that unlocks a doctor's consent window. `verified: true` alone means
 * "signed by SOME key", which a legitimate self-signed tag also achieves, so it
 * is reported per class for transparency but is not the security metric.
 *
 * Each trial simulates the server's issuance record for the patient. Unless a
 * class is specifically about staleness, the record matches the tag's issuedAt
 * (so freshness is 'current' and acceptance reduces to `trustedAuthority`).
 *
 * N=200 per class x 13 classes (12 attacks + 1 control) = 2600 total trials.
 */
import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  NfcService,
  TriagePayload,
  TAG_FORMAT_VERSION,
  contentSigningString,
  certSigningString,
  issuedAtSeconds,
} from '../server/src/services/nfc.service';
import { corruptAsciiString, corruptBase64Url, corruptBufferBit } from './lib/corrupt';

const N_PER_CLASS = 200;
const AUTHORITY_KEYS = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });

// Trust anchor injection: the production code derives its anchor from
// AUTHORITY_PRIVATE_KEY unless this documented override is set.
NfcService.authorityPublicKeysOverride = [AUTHORITY_KEYS.publicKey.export({ format: 'jwk' })];

type IssuanceRecord = { tagIssuedAt: Date | null; tagRevokedAt: Date | null };

const sign = (key: crypto.KeyObject, data: string) =>
  crypto.sign('sha256', Buffer.from(data, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }).toString('base64');

interface IssuedTag {
  payload: TriagePayload;
  patientPrivateKey: crypto.KeyObject;
  record: IssuanceRecord; // server state right after this tag was issued
}

function issueTag(fhirPatientId: string, namePrefix: string, issuedAtSec = Math.floor(Date.now() / 1000)): IssuedTag {
  const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { x, y } = patientKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };

  const payload: TriagePayload = {
    version: TAG_FORMAT_VERSION,
    timestamp: new Date(issuedAtSec * 1000).toISOString(),
    fhirPatientId,
    tagId: JSON.stringify({ kty: 'EC', crv: 'P-256', x, y }),
    triageData: {
      name: `${namePrefix} Patient`,
      bloodGroup: 'O-Negative',
      allergies: ['Penicillin'],
      emergencyContacts: [{ userId: '+919876543210', name: 'Emergency Contact' }],
      dnrStatus: false,
    },
    signature: '',
  };
  payload.signature = sign(patientKeys.privateKey, contentSigningString(payload));
  payload.authoritySignature = sign(AUTHORITY_KEYS.privateKey, certSigningString(fhirPatientId, issuedAtSec, x, y));

  return {
    payload,
    patientPrivateKey: patientKeys.privateKey,
    record: { tagIssuedAt: new Date(issuedAtSec * 1000), tagRevokedAt: null },
  };
}

interface TrialOutcome {
  verified: boolean;
  trustedAuthority: boolean;
  freshness: string;
  accepted: boolean;
  decompressionOrParseFailed?: boolean;
}

function runTrial(payload: TriagePayload, record: IssuanceRecord): TrialOutcome {
  const { verified, trustedAuthority } = NfcService.verifyTagIntegrity(payload);
  const freshness = NfcService.classifyFreshness(issuedAtSeconds(payload.timestamp), record);
  return { verified, trustedAuthority, freshness, accepted: trustedAuthority && freshness === 'current' };
}

// --- Attack class implementations -------------------------------------------------

function classContentCorruption(): TrialOutcome {
  const { payload, record } = issueTag('90101', 'Content');
  payload.triageData.name = corruptAsciiString(payload.triageData.name);
  return runTrial(payload, record);
}

function classPublicKeyCorruption(): TrialOutcome {
  const { payload, record } = issueTag('90102', 'Key');
  const jwk = JSON.parse(payload.tagId);
  jwk.x = corruptBase64Url(jwk.x);
  payload.tagId = JSON.stringify(jwk);
  return runTrial(payload, record);
}

function classPatientSignatureCorruption(): TrialOutcome {
  const { payload, record } = issueTag('90103', 'PatientSig');
  // Corrupt at the raw byte level, not the base64 character level: a base64
  // signature's final character encodes some unused/padding bits that don't
  // map to any real byte (see RESULTS_LOG.md's Phase 4 entry).
  payload.signature = corruptBufferBit(Buffer.from(payload.signature, 'base64')).toString('base64');
  return runTrial(payload, record);
}

function classAuthoritySignatureCorruption(): TrialOutcome {
  const { payload, record } = issueTag('90104', 'AuthSig');
  payload.authoritySignature = corruptBufferBit(Buffer.from(payload.authoritySignature!, 'base64')).toString('base64');
  return runTrial(payload, record);
}

function classTruncation(): TrialOutcome {
  const { payload, record } = issueTag('90105', 'Truncate');
  const compressedBuf = Buffer.from(NfcService.compressTag(payload), 'hex');
  // Truncate at a random offset strictly before the end (guarantees data loss).
  const cutAt = 1 + Math.floor(Math.random() * (compressedBuf.length - 1));
  try {
    const decompressed = NfcService.decompressTag(compressedBuf.subarray(0, cutAt).toString('hex'));
    // If decompression somehow "succeeds" on truncated data, it must still fail verification.
    return runTrial(decompressed, record);
  } catch {
    // Refusing to process an unreadable payload is a correct rejection.
    return { verified: false, trustedAuthority: false, freshness: 'n/a', accepted: false, decompressionOrParseFailed: true };
  }
}

function classCrossPatientGraft(): TrialOutcome {
  // A's key + signatures, B's clinical content and ID: Tier 1 must fail.
  const a = issueTag('90106', 'PatientA');
  const b = issueTag('90107', 'PatientB');
  const grafted: TriagePayload = { ...a.payload, triageData: b.payload.triageData, fhirPatientId: b.payload.fhirPatientId };
  return runTrial(grafted, b.record);
}

function classForgedKey(): TrialOutcome {
  // Adversary signs fabricated content with their own valid P-256 key; without
  // AUTHORITY_PRIVATE_KEY they can only attach a garbage certificate.
  const victim = issueTag('90108', 'Victim');
  const attackerKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { x, y } = attackerKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const forged: TriagePayload = {
    ...victim.payload,
    tagId: JSON.stringify({ kty: 'EC', crv: 'P-256', x, y }),
    triageData: { name: 'Forged Identity', bloodGroup: 'AB-Positive', allergies: [], emergencyContacts: [], dnrStatus: false },
    authoritySignature: crypto.randomBytes(64).toString('base64'),
  };
  forged.signature = sign(attackerKeys.privateKey, contentSigningString(forged));
  return runTrial(forged, victim.record);
}

function classIssuedAtEdit(): TrialOutcome {
  // Make an old tag look like the current issuance by rewriting its timestamp
  // to match the server record. issuedAt is signed, so Tier 1 must fail.
  const old = issueTag('90110', 'OldTimestamp', Math.floor(Date.now() / 1000) - 180 * 86400);
  const currentRecord: IssuanceRecord = { tagIssuedAt: new Date(Math.floor(Date.now() / 1000) * 1000), tagRevokedAt: null };
  old.payload.timestamp = currentRecord.tagIssuedAt!.toISOString();
  return runTrial(old.payload, currentRecord);
}

function classPatientIdRelabel(): TrialOutcome {
  // Relabel a genuine certified tag as belonging to another patient (the
  // consent-gate bypass vector). The ID is signed in both tiers.
  const a = issueTag('90111', 'Relabel');
  const victimRecord = a.record; // victim's issuance record coincides in time
  return runTrial({ ...a.payload, fhirPatientId: '90112' }, victimRecord);
}

function classCertificateGraft(): TrialOutcome {
  // Attacker reuses a genuine certificate issued for patient A's key on a tag
  // claiming patient B, re-signing B-labelled content with A's private key so
  // Tier 1 passes. The certificate names patient A, so Tier 2 must fail.
  const a = issueTag('90113', 'CertOwner');
  const forged: TriagePayload = { ...a.payload, fhirPatientId: '90114', triageData: { ...a.payload.triageData, name: 'Victim B' } };
  forged.signature = sign(a.patientPrivateKey, contentSigningString(forged));
  return runTrial(forged, a.record);
}

function classSupersededReplay(): TrialOutcome {
  // A genuine, unmodified, certified tag that has since been replaced by a newer issuance.
  const old = issueTag('90115', 'Superseded', Math.floor(Date.now() / 1000) - 90 * 86400);
  const reissued: IssuanceRecord = { tagIssuedAt: new Date(), tagRevokedAt: null };
  return runTrial(old.payload, reissued);
}

function classRevokedReplay(): TrialOutcome {
  // A genuine, unmodified, certified tag the patient has reported lost.
  const tag = issueTag('90116', 'Revoked', Math.floor(Date.now() / 1000) - 3600);
  return runTrial(tag.payload, { ...tag.record, tagRevokedAt: new Date() });
}

function classControl(): TrialOutcome {
  const { payload, record } = issueTag('90109', 'Control');
  return runTrial(payload, record);
}

// --- Run ----------------------------------------------------------------------

interface ClassResult {
  className: string;
  expectedOutcome: 'reject' | 'accept';
  n: number;
  acceptedCount: number;
  trustedAuthorityTrueCount: number;
  verifiedTrueCount: number;
  decompressionFailedCount: number;
  rejectionRate: number; // reject classes: fraction not accepted; control: fraction accepted
  anomalies: TrialOutcome[]; // trials whose outcome did NOT match expectedOutcome — never rounded away
}

function runClass(className: string, expectedOutcome: 'reject' | 'accept', trialFn: () => TrialOutcome): ClassResult {
  const outcomes: TrialOutcome[] = [];
  for (let i = 0; i < N_PER_CLASS; i++) outcomes.push(trialFn());

  const acceptedCount = outcomes.filter((o) => o.accepted).length;
  const anomalies = outcomes.filter((o) => (expectedOutcome === 'reject' ? o.accepted : !o.accepted));

  return {
    className,
    expectedOutcome,
    n: N_PER_CLASS,
    acceptedCount,
    trustedAuthorityTrueCount: outcomes.filter((o) => o.trustedAuthority).length,
    verifiedTrueCount: outcomes.filter((o) => o.verified).length,
    decompressionFailedCount: outcomes.filter((o) => o.decompressionOrParseFailed).length,
    rejectionRate: expectedOutcome === 'reject' ? (N_PER_CLASS - acceptedCount) / N_PER_CLASS : acceptedCount / N_PER_CLASS,
    anomalies,
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
    runClass('issuedAt edit (old tag re-dated to the current issuance)', 'reject', classIssuedAtEdit),
    runClass("Patient-ID relabel (certified tag presented as another patient's)", 'reject', classPatientIdRelabel),
    runClass("Certificate graft (A's genuine cert on B-labelled content re-signed with A's key)", 'reject', classCertificateGraft),
    runClass('Superseded-tag replay (genuine tag, newer issuance exists)', 'reject', classSupersededReplay),
    runClass('Revoked-tag replay (genuine tag, patient revoked it)', 'reject', classRevokedReplay),
    runClass('Valid unmodified current payload (control)', 'accept', classControl),
  ];

  const totalN = classes.reduce((a, c) => a + c.n, 0);
  assert.ok(totalN >= 1000, `Total N must be >= 1000, got ${totalN}`);

  const controlFalseRejects = classes.find((c) => c.expectedOutcome === 'accept')!.anomalies.length;

  const results = {
    meta: {
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      tagFormatVersion: TAG_FORMAT_VERSION,
      nPerClass: N_PER_CLASS,
      totalN,
      metric: "accepted == trustedAuthority && classifyFreshness(...) === 'current' (the condition for a certified scan; see file header)",
      verifiedAgainst: 'server/src/services/nfc.service.ts NfcService.verifyTagIntegrity + NfcService.classifyFreshness (real production code)',
    },
    classes: classes.map((c) => ({
      className: c.className,
      expectedOutcome: c.expectedOutcome,
      n: c.n,
      acceptedCount: c.acceptedCount,
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
      `${c.className} [expected: ${c.expectedOutcome}] — accepted: ${c.acceptedCount}/${c.n}, ` +
      `trustedAuthority=true: ${c.trustedAuthorityTrueCount}/${c.n}, verified=true: ${c.verifiedTrueCount}/${c.n}, ` +
      `decompFailed: ${c.decompressionFailedCount}/${c.n}, anomalies=${c.anomalies.length}`
    );
  }
  console.log(`\nControl false-reject rate: ${controlFalseRejects}/${N_PER_CLASS} (${((controlFalseRejects / N_PER_CLASS) * 100).toFixed(2)}%)`);
  console.log(`All attack classes fully rejected (0 anomalies each): ${results.summary.allAttackClassesFullyRejected}`);

  // CI gate: the paper's security claim must keep holding for the code as it is now.
  if (!results.summary.allAttackClassesFullyRejected || controlFalseRejects > 0) {
    console.error('TAMPER SUITE FAILED: an attack was accepted or a valid tag was rejected.');
    process.exitCode = 1;
  }
}

main();
