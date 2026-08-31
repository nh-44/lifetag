# AegisTag / LifeTag — Phase 0 Audit

Audited against commit `bcbb1fb` on `main`, 2026-08-31. All line numbers refer to files in this repo tree as of that commit. This document reports what the code does; Section "Discrepancies" flags places where the paper's description diverges from it. Nothing here has been fixed yet.

## 1. LaTeX source location and structure

The paper source is [docs/lifetag_paper_draft.tex](docs/lifetag_paper_draft.tex) (IEEEtran conference class, single `.tex` file, no separate bibliography or figure files). Current section numbering:

1. Introduction (Emergency Medical Information Access Problem, Problem With Current Solutions, Why NFC?, Our Solution: AegisTag, Contributions)
2. Related Work (NFC-Based Healthcare Systems, Emergency Medical Information Systems, Security and Privacy in NFC Systems, Consent and Access Governance in EHR Systems, Research Gap and Comparison)
3. System Requirements and Threat Model (Functional Requirements, Adversary / Threat Model)
4. AegisTag System Architecture (High-Level Architecture, NFC Data Layer, Access Control Architecture, Consent-Gated Physician Access)
5. Security Design (Cryptographic Payload Verification, Key Management, Session Token Handling, Preliminary Post-Quantum Benchmarking Construct, Defensive Engineering)
6. Implementation (Hardware, Software Stack)
7. Experimental Methodology
8. Results and Discussion (Emergency Access Latency, NFC Reliability, Cryptographic Overhead, Payload Capacity Results, Tampering Detection, Discussion) — **entirely TODO placeholders, no measured data**
9. Comparative Evaluation
10. Limitations
11. Future Work
12. Conclusion
13. Acknowledgment
14. References (3 entries: W3C Web NFC spec, NFC Forum Connection Handover spec, ECDSA paper)

The paper text itself is already largely self-aware of the prototype's real limitations (shared admin password, localStorage token obfuscation, simulated Kyber, unimplemented NTAG213 compact mode) — these are stated as known limitations rather than as completed features, which matches the code in most cases (see Discrepancies for the two places it doesn't).

## 2. `/api/v1/benchmarks` endpoint and `BenchmarkLog` model

Both exist and are wired up.

