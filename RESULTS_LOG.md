# RESULTS_LOG.md — Provenance Record

This file records what was run, when, on what hardware, and with what N, for every measurement that ends up in `docs/aegistag_paper_draft.tex`. Nothing is written into the paper until its corresponding entry exists here with a real, executed command and output artifact.

## Environment (fixed across this work, unless a phase entry says otherwise)

- Host: Windows 11 Home Single Language, 13th Gen Intel Core i7-13700HX, 15.7 GB RAM
- Node.js: v24.17.0, npm 11.13.0
- Server test DB: PostgreSQL 14 (`postgres:14-alpine` via Docker Compose, `docker-compose.yml`), container `aegistag-postgres`, database `aegistag_test` on `localhost:5433`
- Repo: `AegisTag`, branch `main`, base commit `bcbb1fb` (+ uncommitted fixes described below)

## 2026-08-31 — Phase 0: Audit

- Ran: manual code audit (Read/Grep across `server/src`, `client/src`, `server/prisma/schema.prisma`, `docs/aegistag_paper_draft.tex`). No execution, no N — this is a static audit.
- Output: [AUDIT.md](AUDIT.md).
- Findings: 5 discrepancies between the paper and the implementation (NTAG216 capacity, fallback-key claim, NTAG213 compact-mode budget constant, consent-gate wording, unauthenticated benchmark-log endpoint). See AUDIT.md "Discrepancies" section.

## 2026-08-31 — Critical fix: ECDSA signature-encoding mismatch (discovered during Phase 1 prep, before any benchmark code was written)

**What was found.** While preparing to benchmark Tier 1 (patient signature) and Tier 2 (authority signature) verification for Phase 3, a sanity check of the real client↔server wire format revealed that the two-tier verification was non-functional end-to-end:

- The browser's Web Crypto API (`window.crypto.subtle.sign`/`.verify` with `{ name: "ECDSA" }`, used in `client/src/services/nfcCryptoService.ts`) always produces/consumes signatures in raw **IEEE P1363** format (64 bytes, r‖s concatenated, for P-256).
- Node's `crypto.sign`/`crypto.verify` (used in `server/src/utils/crypto.utils.ts`) default to **DER** encoding (variable length, ~70-72 bytes for P-256) unless `dsaEncoding: 'ieee-p1363'` is explicitly passed.
- `CryptoUtils.verifyEcdsaSignature` (server) called `crypto.verify` with no `dsaEncoding` option, so it silently rejected every genuine patient signature produced by a real browser.
- `CryptoUtils.signWithAuthorityKey` (server) called `crypto.createSign`/`.sign` with no encoding option, producing a DER authority signature that the client's Web Crypto `subtle.verify` (P1363-only) would then always reject.
- Every pre-existing unit/integration test signed **and** verified using Node's `crypto.createSign` on both ends (DER↔DER, self-consistent), so this real client↔server incompatibility was never exercised by CI.

