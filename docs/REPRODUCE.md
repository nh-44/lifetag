# Reproducing the AegisTag paper (IEEE INDICON 2026, paper 4846)

Every number in the paper comes from a file in `results/`, and every table and figure is generated from those files. Nothing is typed in by hand.

## Setup

```bash
git clone https://github.com/nh-44/lifetag && cd lifetag
npm ci                        # root: benchmark tooling only (tsx)
pip install matplotlib        # figures
```

## Map: paper artefact → data → command

| Paper | Data file | Regenerate with |
|---|---|---|
| Table III (encodings), Fig. 2 | `results/encoding.json` | `npm run bench:encoding` · `python bench/plot_payload_layout.py` |
| Fig. 3 (profile sweep) | `results/sensitivity.json` | `npm run bench:sensitivity` · `python bench/plot_sensitivity.py` |
| Table IV (compute latency) | `results/crypto-latency-mobile.json`, `results/crypto-latency-node.json` | mobile: NFC Lab (`/bench/nfc`) → section 6; Node: `npm run bench:crypto-latency` |
| Cost of trust (§VI-G) | `results/baseline.json` | `npm run bench:baseline` |
| Table V (initial NFC trials) | `results/nfc-trials.csv` → `results/nfc-trials-summary.json` | `npx tsx bench/process-nfc-trials.ts` |
| NFC Lab tables (by operation / by condition; appear once collected) | `results/nfc-lab-*.csv` → `results/nfc-lab-summary.json` | `npm run bench:nfc-lab` |
| Tamper-detection table (2,600 trials) | `results/tamper.json` | `npm run bench:tamper` (exits non-zero if any attack is accepted) |
| All tables | the files above | `npm run bench:tables` → `paper/tables/*.tex` |
| Fig. 1 | `bench/architecture-diagram.tex` | `pdflatex bench/architecture-diagram.tex` |
| The paper | `docs/aegistag_paper_draft.tex` | `cd docs && pdflatex -output-directory=build aegistag_paper_draft.tex` (twice) |

Table numbers follow the compiled PDF without lab data; adding the NFC Lab tables renumbers the tamper table.

## What CI checks on every push

The workflow is `.github/workflows/build-test.yml`.

- Client: lint, type-check, build, and 142 unit/component tests with a coverage gate. These include the V3 codec reproducing the paper's 274 B / 572 B byte counts, and a shared client/server signing test vector.
- Server: unit, integration and security tests against PostgreSQL. These include the consent-gate, replay, revocation, self-registration and token-confusion regressions.
- **Paper benchmarks:** re-runs the 2,600-trial tamper suite (the build fails if any attack is accepted) and regenerates the tables, which are uploaded as an artifact.

## Physical NFC trials

These need an Android phone with Chrome, plus NTAG21x tags. Follow `NFC_PROTOCOL.md`, export CSVs from `/bench/nfc` into `results/`, then run `npm run bench:nfc-lab && npm run bench:tables`. The paper includes the lab tables automatically when they exist.