- Route: [server/src/routes/v1/benchmark.routes.ts](server/src/routes/v1/benchmark.routes.ts), mounted at `/benchmarks` under `/api/v1` in [server/src/routes/v1/index.ts:17](server/src/routes/v1/index.ts#L17).
  - `POST /api/v1/benchmarks/log` — inserts one `BenchmarkLog` row from `{ operation, payloadSizeRaw, payloadSizeCompressed, timeElapsedMs, deviceMeta }`. **Not behind `authMiddleware`** — this route is publicly writable by anyone who can reach the API (worth knowing before treating client-submitted rows as trustworthy telemetry).
  - `GET /api/v1/benchmarks/` — returns all rows plus a small computed stats block (count/avg time for READ and WRITE, average compression efficiency).
- Prisma model, [server/prisma/schema.prisma:118-126](server/prisma/schema.prisma#L118-L126):
  ```prisma
  model BenchmarkLog {
    id                    String   @id @default(uuid())
    operation             String   // "READ" or "WRITE"
    payloadSizeRaw        Int
    payloadSizeCompressed Int
    timeElapsedMs         Float
    deviceMeta            String?
    timestamp             DateTime @default(now())
  }
  ```
- This endpoint is actually called from production code paths, not just theoretically available: [client/src/components/nfc/NfcWriter.tsx:216](client/src/components/nfc/NfcWriter.tsx#L216) logs a WRITE row after every real `ndef.write()`, and [client/src/components/nfc/NfcScanner.tsx:195](client/src/components/nfc/NfcScanner.tsx#L195) logs a READ row after every real NFC scan, both via `logBenchmarkTelemetry` in [client/src/services/api.ts:72](client/src/services/api.ts#L72).
- There is also a standalone offline benchmark script, [server/src/utils/benchmark.ts](server/src/utils/benchmark.ts), runnable directly (`if (require.main === module) runBenchmark()`), which measures ECDSA keygen/sign/verify, Gzip compress/decompress, simulated Kyber encap/decap latency (100 iterations, p50/p95/p99), payload size across three profile sizes, and tamper-detection rate — all via `console.log`/`console.table`, not persisted anywhere.

## 3. Consent middleware

Implemented in [server/src/middlewares/consent.middleware.ts](server/src/middlewares/consent.middleware.ts) as `requireMedicalConsent`, mounted on `GET /api/v1/patients/medical/:accountId` after `requireRole(Role.DOCTOR)` in [server/src/routes/v1/patient.routes.ts:19](server/src/routes/v1/patient.routes.ts#L19).

It enforces exactly the OR of two conditions the paper describes:

```ts
// 1. Check if doctor is primary physician
const isPrimaryPhysician = patient.triageProfile?.primaryPhysician === doctorId;
if (isPrimaryPhysician) return next();

// 2. Check for emergency scan within last 24 hours
const hasRecentScan = await scanAuditRepository.checkRecentScan(doctorId, accountId, 24);
if (hasRecentScan) return next();

// 3. Access Denied
return sendError(res, ErrorCodes.FORBIDDEN, '...', 403);
```

The recency query, [server/src/repositories/scanAuditRepository.ts:17-28](server/src/repositories/scanAuditRepository.ts#L17-L28):

```ts
checkRecentScan: async (scannedBy, patientAccount, hours = 24) => {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const log = await prisma.scanAuditLog.findFirst({
    where: {
      scannedBy,
      patientAccount,
      timestamp: { gte: cutoff },
      deviceMeta: { contains: '[Authority-Certified]' }
    }
  });
  return !!log;
}
```

Note the fourth `where` clause: `checkRecentScan` only counts a scan if its `deviceMeta` contains the literal marker `[Authority-Certified]`. That marker is written by [server/src/controllers/scan.controller.ts:29-33](server/src/controllers/scan.controller.ts#L29-L33), which appends `[Authority-Certified]` or `[Self-Signed]` to `deviceMeta` depending on whether `NfcService.verifyTagIntegrity()` reports `trustedAuthority: true` (i.e., the scanned tag's authority signature verified against the embedded Healthcare Authority public key). So in practice the consent gate is stricter than the paper's one-line description ("an audited NFC scan... logged within the preceding 24 hours") — it specifically requires a scan of a tag that was authority-certified, not merely any logged scan. The scan-logging endpoint itself ([server/src/controllers/scan.controller.ts:7-40](server/src/controllers/scan.controller.ts#L7-L40)) also independently requires a valid patient signature (`verified: true`) and rejects the log if `tagPayload.timestamp` is more than 48 hours old (replay-window check), before it will write any audit row at all.

Unit coverage exists: [server/src/tests/unit/consent.middleware.spec.ts](server/src/tests/unit/consent.middleware.spec.ts).

## 4. Scan audit log

`ScanAuditLog` Prisma model, [server/prisma/schema.prisma:100-106](server/prisma/schema.prisma#L100-L106):

```prisma
model ScanAuditLog {
  id             String   @id @default(uuid())
  scannedBy      String   // First Responder or Doctor userId
  patientAccount String   // Account ID scanned
  timestamp      DateTime @default(now())
  deviceMeta     String?
}
```

Fields recorded on each row: scanning party's `userId` (`scannedBy`, taken server-side from `req.user!.userId`, i.e. the JWT — not client-supplied), the scanned patient's account ID (`patientAccount`), a server-generated `timestamp`, and `deviceMeta` — a free-text string that is the client-supplied device/user-agent string with `[Authority-Certified]` or `[Self-Signed]` appended by the server (see §3). Write path: `scanService.logScan` → `scanAuditRepository.create` ([server/src/services/scan.service.ts](server/src/services/scan.service.ts), [server/src/repositories/scanAuditRepository.ts:4-9](server/src/repositories/scanAuditRepository.ts#L4-L9)), invoked from `POST /api/v1/scans` (`scanController.logScan`). Read paths: `GET` scan history (last 100 by scanner, descending) and a CSV export endpoint, both in [server/src/controllers/scan.controller.ts](server/src/controllers/scan.controller.ts).

## 5. NDEF payload serialization (patient key pair + two signatures)

Encoding happens in two mirrored implementations — client (production path, used for real tag writes) and server (used only for benchmarking/verification, not writing):

- **Client**, [client/src/services/nfcCryptoService.ts](client/src/services/nfcCryptoService.ts):
  - `generateTagPayload()` (lines 127-169) builds a `NfcTagPayload`: `version`, `timestamp`, `fhirPatientId`, `triageData` (name/bloodGroup/allergies/emergencyContacts/dnrStatus), `tagId` (the patient's ECDSA P-256 public key, exported as JWK and `JSON.stringify`-ed), `signature` (ECDSA-SHA256 over `JSON.stringify(triageData)`, signed with the non-extractable private key via Web Crypto, base64-encoded), and `authoritySignature` (passed in from the server, not computed client-side).
  - `toShortFormat()` (lines 270-314) then minifies this into the actual on-tag shape: single-letter keys (`v`,`t`,`id`,`d.n`,`d.b`,`d.a`,`d.c`,`d.dnr`,`k`,`s`,`as`), blood group mapped to a 2-3 char code (e.g. `O-Negative`→`O-`), allergies list with literal "none"/"no allergies" entries stripped, timestamp collapsed to Unix seconds, and — critically — the public key (`k`) reduced from a full JWK object to just `"<x>.<y>"` (the two JWK coordinates dot-joined), dropping `kty`/`crv` (both are hardcoded, assumed EC/P-256, when reconstructed by `fromShortFormat`).
  - This short-form object is `JSON.stringify`-ed, then piped through the browser's native `CompressionStream("gzip")` (`compressPayload()`, lines 246-253), producing raw Gzip bytes.
  - [client/src/components/nfc/NfcWriter.tsx:154-210](client/src/components/nfc/NfcWriter.tsx#L154-L210) is the actual write path: the Gzip bytes are base64-encoded and prefixed with the literal string `"gzip:"`, and that string is written as a single NDEF **text record** (`recordType: "text"`) via `NDEFReader.write()` from the Web NFC API. A separate "compact mode" branch skips compression entirely and writes the short-form JSON as plain text (used for the not-yet-hardware-targeted NTAG213 path — see §8).
  - Round-trip is `fromShortFormat()` (lines 319-362), which reconstructs the full JWK from the `x.y` string and re-expands abbreviated keys.
- **Server**, [server/src/services/nfc.service.ts](server/src/services/nfc.service.ts): `compressTag`/`decompressTag` do plain `zlib.gzipSync`/`gunzipSync` over `JSON.stringify(payload)` **without** the client's short-key minification, and [server/src/utils/benchmark.ts:10-54](server/src/utils/benchmark.ts#L10-L54) contains its own separate copy of the short-format transform (`toShortFormat`) so its size benchmark can mirror the client's actual on-wire bytes. The server does not write to tags; it only verifies (`verifyTagIntegrity`) and benchmarks.

## 6. Where role is determined at authorization time

Server-side, from the database, at login — never from a client-supplied identifier at request time.

- At login (`authService.login`, [server/src/services/auth.service.ts:22-76](server/src/services/auth.service.ts#L22-L76)), the two-letter prefix of the submitted `userId` (`US`/`DR`/`FR`) selects which of three separate tables (`User`, `DoctorProfile`, `FirstResponderProfile`) to look the record up in; the `role` enum value is assigned by the server based on which table matched, not read from anything the client sent as a "role" field. Password is verified with bcrypt against that record before a token is issued.
- The role is embedded in the JWT payload (`generateToken({ userId, role })`, [server/src/utils/jwt.utils.ts:5-9](server/src/utils/jwt.utils.ts#L5-L9)), signed server-side with `JWT_SECRET`.
- On every subsequent request, `authMiddleware` ([server/src/middlewares/auth.middleware.ts](server/src/middlewares/auth.middleware.ts)) verifies the JWT signature and sets `req.user = payload` (so `req.user.role` comes from the cryptographically verified token, not a header/body field).
- `requireRole` ([server/src/middlewares/rbac.middleware.ts](server/src/middlewares/rbac.middleware.ts)) checks `roles.includes(req.user.role)` — i.e., against the JWT-derived value.
- There is an explicit regression test for exactly this property: [server/src/tests/security/adversarial.spec.ts:8](server/src/tests/security/adversarial.spec.ts#L8) ("Server derives role from JWT (not from client-supplied body field)").

So a client cannot escalate role by sending a different role string in the request; it would have to forge a valid JWT signature to do so.

## 7. Simulated Kyber-768 construct

Real, and confined to files that are explicit about it being a non-cryptographic placeholder. Every reference in the repo:

- [server/src/utils/crypto.utils.ts:40-80](server/src/utils/crypto.utils.ts#L40-L80) — `CryptoUtils.generateKyberKeyPair()`, `encapsulateSharedSecret()`, `decapsulateSharedSecret()`. Implementation: `generateKyberKeyPair` returns two strings built from `crypto.randomBytes(32).toString('hex')` slices with `KYBER-768-PUB-`/`KYBER-768-PRI-` string prefixes — not actual lattice key material. `encapsulateSharedSecret` returns a random 32-byte hex "shared secret" and an unrelated random "ciphertext" string (the ciphertext does not actually encapsulate the secret). `decapsulateSharedSecret` computes `SHA256(ciphertext + privateKey)` — this is **not** a real KEM decapsulation and, notably, will not reproduce the same value `encapsulateSharedSecret` generated (the two sides don't actually derive a matching shared secret at all; they're independent random/hash outputs). This is consistent with the paper's own characterization of it as a placeholder that "does not perform real lattice-based cryptography."
- [server/src/utils/benchmark.ts:182,236-247,314-323](server/src/utils/benchmark.ts) — calls the above to collect encapsulation/decapsulation latency percentiles as part of the benchmark script.
- [server/src/tests/unit/crypto.utils.spec.ts](server/src/tests/unit/crypto.utils.spec.ts) — unit tests for the above.
- [docs/lifetag_paper_draft.tex](docs/lifetag_paper_draft.tex) — described in "Preliminary Post-Quantum Benchmarking Construct" (§V-D) and listed in Limitations/Future Work.
- [lifetag_test_plan.md](lifetag_test_plan.md), [LifeTag_Team_Work_Division.md](LifeTag_Team_Work_Division.md) — planning-doc mentions only.

It is never referenced from any tag-write, tag-verify, login, or session code path — confirmed by grep, its only callers are the benchmark script and its own unit test.

## 8. NFC tag part number and hardcoded capacity constant

The write path does not address a specific tag chip programmatically (Web NFC's `NDEFReader.write()` has no chip-model parameter — it just writes an NDEF message to whatever passive tag is presented); "targeting NTAG215/216" is a byte-budget assumption enforced in application logic, not a hardware handshake. The enforced constant is:

- **504** — hardcoded independently in three places as the "standard mode" ceiling: [client/src/services/nfcCryptoService.ts:380,386](client/src/services/nfcCryptoService.ts#L380), [client/src/components/nfc/NfcWriter.tsx:176](client/src/components/nfc/NfcWriter.tsx#L176) (`const maxBudget = isCompactMode ? 137 : 504`), and [server/src/services/nfc.service.ts:119,126](server/src/services/nfc.service.ts#L119). `NfcWriter.tsx` throws and blocks the write (`ndef.write()` is never called) if the compressed+base64+`"gzip:"`-prefixed payload exceeds 504 bytes.
- **137** — the "compact mode" ceiling for the not-yet-hardware-targeted NTAG213 path, same line in `NfcWriter.tsx`. This is inconsistent with the 144-byte figure quoted elsewhere for NTAG213 (see Discrepancies).

## Discrepancies between the paper's description and the actual implementation

1. **NTAG216 capacity figure is wrong.** The paper states "NTAG215/216 (504 bytes user memory)" in the Abstract, §I-C, §IV-B, and §VI-A, and enforces 504 bytes as the shared budget for both chips in code. 504 bytes is the correct NTAG215 user-memory figure, but NTAG216 has 888 bytes of user memory, not 504 — the paper (and the implementation, which uses one hardcoded `504` constant for "NTAG215/216" generically) understates NTAG216's real capacity. Since the code never actually enforces a per-chip-model constant (see §8 — there's no way for Web NFC to know which chip is present), this is a labeling/claim error rather than a functional bug: recommend either dropping "/216" from the capacity claim or stating the 504-byte budget is deliberately sized to the more conservative NTAG215 so payloads also happen to fit an NTAG216.

2. **"Fallback development cryptographic keys... disabled when NODE\_ENV=production" (§V-F, Defensive Engineering) does not match the code.** There is no fallback/development key for `AUTHORITY_PRIVATE_KEY` at any `NODE_ENV` value: [server/src/utils/crypto.utils.ts:86-91](server/src/utils/crypto.utils.ts#L86-L91) throws unconditionally if `AUTHORITY_PRIVATE_KEY` is unset, in development and production alike, and `env.ts`'s Zod schema marks it `.optional()` at the schema level but nothing downstream substitutes a default value. `.env.example` itself documents this as "REQUIRED in all environments — there is no fallback." The half of the sentence about destructive reseeding *is* accurate — [server/prisma/seed.ts:10-12](server/prisma/seed.ts#L10-L12) throws if `NODE_ENV=production`. Recommend narrowing the sentence to the seeding guarantee only, or rewording to say there is no fallback key at all (arguably a stronger security property than what's currently claimed).

3. **NTAG213 "compact mode" budget: paper says 144 bytes, code enforces 137.** §IV-B's future-work text and the Limitations section both cite "144-byte NTAG213," matching the chip's real user-memory spec, but [client/src/components/nfc/NfcWriter.tsx:176,179](client/src/components/nfc/NfcWriter.tsx#L176) rejects compact-mode payloads over 137 bytes, and the in-UI copy at [client/src/components/nfc/NfcWriter.tsx:316](client/src/components/nfc/NfcWriter.tsx#L316) separately advertises "~45 bytes" and "(144B) chips." This is a minor internal inconsistency (137 vs. 144) worth reconciling, though it doesn't affect the paper's substantive claim that compact mode isn't implemented yet.

4. **The consent gate is narrower than one sentence in §IV-D implies.** The paper says access is granted if "the requesting doctor has an audited NFC scan of that patient's tag logged within the preceding 24 hours" — true, but incomplete: per §3 above, the scan must also carry the `[Authority-Certified]` marker, meaning only a scan of a tag whose authority signature verified counts; a logged scan of a self-signed (uncertified) tag does not satisfy the consent gate. This is a stricter, not weaker, property than described, but the paper's wording should say so explicitly since it's a meaningful part of the security argument.

5. **`POST /api/v1/benchmarks/log` is unauthenticated** ([server/src/routes/v1/benchmark.routes.ts](server/src/routes/v1/benchmark.routes.ts) has no `authMiddleware`). The paper doesn't make a claim about this either way, but since Phase 1+ will treat `BenchmarkLog` rows as the provenance record for the paper's measured results, this is worth noting: anyone with network access to the API can insert arbitrary rows into the table the paper's numbers will be computed from. For the benchmarking work in this task, results should be pulled from a controlled run (e.g., a fresh/filtered set of rows or the local `server/src/utils/benchmark.ts` script's own output) rather than blindly trusting `GET /api/v1/benchmarks/` stats on a shared/deployed instance.

No other discrepancies found — the rest of the paper's architecture, security-design, and limitations claims cross-checked correctly against the code (RBAC role source, session token storage/obfuscation, shared admin password, IndexedDB non-extractable key storage, two-tier ECDSA verification, Zod validation, bcrypt hashing, rate limiting on auth routes).
