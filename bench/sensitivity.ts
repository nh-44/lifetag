/**
 * Phase 2 — Sensitivity sweep.
 *
 * Varies allergy count and emergency-contact count and measures totalTagBytes
 * for V3 — the best-performing encoding identified in Phase 1
 * (results/encoding.json: V3 beat V4 at every profile size in Phase 1 because
 * DEFLATE cannot usefully compress the already-compact, high-entropy binary
 * payload; see RESULTS_LOG.md's Phase 1 entry).
 *
 * Realistic-data assumptions (documented per the Phase 2 spec):
 *  - Allergy strings: a curated list of real drug/allergen names actually
 *    used in triage contexts (Penicillin, Amoxicillin, Aspirin, Ibuprofen,
 *    Sulfonamides, Cephalosporins, Peanuts, Tree Nuts, Shellfish, Latex,
 *    Codeine, Morphine) — 12 distinct real names, average length ~9 chars.
 *  - Emergency contact phone numbers: Indian mobile format, E.164-style
 *    with country code and no separators, as a system would actually store
 *    it (e.g. "+919876543210", 13 characters) — stored in the same
 *    `userId`-labelled field the production TriageData type uses for
 *    contacts (see client/src/services/nfcCryptoService.ts convertToFhir(),
 *    which documents this field as the contact's phone reference).
 *  - Contact names and patient name: realistic Indian full names, "First
 *    Last" format, 11-19 characters.
 *  - fhirPatientId: a 5-digit numeric string, matching the
 *    `/^\d{5}$/` account-ID format actually validated in
 *    client/src/components/nfc/NfcScanner.tsx.
 *
 * The Phase 2 spec's requested grid is allergies x in {0,1,2,3,5,8,10},
 * contacts in {1,2,3} — all 12 curated allergen names cover that range
 * without repeats. To additionally answer "what is the maximum allergy
 * count that still fits", the sweep is extended past 10 (where the curated
 * list is exhausted and names must repeat) up to 30; those extended points
 * are clearly flagged `withinCuratedRealism: false` in the output and
 * excluded from the primary plot's realistic range marker, since repeating
 * allergen names has no clinical meaning — they exist solely to locate the
 * V3 byte-budget crossover point, and every byte count reported for them is
 * still a real measurement from the same encoder, not an estimate.
 */
import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { NTAG_CAPACITY_BYTES } from './lib/constants';
import { computeTagBytes } from './lib/ndefOverhead';
import { encodeBinaryPayload, decodeBinaryPayload } from './lib/binaryFormat';
import type { FullPayload } from './lib/shortFormat';

const REQUESTED_ALLERGY_COUNTS = [0, 1, 2, 3, 5, 8, 10];
const EXTENDED_ALLERGY_COUNTS = [12, 15, 18, 20, 25, 30];
const CONTACT_COUNTS = [1, 2, 3];

const REAL_ALLERGENS = [
  'Penicillin', 'Amoxicillin', 'Aspirin', 'Ibuprofen', 'Sulfonamides',
  'Cephalosporins', 'Peanuts', 'Tree Nuts', 'Shellfish', 'Latex',
  'Codeine', 'Morphine',
];

const REAL_CONTACTS = [
  { userId: '+919876543210', name: 'Priya Sharma' },
  { userId: '+918765432109', name: 'Rajesh Kumar' },
  { userId: '+917654321098', name: 'Anita Verma' },
];

const PATIENT_NAME = 'Ravi Krishnan';
const FHIR_PATIENT_ID = '90001';

function allergyList(count: number): { names: string[]; withinCuratedRealism: boolean } {
  if (count <= REAL_ALLERGENS.length) {
    return { names: REAL_ALLERGENS.slice(0, count), withinCuratedRealism: true };
  }
  const names: string[] = [];
  for (let i = 0; i < count; i++) names.push(REAL_ALLERGENS[i % REAL_ALLERGENS.length]);
  return { names, withinCuratedRealism: false };
}

function contactList(count: number) {
  if (count > REAL_CONTACTS.length) throw new Error(`Only ${REAL_CONTACTS.length} curated contacts available, requested ${count}`);
  return REAL_CONTACTS.slice(0, count);
}

const AUTHORITY_KEYS = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });

