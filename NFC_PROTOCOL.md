# NFC_PROTOCOL.md — Physical Trial Protocol (NFC Lab, lab v2)

Physical NFC reliability is the one measurement that needs a real Android phone and real tags. The NFC Lab page (`/bench/nfc`, `client/src/pages/BenchNfc.tsx`) runs every trial through the same Web NFC and codec code the production Tag Writer and scanner use (`client/src/lib/webNfc.ts`, `client/src/lib/tagCodec.ts`), records the full condition of every trial, and exports a CSV that `bench/process-nfc-lab.ts` turns into the paper's tables.

This replaces the earlier single-condition protocol (20 reads / 15 writes at 1 cm), which the INDICON 2026 reviewers asked to extend across devices, orientations, distances and environments.

## What changed since the first trial round (why writes failed before)

| Symptom in the first round | Cause | Fix |
|---|---|---|
| `AbortError: The push operation is cancelled` | A second write started while one was pending (second button press or a retry). Chrome cancels the earlier write. | One NFC operation per page (`webNfc.ts` lock); buttons disabled while an operation runs. |
| Scanner hangs on some tags | Unreadable tags fire `readingerror`; the old code listened for `"error"`, which Web NFC never fires. | `readingerror` handled; every operation has a timeout and is always aborted on exit. |
| Writes needed third-party apps | Writes waited forever with no timeout or cancel. Unsupported browsers silently ran a simulation. The size check measured the wrong thing. | 20 s timeouts, cancel, real error messages with next steps, no simulation, exact on-tag byte check. |
| Long write times | The write started only after a network round trip to the backend. | Writer is now *Prepare & certify* (network) → *Write* (separate button press, NFC only). |
| "Handshake" times include hand movement | The timer started at the button press. | Each trial records its **placement**: `tap` (approach after start, what a responder experiences) or `resting` (tag in place before start, closest to stack + RF latency). |

## Setup

**Backend (Render):** as before (`DATABASE_URL`, `JWT_SECRET`, `AUTHORITY_PRIVATE_KEY`, `CORS_ORIGIN`, `NODE_ENV=production`). On the fresh database, create the schema once with `npx prisma migrate deploy` from `server/` (and `npx prisma db seed` for demo accounts).

**Frontend (Vercel):** `VITE_API_URL` as before, plus `VITE_AUTHORITY_PUBLIC_KEYS`. Generate it with `cd server && npx ts-node scripts/print-authority-public-key.ts`, then redeploy. The Lab itself works without a backend (lab tags carry a lab-only certificate), but the production writer needs one.

**Phone:**
- Chrome on Android, opened at the `https://` URL. iOS and desktop browsers have no Web NFC.
- NFC switched on in Android settings.
- Close NFC Tools and similar apps, which grab tags before Chrome can.
- On the first tap, allow the NFC permission prompt.
- Keep the screen on. The Lab requests a wake lock, but if the screen locks, Chrome cancels the operation.

**Tags:** label each physical tag (Tag A, Tag B, …) and pick its model in *Session*. Record the unit cost (₹) once.

## Before any trials: section 1

Open `/bench/nfc` and check the Environment table. Every line should be green. Then press **Run self-test (no tag)**: it encodes, decodes and verifies every payload profile in both formats on the phone itself. It must say *Self-test passed*.

## Trial types

| Type | Needs | Pass means |
|---|---|---|
| Read + verify | a tag written by the Lab | read, decoded, signature valid |
| Write (blank tag only) | a blank or erased tag | write with `overwrite:false` succeeded |
| Write + read-back verify | any writable tag | written, then read back byte-identical |
| Overwrite + read-back | a tag that already holds data | old data replaced, read back byte-identical |
| Overwrite protection (must refuse) | a tag that already holds data | write with `overwrite:false` was **refused** as not-empty |
| Erase | any writable tag | erased, then read back blank |
| Tampered tag (must reject) | a tag from *Setup: write tampered tag* | the app **rejected** it (a blank tag does not count) |

For write + read-back trials, keep the tag in place after the write. If nothing happens, lift the tag and tap again.

## Recommended plan (about 540 trials, roughly 2 hours)

Use section 4 (*Planned run*): tick the levels, tick the trial types, set repetitions, and press **Generate plan**. The order is randomized. Follow the *Next* instructions and press **Run step** for each one. Export after every phase, since the data is kept only on the phone until you do.

| Phase | Vary | Trial types | Reps | Trials | Answers |
|---|---|---|---|---|---|
| A. Core reliability | format: V3, V1 | Read; Write + read-back | 50 | 200 | sample size; V1 vs V3 write reliability (V3 writes ~2× fewer bytes) |
| B. Distance | 0, 1, 2, 3, 4 cm | Read; Write + read-back | 10 | 100 | distance |
| C. Orientation | 0°, 45°, 90° | Read; Write + read-back | 10 | 60 | orientation |
| D. Medium | bare, wristband, phone case, metal, skin | Read; Write + read-back | 10 | 100 | environment |
| E. Placement | tap, resting | Read | 20 | 40 | separates hand movement from system latency |
| F. Safety functions | — | Overwrite, Overwrite protection, Erase, Tampered tag | 10 | 40 | overwrite semantics and tamper detection on real hardware |
| G. Second device/tag (if available) | — | Phase A at 20 reps | 20 | 80 | device and tag variation |

Keep unvaried factors at the defaults (1 cm, coplanar, bare, tap, V3, medium). Measure distance with a ruler or a stack of cards. "On metal" means the tag lies on a metal surface with the phone above it.

Then press **Run benchmark (no tag)** in section 6 once per device and download `crypto-latency-mobile.json`.

## Handing the data back

1. **Export CSV** after each phase. The file is `nfc-lab-<session>.csv`, and exporting repeatedly is safe because duplicates are removed by trial id.
2. Put every CSV in `results/` as `results/nfc-lab-*.csv`, and the benchmark file as `results/crypto-latency-mobile.json`.
3. Run `npm run bench:nfc-lab` then `npm run bench:tables`. This writes `results/nfc-lab-summary.json`, `paper/tables/nfc-lab.tex` and `paper/tables/nfc-lab-factors.tex`.

## Honesty rules (unchanged)

Report every trial, including failures and timeouts. Never re-run to keep only good attempts; the randomized plan exists so that bad luck cannot be quietly dropped. Skipped plan steps stay absent rather than being filled in. The Wilson intervals in the tables show how much a pass rate really says: 20/20 is only "≥84% at 95% confidence".
