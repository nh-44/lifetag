# LifeTag — Test Plan

## 1. Current State (as of this review)

| Layer | Framework | Status |
|---|---|---|
| Client unit/component | Vitest + Testing Library | 35 tests, but scoped only to `components/nfc/` + `TagTracer.tsx` (86.8% stmt coverage on that subset per `docs/QA_Coverage_Report.md`) |
| Client pages (`EditProfile`, `EmergencyInfo`, `MedicalInfo`, `Login`, `Signup`, `MyContacts`, `MyDoctor`, `AccountInfo`) | — | **No tests** |
| Client `AuthContext`, `AuthGuard`, `api.ts`, `userService.ts`, `tokenStorage.ts` | — | **No tests** |
| Server unit/integration | none configured | Only `server/src/utils/security.spec.ts`, a hand-rolled console-assert script (`npm run test:security`) run via `tsx`, not a real test runner |
| Server controllers/services/repositories/middlewares | — | **No tests at all** — no `auth.middleware`, `rbac.middleware`, `consent.middleware`, `validate.middleware`, `rateLimit.middleware` coverage |
| E2E | none | No Playwright/Cypress setup |
| CI (`.github/workflows/build-test.yml`) | GitHub Actions | Builds client + server, runs client Vitest suite and the server security script. No coverage gate, no lint gate, no integration/E2E job |

This plan is built to close those specific gaps, not to restate generic best practice. Existing NFC-component tests are treated as a baseline to extend, not replace.

## 2. Test Pyramid

```
        E2E (few, high-value flows)
       /                            \
   Integration / API (per route)     Manual hardware QA
  /                                              \
Unit (services, utils, middlewares, hooks, components)
```

Server currently has **zero** unit or integration test framework — this is the single biggest gap and should be Phase 1.

## 3. Phase 1 — Server Unit + Integration Tests (highest priority)

**Setup**: add Vitest (matches client tooling) or Jest to `server/`, plus `supertest` for HTTP-level route tests and a disposable test database (either a `DATABASE_URL` pointed at a throwaway Postgres/Docker instance, or `prisma migrate reset` against a `lifetag_test` schema in CI). Seed/teardown per test file via Prisma.

### 3.1 `auth.service.ts` / `auth.controller.ts`
- Signup: `US`/`DR`/`FR` prefix accepted only for matching role; mismatched prefix → 400.
- Signup: duplicate `userId` → 409 (`checkAvailability` false branch).
- Signup: successful signup returns token + refreshToken + user without `password` field.
- Login: correct credentials for each role prefix → 200 + valid JWT.
- Login: wrong password → 401, generic "Invalid User ID or password" (no user-enumeration leak).
- Login: unrecognized prefix (not US/DR/FR) → 400.
- Login: non-existent `userId` → 401 (same generic message as wrong-password case — verify timing/response are indistinguishable).
- Refresh: valid, unexpired, non-revoked token → new access token.
- Refresh: token not in DB (revoked/never issued) → 401 "has been revoked".
- Refresh: expired token → 401 **and** the expired row is deleted from `RefreshToken`.
- Refresh: malformed/invalid JWT → 401 before DB lookup.
- Logout: deletes the matching `RefreshToken` row; subsequent refresh with that token fails.
- Logout: called with no/garbage token → still returns success (no crash).

### 3.2 `rbac.middleware.ts` / `auth.middleware.ts`
- No `Authorization` header → 401.
- Expired access token → 401.
- Valid token, wrong role for route (e.g. FR hitting a doctor-only route) → 403.
- Valid token, correct role → passes to controller.
- Tampered JWT signature → 401.

### 3.3 `consent.middleware.ts` (this is the paper's headline contribution — test it thoroughly)
- Doctor is patient's `primaryPhysician` → access granted, no scan required.
- Doctor is **not** primary physician, has a scan logged **within** 24h → granted.
- Doctor is not primary physician, scan logged **at exactly** the 24h boundary → confirm and document actual behavior (inclusive/exclusive), since off-by-one here is a real access-control bug class.
- Doctor is not primary physician, most recent scan is **older than 24h** → 403.
- Doctor has never scanned this patient and isn't primary physician → 403.
- Doctor has scanned a *different* patient recently → still 403 for this patient (no cross-patient leakage).
- Patient `accountId` doesn't exist → 404, not 403 (don't leak existence via error-code confusion, but do check whether the two error paths are distinguishable to an attacker probing account IDs — see §6 threat cases).
- A **first responder** hitting a doctor-only consent-gated route → blocked at `rbac.middleware` before consent logic even runs (confirms middleware ordering).