function buildPayload(allergyCount: number, contactCount: number): { payload: FullPayload; withinCuratedRealism: boolean } {
  const { names: allergies, withinCuratedRealism } = allergyList(allergyCount);
  const emergencyContacts = contactList(contactCount);

  const patientKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const patientPublicJwk = patientKeys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };

  const triageData = {
    name: PATIENT_NAME,
    bloodGroup: 'O-Positive',
    allergies,
    emergencyContacts,
    dnrStatus: false,
  };

  const signature = crypto
    .sign('sha256', Buffer.from(JSON.stringify(triageData)), { key: patientKeys.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64');

  const tagId = JSON.stringify({ kty: 'EC', crv: 'P-256', x: patientPublicJwk.x, y: patientPublicJwk.y });
  const authoritySignature = crypto
    .sign('sha256', Buffer.from(tagId, 'utf8'), { key: AUTHORITY_KEYS.privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64');

  return {
    payload: {
      version: '2.0',
      timestamp: new Date().toISOString(),
      fhirPatientId: FHIR_PATIENT_ID,
      triageData,
      tagId,
      signature,
      authoritySignature,
    },
    withinCuratedRealism,
  };
}

function verify(payload: FullPayload): boolean {
  const jwk = JSON.parse(payload.tagId);
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const patientOk = crypto.verify(
    'sha256', Buffer.from(JSON.stringify(payload.triageData)),
    { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(payload.signature, 'base64')
  );
  const authorityOk = crypto.verify(
    'sha256', Buffer.from(payload.tagId, 'utf8'),
    { key: AUTHORITY_KEYS.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(payload.authoritySignature!, 'base64')
  );
  return patientOk && authorityOk;
}

function measureCell(allergyCount: number, contactCount: number) {
  const { payload, withinCuratedRealism } = buildPayload(allergyCount, contactCount);

  const binary = encodeBinaryPayload(payload); // V3: compact binary, no compression
  const breakdown = computeTagBytes(binary.length, binary.length, binary.length, 'unknown-binary');

  const decoded = decodeBinaryPayload(binary);
  assert.strictEqual(decoded.triageData.allergies.length, allergyCount === 0 ? 0 : allergyCount);
  assert.strictEqual(decoded.triageData.emergencyContacts.length, contactCount);
  assert.ok(verify(decoded), `round trip must verify at allergies=${allergyCount} contacts=${contactCount}`);

  return {
    allergyCount,
    contactCount,
    withinCuratedRealism,
    totalTagBytes: breakdown.totalTagBytes,
    fitsNtag215: breakdown.totalTagBytes <= NTAG_CAPACITY_BYTES.NTAG215,
    marginVsNtag215: NTAG_CAPACITY_BYTES.NTAG215 - breakdown.totalTagBytes,
  };
}

function main() {
  const allergyCounts = [...REQUESTED_ALLERGY_COUNTS, ...EXTENDED_ALLERGY_COUNTS];
  const cells: ReturnType<typeof measureCell>[] = [];

  for (const contactCount of CONTACT_COUNTS) {
    for (const allergyCount of allergyCounts) {
      cells.push(measureCell(allergyCount, contactCount));
    }
  }

  // Derived number: max allergy count (within the tested grid) that still fits 504B, per contact count.
  const maxAllergiesThatFit: Record<number, number | null> = {};
  for (const contactCount of CONTACT_COUNTS) {
    const fitting = cells.filter((c) => c.contactCount === contactCount && c.fitsNtag215);
    maxAllergiesThatFit[contactCount] = fitting.length > 0 ? Math.max(...fitting.map((c) => c.allergyCount)) : null;
  }
  const anyOverBudgetInTestedRange = cells.some((c) => !c.fitsNtag215);

  const results = {
    meta: {
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      encoding: 'V3 (SEC1 compressed point, raw r||s signatures, no compression, raw binary NDEF record) — best performer from Phase 1',
      ntag215BudgetBytes: NTAG_CAPACITY_BYTES.NTAG215,
      requestedAllergyCounts: REQUESTED_ALLERGY_COUNTS,
      extendedAllergyCounts: EXTENDED_ALLERGY_COUNTS,
      contactCounts: CONTACT_COUNTS,
      assumptions: {
        allergenNames: REAL_ALLERGENS,
        contactFormat: 'Indian mobile, E.164-style (+91 + 10 digits), no separators',
        contacts: REAL_CONTACTS,
        patientName: PATIENT_NAME,
        fhirPatientIdFormat: '5-digit numeric, matching NfcScanner.tsx /^\\d{5}$/ validation',
        note: 'Points with allergyCount > 12 repeat curated allergen names (curated list exhausted) — see withinCuratedRealism flag per cell. They exist only to locate the V3/504B crossover, not as clinically realistic allergy lists.',
      },
    },
    cells,
    derived: {
      maxAllergiesThatFitBy504_perContactCount: maxAllergiesThatFit,
      anyOverBudgetInTestedRange,
      note: anyOverBudgetInTestedRange
        ? 'V3 exceeded the 504B NTAG215 budget within the tested range — see cells[] for the exact crossover.'
        : 'V3 did not exceed the 504B NTAG215 budget anywhere in the tested range (up to 30 allergies x 3 contacts); the payload-size bottleneck identified for V1 in Phase 1 does not reappear for V3 within any clinically plausible profile.',
    },
  };

  const outDir = path.resolve(__dirname, '..', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'sensitivity.json'), JSON.stringify(results, null, 2));

  console.log(`All ${cells.length} cells round-tripped and verified (V3, allergies x contacts sweep).`);
  console.log(`Wrote ${path.join(outDir, 'sensitivity.json')}`);
  console.log('\nmaxAllergiesThatFitBy504 per contact count:', maxAllergiesThatFit);
  console.log(results.derived.note);

  console.log('\n--- totalTagBytes (V3) ---');
  for (const contactCount of CONTACT_COUNTS) {
    const row = cells.filter((c) => c.contactCount === contactCount);
    console.log(`contacts=${contactCount}: ` + row.map((c) => `[a=${c.allergyCount}:${c.totalTagBytes}B${c.withinCuratedRealism ? '' : '*'}]`).join(' '));
  }
}

main();