**Verification of the bug** (before fixing), via ad hoc Node script, `node -e "..."` (see session transcript): a 64-byte P1363 signature verified against `crypto.verify()` with default (DER) encoding returned `false`; the same signature verified with `dsaEncoding: 'ieee-p1363'` returned `true`. A DER signature fed to `crypto.webcrypto.subtle.verify()` (Node's own WHATWG-compliant Web Crypto implementation, used here to check the browser-side direction without a browser) also returned `false`.

**Fix applied**: `server/src/utils/crypto.utils.ts` — `verifyEcdsaSignature` now verifies with `{ key: publicKey, dsaEncoding: 'ieee-p1363' }`; `signWithAuthorityKey` now signs with `{ key: privateKey, dsaEncoding: 'ieee-p1363' }`. Six test files were updated to sign with `dsaEncoding: 'ieee-p1363'` (matching what the real client/server now both do) instead of Node's DER default: `server/src/tests/unit/crypto.utils.spec.ts`, `server/src/tests/unit/nfc.service.spec.ts`, `server/src/tests/security/adversarial.spec.ts`, and `server/src/utils/benchmark.ts` (the pre-existing standalone benchmark script, updated so its own latency/tamper numbers reflect the corrected, real signature format rather than the old self-consistent-but-wrong-format numbers).

**Verification of the fix**:
- `npm run test:unit` (server) — 7 test files, **62/62 passed**. Command: `cd server && npm run test:unit`.
- `npm run test:integration` (server, real Postgres 14 in Docker, `aegistag_test` DB) — 6 test files, **69/69 passed**, including the two real-HTTP adversarial tests (`Crypto Adversarial: Stale payload replay`, `Crypto Adversarial: Trust-downgrade enforcement`) that POST a real P1363-signed `tagPayload` to `/api/v1/scans` and require it to pass through `NfcService.verifyTagIntegrity` correctly before the rest of each test's assertion is even reachable.
- Both runs on the environment described above, single run each (deterministic pass/fail, not a statistical measurement — N/A for sample size).

**Why this matters for the paper**: §V-A's claim that "Verification of both signatures is implemented identically on the server... and mirrored in the browser via the Web Crypto API, so that a first responder's device can perform full verification without a network round trip" was **false** prior to this fix — the two implementations were cryptographically incompatible in both directions. This is now corrected in code; Phase 7 paper revision will not need to change this claim (it will become true), but REVISION_NOTES.md will record that this was a real, previously undiscovered bug fixed as part of this work, not merely a documentation error.

## 2026-08-31 — Second critical fix: empty-allergies list breaks signature verification

**What was found**, while building Phase 1's V1 round-trip check: `toShortFormat()` (`client/src/services/nfcCryptoService.ts`, mirrored in `server/src/utils/benchmark.ts` and this suite's `bench/lib/shortFormat.ts`) strips any allergy string equal to `"none"`/`"no allergies"` before signing/compressing, collapsing to `a: []` on the wire. `fromShortFormat()` — run on every scan, immediately before signature verification — reinstated an empty allergy list as `['None']`. Since the patient signature is computed over the *original* `triageData` (a genuinely empty `[]`, for any patient with no listed allergies) before this transform runs, the reconstructed object handed to `verifyTagIntegrity()` after a scan no longer byte-matches what was signed, so verification fails for every zero-allergy patient — both in the browser (`NfcScanner.tsx`'s offline verification) and server-side (the same reconstructed object is what the client submits to `POST /api/v1/scans`).

**How it was found**: `bench/encoding-variants.ts`'s V1 round-trip assertion failed on its very first run, on the "Small Profile" fixture (`allergies: []`) — not a contrived adversarial case, just an ordinary profile.

**Fix applied**: `fromShortFormat()` no longer substitutes `['None']` for an empty array — it returns `short.d.a` as-is. Changed in `client/src/services/nfcCryptoService.ts` and mirrored in `bench/lib/shortFormat.ts` and `bench/lib/binaryFormat.ts` (the V3/V4 binary decoder, which had the same pattern in its own decode path since it was written to match the production convention). A "None" placeholder for display purposes belongs in UI rendering logic, not in data that must byte-for-byte match what was cryptographically signed. Note: a patient who literally free-types the string "None" into an allergy field was already indistinguishable from an empty list after `toShortFormat`'s cleaning step (both become `a: []` on the wire) — that narrow edge case is unaffected by this fix either way, since the wire format can't distinguish the two inputs regardless of what the decode side reconstructs.

**Verification**: `npm run bench:encoding` (this repo's new Phase 1 script) — all round-trip assertions (decode + patient-signature + authority-signature verification) pass across all 4 encoding variants × 3 profile sizes, including the originally-failing empty-allergies case. Command: `npm run bench:encoding` from the repo root, single run, deterministic.

## 2026-08-31 — Phase 1: Payload encoding comparison

- Ran: `npm run bench:encoding` (`bench/encoding-variants.ts`) on the environment described above. Single deterministic run (all sizes are computed, not sampled — no N/variance applies; cryptographic keys/signatures are freshly generated per run but this does not change byte counts since P-256 points/signatures have fixed length).
- Output: [results/encoding.json](results/encoding.json).
- Every one of the 4 variants (V1 current-production, V2 raw-DEFLATE, V3 compact-binary/no-compression, V4 compact-binary/DEFLATE) × 3 profile sizes (Small/Medium/Large) was round-tripped — decoded and both signatures (patient + authority) re-verified — before its size was written to the results file; see `sanityCheckReferenceSizes()` and the per-variant `assert.ok(verify...)` calls in `bench/encoding-variants.ts`.
- **Headline finding**: V1 (the current production encoding: full JWK public key, base64 signatures, gzip, written as a Web NFC text record) **exceeds the 504-byte NTAG215 budget for every profile size tested**, including the smallest (512 B, i.e. 8 B over budget) — Medium comes in at 572 B (68 B over) and Large at 712 B (208 B over). Switching only the compression scheme to raw DEFLATE (V2, saving gzip's ~18 B header/trailer) is not enough on its own — Medium and Large still overflow (548 B and 688 B). V3/V4 (SEC1-compressed 33-byte public key, raw 64-byte r‖s signatures, written as a raw binary NDEF record instead of base64 text) fit comfortably at every profile size, with 90-292 B of headroom to spare against the 504 B NTAG215 budget.
- Secondary finding, reported honestly rather than rounded away: DEFLATE compression (V4) is very slightly **larger** than no compression (V3) at every profile size (e.g. Large: 414 B vs. 413 B) — the compact binary buffer is already dominated by high-entropy cryptographic material (the 33-byte point + 64/128-byte signatures make up 161-225 of its 206-402 bytes), so there is little redundancy left for DEFLATE to exploit, and its minimum framing overhead very slightly exceeds any residual saving. Compression only pays off on the verbose, redundant JSON text path (V1/V2), not on the already-compact binary path (V3/V4).
- All capacity constants used (NTAG213=144 B, NTAG215=504 B, NTAG216=888 B) are defined once in `bench/lib/constants.ts`, matching NXP's datasheets and correcting the paper's NTAG216=504B conflation (see AUDIT.md discrepancy #1) at the source used by every subsequent bench phase.

## 2026-08-31 — Phase 2: Sensitivity sweep

- Ran: `npm run bench:sensitivity` (`bench/sensitivity.ts`), then `python bench/plot_sensitivity.py`. Single deterministic run per the same reasoning as Phase 1 (byte counts, not timing — no N/variance applies).
- Output: [results/sensitivity.json](results/sensitivity.json), [paper/figures/sensitivity.pdf](paper/figures/sensitivity.pdf).
- Measured V3 (the best-performing Phase 1 encoding) across the requested grid — allergy counts {0,1,2,3,5,8,10} x contact counts {1,2,3} — using a curated list of 12 real allergen/drug names and 3 realistic Indian-mobile-format emergency contacts (see the assumptions documented in `bench/sensitivity.ts`'s header and echoed into `results/sensitivity.json.meta.assumptions`). All 39 tested cells (including an extended range up to 30 allergies, see below) were round-tripped (binary decode + patient-signature + authority-signature verification) before their sizes were recorded.
- **Finding**: within the requested, clinically-realistic grid, V3 never comes close to the 504B NTAG215 budget — the largest requested cell (10 allergies, 3 contacts) uses only 385 B (119 B of headroom, 76% of budget). This directly contrasts with Phase 1's finding that V1 (current production) already exceeds budget at 0 allergies.
- To answer the sweep's own follow-up question ("the maximum number of allergy entries that still fits within 504 bytes, at 1, 2 and 3 contacts"), the allergy axis was extended past 10 up to 30 — necessarily reusing the 12 curated allergen names beyond that point since real distinct triage allergens are a small, real-world-bounded set (flagged `withinCuratedRealism: false` per cell in the JSON, and drawn with a dashed/hollow line style in the plot, not blended into the realistic result). Within that extended, no-longer-clinically-realistic range, V3 crosses 504B between 25 and 30 allergies at 1 contact, and between 20 and 25 allergies at 2 or 3 contacts. This crossover is a real measurement (same encoder, same byte-accounting code as the realistic range) — it is reported to fully answer the sweep's question, but the paper should present it as "V3 does not run out of headroom for any realistic triage profile," not lead with the 20-25 allergy crossover number, since no real patient profile in this system's target use case approaches that count.

## 2026-08-31 — Phase 3 (Node.js half): Cryptographic and compression latency

- Ran: `npm run bench:crypto-latency` (`bench/crypto-latency.ts`). N=100 measured iterations per operation, preceded by 20 discarded warmup iterations, on the environment described at the top of this file (13th Gen Intel Core i7-13700HX, Node v24.17.0).
- Output: [results/crypto-latency-node.json](results/crypto-latency-node.json).
- Measured against the current production (V1) encoding path — short-format JSON + JWK + base64 signatures + gzip — since that's what's actually deployed; Phase 1/2 already cover the cross-encoding comparison, and Phase 6 separately measures the no-crypto baseline for contrast.
- All seven operations (key generation, signing, Tier 1 verify, Tier 2 verify, gzip compression, gzip decompression, and the combined scan-path total of decompress+Tier1+Tier2) came in **well under 1 ms** on this desktop-class CPU (means 0.008-0.117 ms; scan-path total mean 0.117 ms, p95 0.129 ms).
- **This number must not be presented as the system's real-world scan latency.** It is a server-class-CPU measurement of the cryptographic operations in isolation; it says nothing about an actual first responder's phone. Phase 3 also requires the same measurement on real Android Chrome via Web Crypto — that is a physical-device, human-operated measurement out of this script's reach. The browser-side counterpart (`bench/browser/crypto-latency.html`) and instructions for running it are bundled into the Phase 5 human handoff (see the forthcoming NFC_PROTOCOL.md) since both require a physical Android device; `results/crypto-latency-mobile.json` does not exist yet and no mobile number will be written into the paper until it does.

## 2026-08-31 — Phase 4: Tamper detection suite

- Ran: `npm run bench:tamper` (`bench/tamper.ts`). N=200 per class x 8 classes (7 attacks + 1 control) = 1600 total trials, on the environment described above.
- Output: [results/tamper.json](results/tamper.json).
- Tests the **real production verification function**, `NfcService.verifyTagIntegrity` (`server/src/services/nfc.service.ts`, which calls the P1363-fixed `CryptoUtils.verifyEcdsaSignature`), imported directly — not a reimplementation.
- Primary metric is `trustedAuthority` rather than raw `verified`: per the system's own two-tier design, `verified: true` alone only means "signed by some key" (true even for a legitimate patient's self-signed, not-yet-certified tag), so a forged/tampered payload that reaches `verified: true` without `trustedAuthority: true` is expected, not a break. The file header of `bench/tamper.ts` documents this reasoning in full; both `verified` and `trustedAuthority` counts are reported per class regardless, per the "do not round away an anomaly" instruction.
- **Methodology fix found and applied during construction** (not a production bug, a bug in this bench script): signature corruption was initially implemented as a single base64-*character* substitution. Because a base64-encoded 64-byte signature's final character encodes a few unused/padding bits that don't correspond to any real byte, a character-level substitution can — measured directly — leave the decoded bytes unchanged about 2% of the time, producing a "corrupted" signature that isn't actually corrupted and coincidentally still verifies. Fixed by corrupting at the raw byte level (decode base64 → flip one bit → re-encode) using `corruptBufferBit()`, which guarantees an actual change to the cryptographic material every trial.
- **Result after the fix: 1600/1600 trials behaved exactly as expected — 0 anomalies.** All 7 attack classes (content corruption, public-key corruption, patient-signature corruption, authority-signature corruption, random-offset truncation, cross-patient graft, forged-key) achieved 0/200 `trustedAuthority: true` (100% rejection by the security-relevant metric). The control (200 fresh, unmodified, genuinely-signed-and-certified payloads) achieved 200/200 `trustedAuthority: true` — **0% false-reject rate**, satisfying the control's "false-reject must be 0/N" requirement exactly.
- Diagnostic detail worth keeping in the paper: the "authority-signature corruption" and "forged-key" classes both show `verified: true` for all 200 trials (the patient's own self-signature over their own — genuine or forged — content is internally consistent) while `trustedAuthority` is correctly `false` for all 200 — this is Tier 2 doing exactly the job it's designed for, distinguishing "internally self-consistent" from "certified by the Healthcare Authority." The forged-key class is the one that actually exercises this distinction adversarially (an attacker with a real, validly-generated P-256 key of their own, signing fabricated content) and is the case that most directly demonstrates why Tier 2 exists.

## 2026-08-31 — Phase 6 (compute-only half): Baseline comparison

- Ran: `npm run bench:baseline` (`bench/baseline.ts`). N=100 measured + 20 discarded warmup per timing metric, same environment as above.
- Output: [results/baseline.json](results/baseline.json).
- Measured the same "Medium Profile" triage data (used across Phases 1/2/3) encoded two ways: the current production signed V1 path, and an unsigned plaintext-JSON baseline with identical gzip compression (isolating the delta to the crypto/trust layer, not a compression-method confound).
- **Result**: the signed path is 564 B on tag vs. 239 B for the plaintext baseline — **+325 B (+136%)** is the byte cost of adding public-key trust to this payload. The compute cost is comparatively negligible: decompression-only "time to render" is statistically indistinguishable between the two paths (-0.004 ms mean, within measurement noise on this hardware), while the full scan path including both signature verifications adds +0.103 ms mean over plaintext decompression alone — three orders of magnitude below any plausible NFC RF handshake time.
- **Not yet measured** (requires a real device + real tap, bundled into the Phase 5 human handoff): the genuinely end-to-end, human-experienced number — physical tap → triage rendered on screen, for the signed path. `bench/baseline.ts`'s "time-to-render" is decompress+parse only, a compute-only proxy, explicitly not a substitute for this. See NFC_PROTOCOL.md.

## 2026-08-31 — Phase 5 + mobile halves of Phase 3/6: handed off to the human

Per the task's working order ("Phase 0 → 1 → 2 → 3 → 4 → 6, then stop and hand off Phase 5 to the human"), every phase reachable without a physical Android device and physical NTAG21x tags is now complete. Three data-collection needs remain, all requiring a real phone and real hardware, and are bundled into a single handoff:

1. **Phase 5** — NFC read/write handshake latency across distance/orientation/material conditions, success/failure and retry rates, on the only hardware available (NTAG216, not NTAG215 — see NFC_PROTOCOL.md for why that's fine to report).
2. **Phase 3 mobile half** — the same 7 crypto/compression operations Node already measured (`results/crypto-latency-node.json`), re-measured via real Web Crypto on Android Chrome. The Node numbers must not be presented as field-representative; per the Phase 3 spec, "the mobile numbers are the ones the paper should lead with."
3. **Phase 6 human half** — true tap-to-triage-rendered-on-screen latency for the signed path, the number the spec says "belongs in the abstract."

Built to collect all three:
- `client/src/pages/BenchNfc.tsx`, route `/bench/nfc` — a real page in the actual client app (not a mock), type-checked (`npx tsc --noEmit`) and build-verified (`npm run build`, both clean) before being handed off. Times NFC read/write handshakes via `performance.now()`, tags each trial with distance/orientation/material metadata, records success/failure + retry count, auto-detects device model (via Chrome's User-Agent Client Hints API, with manual-entry fallback)/Android version/Chrome version, runs the mobile Web Crypto latency benchmark, and exports CSV / downloads JSON / can POST to `/api/v1/benchmarks/log`.
- `NFC_PROTOCOL.md` — full operator instructions: hardware needed, how to reach `/bench/nfc` on a phone (Web NFC requires a secure context, so plain LAN `http://` won't work — instructions cover both a Vercel deploy, using the repo's existing `client/vercel.json`, and an HTTPS tunnel as a no-deployment alternative), a practical trial-count plan (a full 45-condition x 50-trial factorial would be 2,250 taps — the protocol recommends 50 trials at a baseline condition for the primary numbers plus 15-20 per secondary condition value, rather than mandating the unrealistic full factorial), and where to hand the resulting files back (`results/nfc-trials.csv`, `results/crypto-latency-mobile.json`).
- Also asks the human to record the physical tag's per-unit cost in ₹, needed for the paper's "low-cost" claim — not something this session can look up or estimate.

**No number from any of these three measurements will be written into the paper until the corresponding file exists in `results/`.** Phase 7's results-independent correctness and structural fixes can proceed in parallel while this data is collected.

## 2026-08-31 — BenchNfc page simplified and fixed for real Vercel+Render deployment

The user is deploying the client to Vercel and the server to Render themselves (rather than using the ngrok/local-tunnel path originally suggested) and asked for the `/bench/nfc` page and instructions to be kept simple. Two changes made before handoff:

- **Bug fix**: the page's "POST all to backend" button used a made-up env var (`VITE_API_BASE_URL`) and manually appended `/api/v1/benchmarks/log`, which doesn't match this codebase's actual convention — the real env var is `VITE_API_URL` and it already includes the `/api/v1` prefix (see `client/src/services/api.ts`). Fixed by dropping the hand-rolled `fetch` entirely and reusing the existing `logBenchmarkTelemetry` helper from `api.ts`, the same function the production `NfcWriter`/`NfcScanner` components already use — this both fixes the bug and removes a second, parallel implementation of the same request.
- **Simplified per explicit request**: removed the distance/orientation/material dropdown grid (over-engineered for a single-operator, single-tag test session) in favor of one optional free-text "note" field; removed the manual "retries so far" number input in favor of an auto-tracked counter (increments on failure, resets on success). Device info, tag-cost field, CSV export, backend POST, and the mobile crypto-latency benchmark are unchanged.
- `NFC_PROTOCOL.md` rewritten to match: real Vercel/Render environment-variable configuration (`VITE_API_URL` on Vercel, `CORS_ORIGIN`/`DATABASE_URL`/`JWT_SECRET`/`AUTHORITY_PRIVATE_KEY`/`NODE_ENV` on Render, plus the one-time `prisma migrate deploy` step) in place of the original ngrok/Vercel-as-alternative framing, and the trial-count guidance simplified to "~50 read + ~50 write at normal tapping distance" instead of a multi-condition factorial plan.
- Re-verified after the rewrite: `npx tsc --noEmit` clean on the new file, `npm run build` (client) succeeds, full client test suite still 49/49 passing.

## 2026-08-31 — Third bug found from real trial data: write trials failing, read trials succeeding

The user ran real trials against the deployed Vercel+Render app and reported (`results/nfc-trials.csv`, first version): all `write` trials failed with a Web NFC `NetworkError`-class message ("IO error"), while `read` trials succeeded (using tags written by a third-party app, NFC Tools, confirming the phone's NFC hardware and the tag itself were both fine — the failure was specific to this codebase's write code path).

**Root cause, found by inspection (not directly observed — no Android device available in this session — but the fix is grounded in two concrete, confirmed defects, not a guess):**

1. **Dangling scan session** — `runReadTrial` (in `BenchNfc.tsx`, matching a pattern also present in the production `NfcScanner.tsx`) only called `controller.abort()` on the successful "reading" event and on the 10s timeout. The `ndef.addEventListener("error", ...)` path and the inner catch block around signature verification did **not** abort the controller. An un-aborted `ndef.scan()` leaves Android's NFC reader-mode registration active in the background indefinitely. Since `BenchNfc.tsx` runs read and write trials back-to-back on one page without unmounting, a read trial that errored out (rather than cleanly succeeding or timing out) would leave a stuck scan session that could then conflict with a subsequent `ndef.write()` call's own reader-mode registration — a very plausible mechanism for exactly the symptom reported (writes failing, reads working). Fixed by routing every exit path (success, error event, scan-start rejection, and the inner verification-exception path) through a single `finish()` helper that always aborts first. Applied the same fix to `NfcScanner.tsx`'s `error` listener for production correctness, not just the bench tool.
2. **No retry on write** — Web NFC's `write()` on Android is documented (in this codebase's own pre-existing error-message mapping in `NfcWriter.tsx`: `error.name === 'NetworkError'` → "NFC connection lost/IO Error...") to throw a transient IO-error-class exception more often than `read()`, because a write transceives far more bytes and is correspondingly more sensitive to the tag moving mid-operation. Neither `BenchNfc.tsx` nor the production `NfcWriter.tsx` retried on this — a single transient failure meant the whole trial/write failed. Added `withRetries`/`writeWithRetries` (3 attempts, 400ms apart, within the same physical tap) to both.

**Also fixed while in this code** (found during the same pass, not reported by the user):
- `BenchNfc.tsx` used one shared `retryCount` state variable across both read and write trials, so a trial's `retryCount` in the CSV reflected failures of *either* type, not failures of that specific operation — confusing/wrong for analysis. Split into separate `readRetryCount`/`writeRetryCount`.
- Error messages recorded in the CSV were only ever the vague on-screen paraphrase; added a real `errorMessage` column (full `error.name: error.message`) and an `attemptsUsed` column, so if a failure recurs the exact Chrome/Android error text is captured in the data itself instead of requiring the operator to transcribe what they saw on screen.

**Verification**: `npx tsc --noEmit` clean on all three changed files (the 3 pre-existing `NfcScanner.tsx` errors present are unrelated to this change — confirmed via `git diff` scope), `npm run build` succeeds, full client test suite still 49/49 passing. **No physical-device re-test was possible in this session** (no Android hardware available here) — this fix is code-level reasoning from the two confirmed defects above, not a confirmed-fixed result. The user needs to redeploy and re-run write trials to confirm.

**The original (broken) `results/nfc-trials.csv` and `results/crypto-latency-mobile.json` the user collected are preserved as-is** — the crypto-latency file is unaffected by this bug (pure Web Crypto timing, no NFC read/write involved) and remains valid data; the trials CSV's read rows are valid, its write rows (all failures) should be re-collected after redeploying this fix.

## 2026-08-31 — Phase 5 + mobile halves of Phase 3/6: real device data collected

- Ran: user-operated `/bench/nfc` page on a real Android phone (device model `CPH2487`, Android 10, Chrome 151.0.0.0) against the deployed Vercel+Render app, tapping a real NTAG216 tag. Data appended to `results/nfc-trials.csv` across two sessions (pre-fix and post-fix, both retained for transparency) and `results/crypto-latency-mobile.json` collected once (100 measured + 20 warmup iterations per operation, real Web Crypto).
- Processed via `npx tsx bench/process-nfc-trials.ts` → [results/nfc-trials-summary.json](results/nfc-trials-summary.json).
- **Read**: 20/20 trials succeeded (100% success rate, N=20, all post-fix). Handshake (tap → payload available): mean 1338 ms, median 934 ms, p95 2979 ms. Tap-to-rendered-on-screen (handshake + full Tier 1 + Tier 2 verification + DOM commit — the number Phase 6 asked to belong in the abstract): mean 1368 ms, median 967 ms, p95 3000 ms. The verification overhead itself is negligible against this (compare `results/crypto-latency-mobile.json`'s sub-millisecond per-operation means) — essentially all of this time is the physical RF handshake, not cryptographic compute.
- **Write**: of 20 total trials, 5 are pre-fix (all failed, before the dangling-scan-session + no-retry bugs were fixed — see the two entries above) and 15 are post-fix. **Post-fix write success rate: 13/15 (86.7%)**, not 100% — two trials failed with a different, new error (`AbortError: The push operation is cancelled.`) after exhausting all 3 internal retry attempts. Successful post-fix write handshake times: mean 4294 ms, median 2199 ms, min 1711 ms, max 13218 ms (n=13) — write is both markedly slower and less reliable than read, consistent with a longer RF transceive window being more exposed to interruption. The `AbortError` class was not seen before and was not something the earlier fix targeted; it is reported here rather than investigated further, since reproducing/debugging it requires the physical device this session doesn't have. **This is the honest number to put in the paper's NFC Reliability section — not the "everything is working now" framing** the write success rate alone doesn't fully support; the fix measurably and substantially improved write reliability (0% → 86.7%) without reaching 100%, and that gap is itself a legitimate, reportable finding.
- No further code changes made in response to the `AbortError` failures — two data points are not enough to diagnose a distinct root cause, and this data is being handed to Phase 7's paper write-up as-is rather than chased further without hardware access.

## 2026-08-31 — Codebase rebrand: LifeTag → AegisTag

Per explicit request, replaced "LifeTag"/"lifetag" with "AegisTag"/"aegistag" across the entire tracked codebase (content and file names), resolving a pre-existing mismatch where the paper's title already said "AegisTag" while the product/repo was named "LifeTag". Full details, including the one deliberately-preserved exception (a legacy IndexedDB/localStorage migration key that must stay literal to avoid orphaning any already-existing user's stored key), are in the session transcript; summary:

- Renamed 3 files (`docs/LifeTag_Team_Work_Division.md`, `docs/lifetag_paper_draft.tex`, `docs/lifetag_test_plan.md`) via `git mv`.
- Text-replaced across ~40 files (docs, README, config, client/server source, tests) — verified afterward with a repo-wide case-insensitive grep that the only remaining occurrences are the intentionally-preserved legacy key/DB-name literals in `client/src/services/nfcCryptoService.ts`, each with an explanatory comment.
- Added an IndexedDB migration path (`getLegacyIndexedDbKeyPair()`) so a user with an existing key under the old `LifeTagCryptoDB` database name gets it transparently migrated to the renamed `AegisTagCryptoDB` on next load, instead of silently losing access to their signing key.
- Updated `package.json` "name" fields (root, client, server) and regenerated all three lockfiles (`npm install --package-lock-only`) so they match.
- Recreated the local dev Postgres container and database under the new name (`aegistag-postgres`, `aegistag_test`), reusing the existing Docker volume so no data was lost; pushed the Prisma schema to the renamed test database.
- Full regression check after the rename: server `npm test` 178/178 passing (15 files — test count grew since Phase 0 as the user's own parallel work added `doctor.integration.spec.ts` and `firstResponder.integration.spec.ts`, unrelated to this session), client `npx vitest run` 49/49 passing, client `npm run build` clean.

## 2026-08-31 — Phase 7: Paper revision complete

`docs/aegistag_paper_draft.tex` rewritten end-to-end and compiled with a locally-installed MiKTeX/pdflatex toolchain (not estimated) to a final **6-page** PDF (`docs/aegistag_paper_draft.pdf`), zero LaTeX warnings, zero undefined references, two passes to settle cross-references. Full change-by-change accounting is in [REVISION_NOTES.md](REVISION_NOTES.md); summary of what was verified before writing:

- INDICON 2026's double-blind review policy confirmed directly from the official guidelines page (`ieeeindicon.org/guidelines-and-policies/`) before anonymizing the paper.
- 14 new references (17 total) each verified against a real, independently-locatable source (IEEE Xplore/ACM DL listings, publisher pages, or an author's institutional repository) via web search and fetch before being added to the bibliography; one datasheet reference's exact revision number could not be confirmed (site blocked automated fetching) and was cited without guessing one.
- The key-generation contradiction between the old draft's §IV-A and §V-A was resolved by tracing the actual code path (`AdminPanel.tsx` → `NfcWriter.tsx` → `NfcCryptoService.getOrCreateKeyPair()`), not by arbitrarily picking a side.
- Two new figures (architecture block diagram via TikZ, payload-byte-allocation chart generated directly from `results/encoding.json`) plus the earlier sensitivity plot; four tables generated programmatically from `results/*.json` by `bench/generate-tables.ts` and `\input` into the paper, so no number in a table was hand-typed.
- Every number in the rewritten Abstract and Results section traces to a file in `results/`; three specific claims were consciously **not** made because the data doesn't support them — see REVISION_NOTES.md's final section (no cross-condition NFC reliability claim, no tag-cost figure, and 86.7% write reliability reported honestly rather than the "everything is working" framing).

## 2026-10-31 — INDICON 2026 review (Accept w/ Minor Revision): security fixes + tamper suite v3

The reviewers asked for analysis of replay of stale records, revocation, cloning, authority-key compromise and unauthorized issuance, and for mitigation of the shared admin password, staff-device key custody and localStorage tokens. Auditing the code against those questions found defects the paper's claims depended on. These were fixed **before** any paper text changes:

- **Consent-gate bypass.** `POST /scans` verified that *some* certified tag was attached but never checked that it belonged to `patientAccount`, so any certified tag unlocked any patient's history. In addition, `checkRecentScan` matched the client-supplied `deviceMeta` string with `contains: '[Authority-Certified]'`. Fixed: the tag's signed `fhirPatientId` must equal `patientAccount`, and certification is now a server-computed `ScanAuditLog.certified` column (migration `20261031120000_tag_issuance_and_scan_certification`).
- **Certified-scan path unreachable.** No client code called `logScan`, and its helper omitted the required `tagPayload`. `TagTracer` now reports every verified scan when a DOCTOR/FR is online.
- **Freshness unsigned.** v2 signed only `triageData`, so the 48 h check on the unsigned timestamp could be bypassed and also rejected every genuine tag older than 48 h. **Tag format v3** signs `[version, fhirPatientId, issuedAt, canonicalTriage]`. The authority certificate signs `[fhirPatientId, issuedAt, x, y]`, binding the key to one patient and one issuance. The server keeps `tagIssuedAt`/`tagRevokedAt` per patient, and `NfcService.classifyFreshness` labels a tag current, superseded, revoked or unregistered. Re-issuance supersedes older tags, and a patient can revoke a lost tag (`POST /issuance/revoke`).
- **Tier 2 broken in the real issuance flow.** The server stored `sign(userId)` while clients verified over the JWK string, and client and server embedded *different* authority public keys. Fixed: `POST /issuance/certify` (DOCTOR only, issuer recorded) signs the cert string. The server derives its trust anchor from its own private key, the client reads `VITE_AUTHORITY_PUBLIC_KEYS` (see `server/scripts/print-authority-public-key.ts`), and both accept a key list for rotation.
- **Unauthorized issuance / key custody.** The client-side `"00000"` admin password was replaced by DOCTOR-role issuance. The patient key was stored under one fixed IndexedDB id, so all patients issued from one browser shared one key. Every issuance now uses a fresh non-extractable key that is discarded after signing.
- **Session tokens.** The refresh token moved to an HttpOnly, SameSite=Strict cookie scoped to `/api/v1/auth`. The access token is held in memory only, and the obfuscated localStorage tokens are removed on load.
- **Offline rendering missing.** No screen rendered triage data from the tag, because `EmergencyInfo` always fetched from the server. `NfcInfo` now verifies on-device and renders the signed profile with issuance age. ID-only tags no longer get a fabricated `O-Negative` blood group.
- Canonicalization (`canonicalTriage`) closes the bug class behind the empty-allergy defect for blood-group short codes and extra contact fields. A shared test vector pins client and server to identical signing bytes.

**Tamper suite re-run** (`npm run bench:tamper`, `results/tamper.json`; the v2 results were overwritten, and the previous file is recoverable from git). The metric is now *accepted ⇔ trustedAuthority ∧ freshness = current*, the exact condition for a certified scan. There are 13 classes × N=200 = **2,600 trials**: the 7 original classes plus issuedAt edit, patient-ID relabel, certificate graft, superseded-tag replay and revoked-tag replay. Every attack class was 0/200 accepted, and the control was 200/200 accepted (0 false rejects). The superseded and revoked classes are 200/200 `trustedAuthority=true`, which is direct evidence that signature validity alone does not establish freshness. Public-key corruption had 1/200 `verified=true`: a base64url edit to padding bits decodes to the same key, but Tier 2 still fails because the certificate signs the exact coordinate string. `paper/tables/tamper.tex` was regenerated; the other tables are byte-identical, since v3 does not change on-tag size.

Verification: server `tsc` clean, server unit 82/82; client `tsc` clean (including 5 pre-existing errors fixed), client 52/52. **Integration/security suites (Postgres) were not run locally**, because no database or Docker daemon was available; they were updated to use real v3 tags instead of mocked verification and need a CI run.

## 2026-10-31 — Web NFC tool rebuilt + NFC Lab trial suite + camera-ready paper

**Why in-app NFC failed before (found by code inspection, reproduced against a scripted fake `NDEFReader`):**
- **No guard against overlapping operations.** Nothing stopped a second `write()` while one was pending. Chrome cancels the earlier one with `AbortError: The push operation is cancelled`, exactly the two post-fix write failures in `results/nfc-trials.csv`.
- **Wrong error event.** Unreadable tags fire `readingerror`; every listener subscribed to `"error"`, which never fires. A blank or non-NDEF tag therefore hung the scanner forever (production) or until timeout (bench).
- **No timeout or cancel on writes.** The scanner also silently simulated a fake tag on HTTP or with NFC switched off.
- **Wrong capacity check.** The writer compared compressed bytes to 504, but writes base64 text, about 33% larger.
- **Latency includes hand movement.** "Handshake" timings started at the button press, so they include moving the tag to the phone. The paper now says so.

**New:**
- `client/src/lib/webNfc.ts` is the single entry point for Web NFC. It provides a one-operation lock, timeouts, `readingerror` handling, retries only on transient `NetworkError`, a screen wake lock, and error diagnosis with next-step hints. It also adds erase and `makeReadOnly`.
- `client/src/lib/tagCodec.ts` adds the **V3 binary encoding, now the production default**, plus decoders for V1, legacy, JSON and ID-only tags, exact on-tag byte accounting, and byte-for-byte read-back comparison. It reproduces the paper's 274 B (V3) and 572 B (V1) Medium-profile figures, pinned by tests.
- `NfcWriter` now works as prepare & certify → write (separate gesture) → verify by read-back, with format and tag-model selection and an overwrite guard (off by default).
- `NfcScanner` reads every format, never simulates, and stays stable across parent re-renders.
- **NFC Lab** (`/bench/nfc`) offers:
  - an environment check and an on-device self-test;
  - seven trial types: read, write-blank, overwrite, write + read-back, protect-check, erase, tamper-read;
  - randomized seeded full-factorial plans over distance, orientation, medium, placement, format and payload;
  - per-condition Wilson CIs, CSV/JSON export, a tampered-tag setup helper, and a scan-path compute benchmark covering V1 vs V3, verification-only time and timer resolution.
- Supporting files: `bench/process-nfc-lab.ts` (`npm run bench:nfc-lab`) produces `results/nfc-lab-summary.json`; `bench/generate-tables.ts` writes `nfc-lab.tex` and `nfc-lab-factors.tex` once that file exists. `NFC_PROTOCOL.md` was rewritten with a ~540-trial plan.
- **Scan policy** (`decideScanOutcome`): every verified, patient-bound scan is logged, and only current + authority-certified scans are certified. Revoked, superseded and certified-but-unregistered tags (a possible authority-key compromise) return an alert to the clinician.

**Paper (`docs/aegistag_paper_draft.tex`):** revised for all seven review points. It compiles with MiKTeX to 6 pages with no warnings or undefined references; the compiled PDF is `docs/aegistag_paper_draft.pdf`.
- Corrected latency claims, now with the timer-resolution caveat.
- V3 described as deployed.
- New threat table and platform-reach (iOS) section.
- Tamper results at 2,600 trials.
- Figures regenerated at column width; Table II cut to 5 columns; tables shrink only when wider than a column; file paths removed from captions.
- Fig. 1 updated; repository footnote added.

The lab tables are included automatically through `\IfFileExists` once trials exist. A response letter is in `docs/response_to_reviewers.md`. **Physical multi-condition trials have not been run yet; they need the phone and tags.** The author block is a placeholder.

**Verification:** client 119/119 tests, `tsc` clean, `vite build` OK, lint clean on new code; server unit 88/88, `tsc` clean. Integration/security suites (Postgres) still need a CI run.

## 2026-11-04 — Security and UI hardening pass

The audit found these defects; all are fixed, with regression tests:

- **Anyone could self-register as a DOCTOR / FIRST_RESPONDER** and immediately certify tags, log scans and read records. This contradicted the paper's "unauthorized issuance" row. Clinician accounts now start `verified=false`. `requireVerifiedClinician`, a per-request database check, guards certification, scan logging, triage and medical routes. The operator verifies accounts with `server/scripts/verify-clinician.ts`. Changing a licence number or agency ID resets verification.
- **Token confusion.** Access and refresh JWTs shared a secret with no type claim, so a 7-day refresh token worked as a bearer access token, even after logout. Fixes:
  - tokens now carry `typ` and a random `jti`, and HS256 is pinned;
  - the `jti` also removes a same-second duplicate-token collision on the unique column.
- **Refresh tokens were stored in plaintext and never rotated.** Fixes:
  - tokens are now stored as SHA-256 hashes;
  - each one is rotated on use;
  - a 30 s grace window covers concurrent tabs;
  - replay after the window revokes every session (`rotatedAt`).
- **Mass assignment.** `PUT /doctors/me` and `/first-responders/me` passed the raw body to Prisma (password hash, licence, verified). Fixes:
  - whitelist schemas for both updates;
  - `validate()` now **replaces** `req.body` with the parsed value. Its own test had documented that unknown keys used to reach controllers.
- **Production error handler masked all messages,** including "Invalid User ID or password". Now only 5xx errors are masked.
- **No `trust proxy`,** so behind Render every client shared one rate-limit bucket. Fixed with `TRUST_PROXY`, which defaults to 1 in production.
- **Telemetry endpoints.** Unauthenticated `POST /benchmarks/log` accepted arbitrary rows, and `GET` returned every row to anyone. POST is now validated, rate-limited and off in production by default; GET requires authentication.
- **Smaller fixes:**
  - `JWT_SECRET` must be ≥ 32 characters in production;
  - JSON body limit of 50 kb;
  - `/auth/check` is rate-limited;
  - login runs a real cost-12 dummy bcrypt for unknown IDs (timing equalization);
  - stronger signup rules (`(US|DR|FR)\d{5}`, password ≥ 8 with a letter and a digit);
  - account deletion revokes sessions and clears the cookie;
  - `primaryPhysician` must be a verified doctor.
- **Transparency.** Online triage lookups are now audited (`ScanAuditLog.accessType`), and patients can see every scan and lookup in `GET /patients/me/access-log` and the "Who has accessed my record" panel.
- **Client:**
  - removed dead `seedData.ts` (mock passwords);
  - `redirectTo` is restricted to internal paths;
  - signup rules mirror the server;
  - verification banner (live status);
  - render-time `navigate()` replaced with `<Navigate>`;
  - "Authority Certified" badges removed from server-sourced pages (MedicalInfo, AccountInfo);
  - "encrypted tags" copy corrected (tags are signed);
  - `vercel.json` now sets CSP, frame-ancestors, `Permissions-Policy: nfc=(self)`, nosniff and Referrer-Policy.
- **Dependencies.** `npm audit fix` (non-breaking): server 6→3 advisories, client 7→3, critical 0. The remaining `zod` advisory needs a major upgrade; it is mitigated by the body limit and `.max()` caps. `qs` is no longer used for request parsing. The react-router open redirect is covered by `safeInternalPath`.

Migration `20261104090000_clinician_verification_and_access_audit` clears existing refresh tokens (users sign in again). Existing clinician accounts start unverified, so verify them with the script.

**Verification:** server unit 101/101, `tsc` clean; client 139/139, `tsc` clean, `vite build` OK. Integration and security suites were updated, including new regressions for self-registration, token confusion, mass assignment, rotation, lookup auditing and verification. They still need a Postgres CI run. Paper threat-table wording is updated; the paper is still 6 pages.

## 2026-11-04 — Camera-ready strengthening + fresh-deploy migration squash

**Paper** (still 6 pages, no warnings or undefined references; about half a column on page 6 is left for the NFC Lab tables):
- **§II-F + Table I:** positioning against deployed signed health credentials, SMART Health Cards (ES256 JWS over DEFLATE FHIR bundle, JWKS, `rid` revocation lists) and the EU DCC (COSE/CWT, Implementing Decision (EU) 2021/1073). The facts were verified against spec.smarthealth.cards and the HCERT spec before citing. The table compares AegisTag with ID-only NFC, signed QR credentials and medical ID across seven properties.
- **§V-D proposition with proof sketch:** under EUF-CMA of ECDSA P-256 and authority-key secrecy, the only tag accepted as certified and current is a copy of the genuine current tag. This reduces the residual risk to the acknowledged cloning case.
- **Tamper results read statistically:** 0/2,400 attack trials puts the 95% upper bound on per-trial acceptance below 0.13% (rule of three).
- **Data protection paragraph:** minimisation, the patient-visible access log, the DPDP Act 2023, and ABHA/ABDM linkage as future work, since the FHIR mapping already exists.
- **Formatting:** references renumbered in first-citation order (20, all cited); Fig. 1 widened to column width.
- **Response letter:** table numbers updated and an "additional improvements" section added.

**Reproducibility:**
- `docs/REPRODUCE.md` maps each paper artefact to its data file and command.
- `bench/tamper.ts` now exits non-zero if any attack is accepted or a control is rejected.
- New CI job `paper-benchmarks` re-runs the 2,600 trials and regenerates the tables on every push. Client lint and the coverage gate were confirmed passing locally.

**Fresh deploy:** the user deploys on a new database, so the three migrations were squashed into one `20261104000000_init`, generated with `prisma migrate diff --from-empty`, covering all 8 tables. The deployment docs now say: `prisma migrate deploy` on the empty DB, then optionally `prisma db seed`.