### 3.4 `validate.middleware.ts` (Zod)
- Missing required field → 400 with field-level error detail.
- Wrong type (e.g. `age` as string) → 400.
- Extra/unexpected fields → confirm whether they're stripped or rejected (document actual behavior).
- Valid body → passes through unmodified to controller.

### 3.5 `rateLimit.middleware.ts`
- `authLimiter`: 11th login/signup attempt from same IP within 15 min → 429.
- `apiLimiter`: 101st general API request within 15 min → 429.
- Rate limit is per-IP, not global — two different IPs are each allowed their own quota.
- `RateLimit-*` headers present on responses (standardHeaders enabled).

### 3.6 `crypto.utils.ts` / `nfc.service.ts` (formalize existing `security.spec.ts` into the new framework, keep its cases, add:)
- Valid patient signature over unmodified triage data → verified.
- Single-character tamper anywhere in `triageData` → verification fails.
- Missing `signature` or `tagId` → fails fast without throwing.
- Valid patient signature + valid authority signature → `verified: true, trustedAuthority: true`.
- Valid patient signature + **missing** authority signature → `verified: true, trustedAuthority: false` (confirm this is actually enforced as "don't trust" somewhere downstream — see §6).
- Valid patient signature + authority signature that doesn't match the embedded public key (forged/self-certified) → `trustedAuthority: false`.
- Malformed JWK in `tagId` → fails gracefully, doesn't throw uncaught.
- `getByteBudget`: payload with 0 allergies/contacts vs. a realistic max (e.g. 10 allergies, 5 contacts) — confirm where compressed size crosses the 504-byte NTAG215 ceiling, since this defines the real capacity limit the paper needs to report.
- `signWithAuthorityKey` with `AUTHORITY_PRIVATE_KEY` unset → throws the documented error (and confirm this is actually blocked in production per the "environment hardening" claim in `docs/security_architecture.md`).
- Kyber-768 simulated construct: encapsulate → decapsulate round-trip produces matching values *within the simulation's own logic* — useful only as a regression check, not a security property (it isn't real PQC; note this in the test file comment so it isn't mistaken for one later).

### 3.7 Repositories (`userRepository`, `doctorRepository`, `firstResponderRepository`, `scanAuditRepository`)
- `existsByUserId` / `findByUserId` / `findByAccountId` correctness against seeded fixtures.
- `scanAuditRepository.checkRecentScan` boundary behavior — same 24h edge case as §3.3, tested at the repository layer directly (isolates whether a bug would be in the query or the middleware).
- Cascading delete: deleting a `User` removes their `TriageProfile`/`MedicalHistory` (per `onDelete: Cascade` in schema).

## 4. Phase 2 — Client Unit + Component Tests

Extend the existing Vitest setup beyond `components/nfc/`:

- **`AuthContext.tsx`**: login stores tokens via `tokenStorage`, logout clears them, session restored from stored token on reload, expired-token handling.
- **`tokenStorage.ts`**: obfuscate/deobfuscate round-trip; corrupted stored value → `getToken()` returns `null` instead of throwing.
- **`AuthGuard.tsx`**: unauthenticated user redirected to `/login`; authenticated user with wrong role redirected to `/unauthorized`; authenticated user with correct role renders children.
- **`EmergencyInfo.tsx`**: confirm it renders *only* triage-level fields even if a mocked API response includes deep medical fields — this is a defense-in-depth check for accidental over-fetching/over-rendering, independent of server-side redaction.
- **`MedicalInfo.tsx`**: renders deep fields only when the mocked session role is `DOCTOR`; shows an access-denied state when the API returns 403 (consent gate rejection).
- **`EditProfile.tsx`**: form validation (required fields, blood group enum, allergy list add/remove), successful submit calls the right service method.
- **`Login.tsx` / `Signup.tsx`**: role-aware redirect after login (`US` → home, `DR`/`FR` → their respective landing pages); signup form validates userId prefix client-side before submit.
- **`AdminPanel.tsx`**: (existing coverage is 86.6% branch — the known gap is likely the wrong-password path and the "keep authenticated on close vs. logout" state distinction; add explicit cases for both.)
- **`NfcScanner.tsx`**: this file has the lowest branch coverage (64.8%) in the current suite — prioritize the untested branches: read errors other than "not supported", scan-abort mid-read, and malformed/non-JSON NDEF payloads.

## 5. Phase 3 — API Integration Tests (server, via `supertest`)

Full-stack-minus-browser tests hitting real Express routes against the test DB:

- `POST /api/v1/auth/signup` → `POST /api/v1/auth/login` → use returned token on a protected route, end to end.
- `GET /api/v1/patients/:accountId/triage` as an authenticated first responder → returns only triage fields (verify response shape, not just status code).
- `GET /api/v1/doctors/.../medical/:accountId` as a doctor with no relationship and no scan → 403; log a scan via the scan endpoint, retry → 200.
- `POST /api/v1/scans` writes an audit row and that row is immediately visible to the consent check (no caching/staleness).
- `GET /api/v1/benchmarks` (or whatever the actual benchmark write endpoint is) accepts a `BenchmarkLog` entry and it's queryable — this endpoint is also the one Phase 5 below depends on.
- 404 vs 403 vs 401 are distinguishable and correct across a few representative routes (ties back to §3.3's error-path concern).

## 6. Phase 4 — Security / Adversarial Test Cases

Beyond the crypto correctness in §3.6, these test *system behavior* under the threat model already stated in the paper:

- **Replay**: a validly-signed, validly-certified payload with an old `timestamp` (e.g. simulating a tag that was written, then the patient's data changed server-side, but the old physical tag is replayed) — confirm whether anything currently checks payload freshness. If not, this is a real gap to either fix or explicitly document as an accepted limitation (a stale-but-signed tag showing outdated allergy data is a patient-safety issue worth naming either way).
- **Trust downgrade enforcement**: confirm that a payload with `trustedAuthority: false` (self-signed, no valid authority cert) is actually blocked or clearly flagged as "unverified" in the first-responder UI, not silently treated the same as a fully trusted one. Trace this from `NfcService.verifyTagIntegrity` through to whatever renders the scan result.
- **Cross-role token reuse**: a token issued for role `FIRST_RESPONDER` cannot be replayed against doctor-only routes even if the `userId`/role claim were manually edited (confirms server re-derives role from DB/JWT signature, not from a client-trusted claim alone — check whether it actually re-derives or just trusts the JWT payload's `role` field, since the current `auth.service.ts` embeds role directly into the token at issuance).
- **Admin panel password**: confirm (and then track as a P0 finding, not just a test) that the hardcoded `"00000"` password is not shippable to production; add a CI check that fails the build if `NODE_ENV=production` and this constant is still reachable/unmodified.
- **Rate limit bypass**: confirm `authLimiter` is actually mounted on the auth routes (not just defined) — a middleware defined-but-unmounted is a common real bug class.

## 7. Phase 5 — Performance / Benchmark Tests (feeds the paper directly)

This closes the `TODO` placeholders left in `docs/lifetag_paper_draft.tex` Section VII. Run via the app's own `/api/v1/benchmarks` logging, not ad hoc scripts, so results are reproducible:

- **Crypto/compression latency** (Table: Cryptographic and Compression Latency): key generation, sign, verify, gzip compress, gzip decompress — N=100 runs, report mean/min/max, on the actual target reader device (not just a dev laptop).
- **Payload size** (Table: Payload Size): raw JSON vs. gzip size, run across a *distribution* of realistic profiles (0 allergies/1 contact up to 10 allergies/5 contacts) rather than a single fixed sample — the paper should report the range, not one point, since that's what determines whether the 504-byte NTAG215 budget actually holds in practice.
- **NFC read/write handshake latency**: physical trials, Web NFC API timing, 1–4cm range, on the real target device(s) — this cannot be run in CI and needs a manual test session logged separately (see §8).
- **Tamper detection rate**: N single-character-altered payloads → confirm 100% rejection rate, report N and any failures explicitly rather than asserting 100% without a number.

## 8. Phase 6 — Manual / Hardware QA Checklist (not automatable)

- Physical read/write against NTAG215 and NTAG216 tags specifically (README/code reference both).
- Web NFC support check on target Chromium-Android devices; confirm graceful degradation message on unsupported browsers (iOS Safari) rather than a silent failure.
- Tag written at low battery / weak RF coupling — confirm partial-write is detected, not silently accepted as valid.
- Multiple tags scanned in quick succession — confirm scan history doesn't merge or drop entries.
- IndexedDB private key survives a browser restart but is cleared on `clearTokens`/logout only where intended — confirm private key persistence policy matches what's documented (patient key should likely survive logout since it's the tag's identity, unlike session tokens).

## 9. Tooling & CI Changes Needed

1. Add a real test runner to `server/` (Vitest recommended, for tooling parity with client) + `supertest` + a test-DB strategy; retire the `tsx`-script version of `security.spec.ts` in favor of proper `describe/it` blocks once ported.
2. Add a coverage threshold gate in CI for both client and server (the existing 86.8% client figure is coverage of `nfc/` only — get a whole-repo number before setting a gate).
3. Add a `lint` step to CI (currently defined in both `package.json`s but not invoked by the workflow).
4. Add a `build-server` step that also runs the new server test suite (not just the security script).
5. Consider Playwright for the small set of E2E flows in §10 — Web NFC itself can't be simulated in Playwright, so those specific steps stay manual (§8), but everything up to "tag payload ready to write" and everything from "payload scanned" onward (auth, routing, consent, redaction) can be E2E'd.

## 10. Minimal E2E Flow Set (once Playwright is added)

1. Patient signs up → completes profile → generates keypair (mocked Web Crypto in test env) → payload assembled and passes byte-budget check.
2. First responder logs in → views triage-only page for a seeded patient → deep medical fields never appear in the DOM (not just "hidden via CSS" — assert absence).
3. Doctor with no relationship denied medical view → a scan-audit row is seeded → doctor granted → row's timestamp pushed past 24h → doctor denied again.
4. Logout → refresh token reuse attempt fails.

## 11. Suggested Prioritization

| Priority | Phase | Why |
|---|---|---|
| P0 | 3.2, 3.3 (RBAC + consent) | Core access-control correctness; also the paper's main claimed contribution |
| P0 | §6 (security/adversarial) | Includes the hardcoded admin password and trust-downgrade findings — these are shippability blockers, not nice-to-haves |
| P1 | 3.1, 3.4, 3.5, 3.6, 3.7 (rest of server unit) | Server currently has ~0 automated coverage outside crypto |
| P1 | §7 (benchmarks) | Directly unblocks the paper's Results section |
| P2 | §4 (client gaps) | Existing NFC component coverage is decent; pages/context are the gap |
| P2 | §5 (API integration) | Valuable once P0/P1 unit tests exist to build on |
| P3 | §10 (E2E), §8 (manual hardware) | Highest value but highest setup cost; sequence after the above |

## 12. Team Assignment

Two rules applied below:
1. **Hardware QA is fully self-contained with Naveen** — both writing the hardware checklist and executing it, since it requires physical device possession and his existing crypto/benchmark ownership (§3.6, §7) already ties directly into it.
2. **Everywhere else, the person who writes a test suite does not run/sign it off** — a different teammate executes it and reports results back to the author. This catches "I wrote it so of course it passes" blind spots and matches the plan's Phase 1 priority (RBAC/consent) getting a second set of eyes.

Assignments below build on existing file ownership from `LifeTag_Team_Work_Division.md` where it lines up; noted explicitly where this reassigns something (Navyashree was originally sole QA lead — hardware QA moves off her plate here per your instruction, freeing her for the cross-cutting security/E2E/CI work below).

### Navyashree — Crypto, Benchmarks & Full Hardware QA (creates *and* runs, solo)
- §3.6 — Crypto/NFC service unit tests (`crypto.utils.ts`, `nfc.service.ts`, `security.spec.ts` port)
- §7 — Performance/benchmark tests: crypto/compression latency, payload-size distribution, tamper-detection rate, **and** physical NFC read/write handshake timing
- §8 — Full manual hardware QA checklist (NTAG215/216 physical trials, weak-coupling/partial-write behavior, browser-support degradation)
- Directly feeds `docs/lifetag_paper_draft.tex` Section VII — Naveen owns turning these results into the paper's tables

### Preksha — Server Unit & Integration Tests (creates)
- §3.1 `auth.service`/`auth.controller`
- §3.2 `rbac.middleware`/`auth.middleware`
- §3.3 `consent.middleware` (P0 — the paper's core contribution)
- §3.4 `validate.middleware`, §3.5 `rateLimit.middleware`
- §3.7 Repositories
- §5 API integration tests (`supertest`)
- **Run/verified by: Navyashree**

### Nandita — Client Unit & Component Tests (creates)
- §4 — `AuthContext`, `AuthGuard`, `tokenStorage`, all untested pages (`EditProfile`, `EmergencyInfo`, `MedicalInfo`, `Login`, `Signup`, `MyContacts`, `MyDoctor`, `AccountInfo`)
- Also picks up the existing NFC-component branch-coverage gaps flagged in §4 (`NfcScanner.tsx` at 64.8% branch coverage, `AdminPanel.tsx` password/state-transition paths) as part of her broader client sweep
- **Run/verified by: Preksha**

### Naveen — Security/Adversarial, E2E & CI Tooling (creates)
- §6 — Security/adversarial cases *excluding* the crypto-specific ones under Naveen (replay/freshness, trust-downgrade enforcement tracing, cross-role token reuse, admin-panel hardcoded-password P0 finding, rate-limit-mounted check)
- §10 — E2E flow set (Playwright)
- §9 — Tooling & CI changes (server test runner setup, coverage gates, lint step, Playwright integration)
- **Run/verified by: Nandita**

### Cross-check rotation (creator → runner)
```
Preksha  →  Navyashree
Nandita  →  Preksha
Navyashree →  Nandita
Naveen   →  Naveen (solo — hardware/crypto)
```
Each runner reports pass/fail + coverage back to the author, not just to the group, so gaps get fixed by the person who understands that code area.

## 12. Team Assignment (4-Person Split)

Mapped to the existing ownership in `LifeTag_Team_Work_Division.md` so each person is testing code they already know, with one person dedicated entirely to hardware QA (no software test-writing load, since physical NFC testing has its own overhead — device time, tag stock, multiple browsers/OSes).

### Naveen — Crypto & Software Benchmarks
- §3.6 — `crypto.utils.ts` / `nfc.service.ts` unit tests (port `security.spec.ts` into the new framework, add the new cases: missing authority signature, forged authority signature, malformed JWK, byte-budget across profile sizes).
- §6 crypto-adjacent adversarial cases: replay of a stale signed payload, trust-downgrade enforcement trace (does `trustedAuthority: false` actually get blocked downstream, or just computed?).
- §7 **software-side** benchmarks only (no hardware needed): crypto/compression latency table, payload size across the profile-size distribution, tamper detection rate. Runs against the `/api/v1/benchmarks` endpoint.
- Hands off physical NFC timing numbers to Navyashree (§7 hardware half) — the two of them jointly own populating the paper's Results tables.

### Preksha — Backend, Auth, Access Control
- §3.1–§3.5, §3.7 — auth service/controller, `rbac.middleware`, `consent.middleware` (P0 — this is the paper's core claimed contribution), `validate.middleware`, `rateLimit.middleware`, repositories.
- §5 — API integration tests (`supertest`) once the unit layer above exists.
- §6 non-crypto adversarial cases: hardcoded admin-password production check, rate-limit-mounted-not-just-defined check, cross-role token/claim tampering.
- §9 — stands up the server test framework itself (Vitest + supertest + test-DB strategy) first, since everyone else's server-side tests in this split depend on it existing. **Do this before anything else in Phases 1/3.**

### Nandita — Client Unit/Component Tests + E2E
- §4 — `AuthContext`, `AuthGuard`, `tokenStorage`, and the untested pages (`EditProfile`, `EmergencyInfo`, `MedicalInfo`, `Login`, `Signup`, `MyContacts`, `MyDoctor`).
- Also inherits the existing branch-coverage gaps in `NfcScanner.tsx` (64.8%) and `AdminPanel.tsx` (86.6%) — these were Navyashree's file ownership in the original team doc, but since she's fully allocated to hardware QA in this split, the software-side gap-filling for those two files moves to Nandita.
- §10 — Playwright E2E setup and the four flows listed (mock Web Crypto/Web NFC at the browser-API boundary; the physical scan itself stays with Navyashree in §8).
- Sequence after Preksha's server framework and Naveen/Preksha's unit layers are in place, since E2E exercises the real stack.

### Navyashree — Full Hardware QA (dedicated)
- §8 in full: physical read/write against NTAG215 *and* NTAG216, Web NFC support/degradation check across target devices, weak-RF/low-battery partial-write behavior, rapid-succession scan handling, IndexedDB private-key persistence-across-logout check.
- §7 **hardware-side** benchmarks only: NFC read/write handshake latency (1–4cm range, N physical trials), logged through the same `/api/v1/benchmarks` endpoint Naveen's software-side numbers go through, so both halves land in the same table.
- No unit/component/integration test-writing load in this split — the physical QA surface (multiple tags, multiple devices, multiple browser states) is treated as a full workload on its own.
- Delivers raw hardware timing data to Naveen for the joint Results section in the paper.

### Cross-cutting notes
- **Blocking order**: Preksha's server test-framework setup (§9) blocks Navyashree's and Preksha's own unit tests, which block Nandita's E2E work. Naveen's hardware QA has no software dependency and can start immediately in parallel.
- **Shared deliverable**: the paper's Results section (Section VII of `lifetag_paper_draft.tex`) needs both Navyashree's software-side numbers and Naveen's hardware-side numbers — flag this as a joint checkpoint before that section can be finalized, not two independent handoffs.
