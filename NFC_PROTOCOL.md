# NFC_PROTOCOL.md — Physical Trial Protocol (Phase 5 + mobile halves of Phase 3 & 6)

This is the one remaining piece of data collection that cannot be automated — it requires a real Android phone, a real Chrome browser, and a real NTAG216 tag. Everything else in the benchmark suite (Phases 0, 1, 2, 3-Node, 4, 6-Node) is already done; see `RESULTS_LOG.md` for what ran and `results/*.json` for the output.

The page that produces this data is real, working code (`client/src/pages/BenchNfc.tsx`, route `/bench/nfc`), already type-checked and build-verified. It needs a deployed client + backend and a phone to actually run.

## Deployment configuration (Vercel client + Render backend)

**Backend (Render web service, root directory `server/`):**
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Required environment variables:
  - `DATABASE_URL` — your Postgres connection string (Render Postgres, Neon, Supabase, etc.)
  - `JWT_SECRET` — any long random string
  - `AUTHORITY_PRIVATE_KEY` — a real ECDSA P-256 JWK private key (see `server/.env.example` for the one-liner to generate one)
  - `CORS_ORIGIN` — your **exact** Vercel URL, e.g. `https://your-app.vercel.app` (no trailing slash — the server does an exact string match, not a wildcard)
  - `NODE_ENV=production`
  - `PORT` — Render sets this automatically, no action needed
- After first deploy, run the Prisma migrations against your production database once (`npx prisma migrate deploy` from `server/`, with `DATABASE_URL` pointed at production — Render's shell tab or a local terminal with the same `DATABASE_URL` both work).

**Frontend (Vercel, root directory `client/`):**
- It already has `vercel.json` configured (SPA rewrites).
- Required environment variable: `VITE_API_URL` = `https://your-backend.onrender.com/api/v1` (must include the `/api/v1` suffix — this is a build-time variable, so redeploy after setting/changing it).

Once both are deployed and `VITE_API_URL`/`CORS_ORIGIN` point at each other correctly, open `https://your-app.vercel.app/bench/nfc` in Chrome on your phone. Web NFC requires HTTPS, which Vercel gives you automatically, so no tunnel/ngrok setup is needed.

## Using the page

The page is intentionally simple — no dropdowns to fill in before every tap:

1. **Device info** auto-fills (model/Android/Chrome version) — only touch it if a field is blank or wrong.
2. **Tag unit cost (₹)** — fill this in once; the paper's "low-cost" claim needs a real number here.
3. **Run a trial**: there's one optional "note" text field (leave the default, or jot something like "1cm, flat" if you want to informally vary distance/angle across a few taps — it's just a free-text label, not required). Tap **Run READ trial** or **Run WRITE trial**, then present the tag to the phone.
   - For a **write** trial: use the blank NTAG216 tag. It writes a real, validly-signed test payload.
   - For a **read** trial: use a tag that's already been written (by a write trial, or by the app's real Tag Writer flow).
   - A failed/timed-out attempt is recorded automatically as a failure — don't discard it, just try again; the retry count tracks itself.
4. **Run the crypto latency benchmark** once — no tapping involved, takes a few seconds.

## How many taps

Aim for **around 50 read trials and 50 write trials** at whatever your normal, comfortable tapping distance/angle is (that's plenty for a mean/median/success-rate number). More is better if you have time or curiosity, but 50+50 is enough to report real values rather than a token handful. Don't feel obligated to systematically vary distance/orientation/material — that was in an earlier, more elaborate version of this plan; for a straightforward first pass, consistent normal-use taps are exactly what's needed. If you do happen to try a few taps at an unusual distance or through a phone case, jot that in the note field — free bonus data, not a requirement.

## Handing the data back

1. Tap **Export CSV** → gives you `nfc-trials.csv`.
2. Tap **Download crypto-latency-mobile.json**.
3. Put both files in this repo at `results/nfc-trials.csv` and `results/crypto-latency-mobile.json`.
4. Optionally tap **POST all to backend** to also log the raw handshake timings server-side via `/api/v1/benchmarks/log` (this endpoint has no auth — see AUDIT.md item 2 — fine for your own database, just don't do this against a shared/public deployment).
5. Tell me the tag's unit cost (₹) and that the files are in place — I'll take it from there into Phase 6's write-up and Phase 7's paper sections.

## One honesty note

Whatever numbers come out — even if a tap is slow, or a few fail — report them as-is. Don't re-run and keep only the best attempts; the paper's NFC Reliability section is exactly the place a slow tap or two belongs, and a suspiciously perfect 100% success rate would be less credible, not more.

## Why NTAG216, not NTAG215

This benchmark suite's byte-budget analysis (Phases 1, 2, 6) targets the 504-byte NTAG215 budget — the more conservative target. NTAG216 (888 B) is what's physically available, so that's what the handshake-timing numbers here will be measured on. This is fine to state plainly in the paper: analytical byte-budget target = NTAG215 (conservative), physical timing hardware = NTAG216 (what was available). NTAG213/215/216 share the same RF interface and protocol, so handshake latency shouldn't differ meaningfully by memory size at these payload sizes — but that's not something to claim as measured fact, only report what was actually measured on NTAG216.
