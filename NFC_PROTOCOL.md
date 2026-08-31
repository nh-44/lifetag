# NFC_PROTOCOL.md — Physical Trial Protocol (Phase 5 + mobile halves of Phase 3 & 6)

This is the one remaining piece of data collection that cannot be automated — it requires a real Android phone, a real Chrome browser, and real NTAG21x tags. Everything else in the benchmark suite (Phases 0, 1, 2, 3-Node, 4, 6-Node) is already done; see `RESULTS_LOG.md` for what ran and `results/*.json` for the output. This document tells you exactly what to do to produce the three files that are still missing:

- `results/nfc-trials.csv` (read/write handshake latency across conditions — Phase 5)
- `results/crypto-latency-mobile.json` (Web Crypto latency on a real phone — Phase 3 mobile half)
- The tap-to-rendered-on-screen number for the signed path (captured as `tapToRenderMs` inside `nfc-trials.csv`'s read rows — Phase 6 human half)

**Do not write any NFC or mobile-crypto numbers into the paper until these files exist.** Nothing here has been fabricated or estimated — the page that produces this data is real, working code (`client/src/pages/BenchNfc.tsx`, route `/bench/nfc`), already type-checked and build-verified, but it needs you and a phone to actually run.

## Hardware you'll need

- An Android phone with Chrome (recent version — Web NFC requires Chrome for Android, no iOS support exists).
- NTAG216 tags/wristbands (the hardware you have on hand — **not** NTAG215; see the note below on why this matters).
- A stable place to hold the phone at fixed distances from the tag (a ruler or printed distance guide helps).

**Fill this in and keep it with your results** — Phase 5 also asks for the tag's unit cost, relevant to the paper's "low-cost" claim, and I don't have this number:

> Tag/wristband product: ______________________
> Unit cost: ₹ ______________________
> Quantity purchased / bulk vs. single-unit pricing: ______________________

## Why NTAG216, and why that's fine to say in the paper

The system's analytical byte budget throughout this benchmark suite (Phases 1, 2, 6) targets the **504-byte NTAG215** budget — that's the conservative, harder-to-hit target, and it's what the paper's headline encoding-comparison result (`results/encoding.json`) is measured against. Since NTAG215 tags aren't available for physical trials, the handshake-latency numbers you'll collect here come from **NTAG216** (888 B capacity) hardware instead. This is fine and should be stated plainly in the paper (Phase 7's correctness fixes already call for this): the byte-budget analysis targets NTAG215 as the conservative case, while the physical read/write timing was measured on the NTAG216 hardware actually available. NTAG213/215/216 share the same RF interface and Type 2 Tag protocol, so handshake latency (which is dominated by RF field establishment and protocol handshaking, not by how many bytes are transferred at these payload sizes) should not differ meaningfully by memory size — but don't claim that in the paper as measured fact, only report what NTAG216 measured.

## Step 1 — Get `/bench/nfc` onto your phone

Web NFC requires a "secure context" (HTTPS, or `localhost` on the same device) — a plain `http://192.168.x.x:5173` LAN address from `npm run dev` will **not** work; Chrome blocks the NFC permission outright on insecure origins. Pick one:

**Option A — Deploy to Vercel (recommended, the repo is already configured for it via `client/vercel.json`):**
```bash
cd client
npx vercel deploy --prod
```
Follow the prompts (link to your Vercel account if not already linked). You'll get a real `https://...vercel.app` URL — open `https://<your-deployment>.vercel.app/bench/nfc` in Chrome on your phone.

**Option B — Local dev server + HTTPS tunnel (no deployment needed):**
```bash
cd client
npm run dev          # starts Vite on localhost:5173
```
In a second terminal:
```bash
npx ngrok http 5173  # or any similar tunnel tool you already have
```
Open the `https://....ngrok-free.app/bench/nfc` URL it prints, on your phone's Chrome.

Either way, once the page loads on your phone, it should show "Web NFC is not available" only if something's wrong (wrong browser, insecure origin, or NFC turned off in the phone's system settings — check that first).

## Step 2 — Confirm device info

The page auto-detects Chrome version and Android version from the user agent, and attempts to read the device model via Chrome's User-Agent Client Hints API. If any field shows "unknown (enter manually)", type it in — check Settings → About Phone on the device for the exact model name and Android version.

## Step 3 — Prepare test tags

- For **read trials**: use a tag already written by the app's real "Tag Writer" (Admin Panel) or Tag Tracer flow, or write one first using the "Run WRITE trial" button itself (it writes a real, validly-signed test payload — self-signed, no authority certification needed for handshake timing purposes).
- For **write trials**: use a blank or rewritable NTAG216 tag.

## Step 4 — Recommended trial plan

A full factorial of every distance × orientation × material combination (5 × 3 × 3 = 45 conditions) at 50 trials each would be **2,250 taps** — not realistic in one sitting. Instead:

1. **Primary numbers (do this first, most important):** 50 READ trials and 50 WRITE trials at the baseline condition — **1 cm, coplanar, bare tag** (no case, no fabric). This gives you the headline handshake-latency numbers and, from the read trials, the tap-to-rendered-on-screen number Phase 6 needs for the abstract.
2. **Distance sensitivity (secondary):** 15-20 READ trials at each of the other distances (0.5cm, 2cm, 3cm, 4cm), orientation and material held at coplanar/bare. This is the more operationally interesting factor (how close does a first responder need to get the phone).
3. **Orientation and material sensitivity (secondary, lower priority):** 15-20 READ trials at each of the other orientation values (45°, perpendicular) and material values (phone case, fabric), distance held at 1cm.

If you have time for more, more is better — the page has no built-in cap — but the above gives every cell in the paper's table a real N without requiring an unreasonable number of physical taps. Record the actual N you achieve per condition; don't round it to the target.

For each trial:
1. Set the Distance / Orientation / Material dropdowns to match what you're about to do.
2. Tap "Run READ trial" or "Run WRITE trial", then present the tag at the phone per the condition you selected.
3. If the tap fails or needs more than one attempt, increment "Retries so far" before the *next* attempt at that same condition, and let the page record the failure — do not discard failed attempts, they're part of the success-rate number.
4. The page persists everything to the phone's local storage as you go, so a page reload won't lose data — but export the CSV periodically anyway as a backup (see below).

## Step 5 — Run the mobile crypto-latency benchmark

Scroll to "Mobile crypto/compression latency" and tap "Run crypto latency benchmark" once. It runs 100 measured iterations (+20 discarded warmup) of the same 7 operations as the desktop `bench/crypto-latency.ts` script, using the real Web Crypto API on your phone. Takes a few seconds. Download the result.

## Step 6 — Export and hand back

1. Tap "Export CSV" → save as `nfc-trials.csv`.
2. Tap "Download crypto-latency-mobile.json".
3. Copy both files into this repo at `results/nfc-trials.csv` and `results/crypto-latency-mobile.json` (overwriting the placeholders if any exist).
4. Optionally tap "POST all to /api/v1/benchmarks/log" if your backend is reachable from the phone and you want the raw handshake timings also logged server-side (condition metadata is packed into the `deviceMeta` field, since `BenchmarkLog` doesn't have dedicated columns for it — see AUDIT.md item 2 on why this endpoint is unauthenticated, so only do this against a database you control).
5. Let me know the files are in place (and fill in the tag cost above) — I'll pick up Phase 6's remaining write-up and Phase 7's results-dependent paper sections from there.

## What NOT to do

- Don't extrapolate a missing condition's numbers from the ones you did collect — leave that cell blank/TODO in the paper rather than estimating it.
- Don't edit the exported CSV to "clean up" outliers or failed trials — report them as measured; the paper's NFC Reliability section is exactly the place a slow tap or two belongs.
