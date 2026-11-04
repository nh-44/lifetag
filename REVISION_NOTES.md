# REVISION_NOTES.md — Phase 7 Paper Revision

Every change made to `docs/aegistag_paper_draft.tex` (previously `docs/lifetag_paper_draft.tex`) between the original TODO-filled draft and this final version, organized by the Phase 7 task list. The compiled PDF is `docs/aegistag_paper_draft.pdf`, 6 pages, verified by local `pdflatex` compilation (MiKTeX) — see the last entry in `RESULTS_LOG.md`.

## Correctness fixes

- **NTAG216 capacity**: the draft's "NTAG215/216 (504 bytes user memory)" claim (Abstract, §I-C, §IV-B, §VI-A of the old draft) conflated the two chips' capacities. NTAG215 = 504 B is correct; NTAG216 = 888 B. The revised paper (§VI-E) states the byte-budget analysis targets the conservative 504 B NTAG215 figure, and that physical trials were run on NTAG216 because that was the hardware available — both facts stated separately and correctly, never conflated.
- **Kyber-768 deleted entirely**: removed the old §V-D subsection, its Limitations bullet, and its Future Work bullet. Benchmarking a construct that itself admits it performs no real lattice cryptography (see `AUDIT.md` §7) would have produced numbers with no security meaning; keeping them in a "final" paper would have been actively misleading rather than merely incomplete. The underlying code (`server/src/utils/crypto.utils.ts`'s Kyber simulation functions, `server/src/utils/benchmark.ts`'s Kyber timing) was left in place — it's still a legitimate, clearly-labeled placeholder construct in the codebase — only the paper's presentation of it as evaluated/benchmarked material was removed.
- **Golden hour vs. platinum ten minutes**: the old Introduction conflated "the first ten minutes" with "the golden hour." §I-A now states both terms correctly and separately (golden hour = first hour; platinum ten minutes = the first ten minutes specifically).
- **Requirement III-A-3 (Authenticity)** rewritten exactly per the task's specified replacement text ("Responders must be able to verify that the triage content was signed by a key certified by the Healthcare Authority at issuance, and has not been altered since"), plus the required Limitations addition (§VII-A, first bullet): the chain certifies a key, not clinical accuracy or issuing-clinician identity; binding authorship to an identified clinician is Future Work.
- **Key-generation contradiction resolved by checking the code**, not by picking one side to keep. Traced the actual flow: `AdminPanel.tsx` renders `NfcWriter`, which itself calls `NfcCryptoService.getOrCreateKeyPair()`/`generateTagPayload()` — the key pair is generated via Web Crypto/IndexedDB in whatever browser session has the Admin Panel open, which in the evaluated prototype is a staff-operated Tag Writer session, not necessarily a device the patient personally holds. §IV-A and §V-A now describe this consistently ("generated locally in the browser session used for tag issuance"), and a new Limitations bullet (§VII-A) states the resulting key-custody caveat explicitly, since this is a real architectural property worth surfacing, not just a wording fix.
- **All cross-references converted to `\label`/`\ref` pairs.** The old draft's manual references ("Section V-C" for the consent gate, "Section VIII" for hardening, "Section VI" for methodology, "Section VII with measured results") were all wrong under the old numbering and would have been wrong again under the new one; every section/table/figure now carries a `\label` and every in-text reference uses `\ref`, so renumbering (which happened repeatedly during the 12→8 section merge) never desyncs them.
- **Role-enforcement wording clarified** (§IV-C) per Phase 0's finding: replaced language that could read as "the client asserts its role" with an explicit description of the server-side lookup-and-JWT-embed flow, citing that authorization decisions read the role from the verified token, never a client-supplied field.

## Structural changes (12 sections → 8, six-page limit)

- Comparative Evaluation folded into Results and Discussion (§VI-H).
- Limitations and Future Work merged into one section (§VII).
- Experimental Methodology compressed into a short subsection at the head of Results (§VI-A), replacing what was previously its own full section.
- The NTAG213 compact-mode paragraph was cut from the Architecture section (§IV-B now only references it briefly, pointing to Future Work) rather than describing it in the architecture narrative.
- Implementation (previously its own section) folded into Architecture as §IV-E, since it was short (~10 lines) and describes the same system.
- Final structure: Introduction, Related Work, Requirements & Threat Model, Architecture & Implementation, Security Design, Results and Discussion, Limitations and Future Work, Conclusion — 8 sections.
- Verified ≤6 pages by actually compiling with `pdflatex` (MiKTeX, installed for this task) — not estimated. Final: exactly 6 pages, zero LaTeX warnings, zero undefined references, two compile passes to settle cross-references. Trimmed prose in Related Work, Comparative Evaluation, Discussion, and Limitations, and reduced figure width (0.95→0.85 linewidth) and table font size to fit; no results or claims were cut to make room, only wording tightened.

## Anonymization (INDICON 2026 double-blind, confirmed via the official guidelines page)

- Removed the author block; replaced with `Anonymous Author(s)` and a paper-ID placeholder, per INDICON's stated requirement that submissions not identify authors or affiliations "either explicitly or by implication (e.g., through the references or acknowledgments)."
- Removed the Acknowledgment section entirely (it named the institution).
- Removed every occurrence of the institution name (it appeared only in the author block and Acknowledgment, both now gone).
- Confirmed INDICON 2026 double-blind policy directly from `https://ieeeindicon.org/guidelines-and-policies/` before making these changes, rather than assuming.

## References: 3 → 17, all verified before inclusion

Every new reference was checked against a real, independently-locatable source (IEEE Xplore, ACM DL, publisher page, or an author's own institutional repository) before being added — none were added from memory or inference. Search/verification trail is in the session transcript; summary:

- 4 NFC-healthcare deployment papers (ward-round ID, cloud health cards, hospital medication safety, ED simulation, mHealth tracking) supporting Related Work §II-A's identifier-only-system claim.
- 1 USB-based portable health record paper supporting §II-B.
- 2 NFC/NDEF security papers (NDEF Signature Record Type vulnerabilities; off-line NFC tag authentication) plus 1 ECC-on-constrained-devices paper (Gura et al., CHES 2004) for §II-C.
- 1 NXP NTAG21x datasheet, added specifically to ground the new "Chip-Level Attestation vs. Content Authorship" subsection (§II-D) distinguishing factory silicon attestation from AegisTag's content-authorship signing — a distinction the task flagged as missing and likely to be raised by a hardware-literate reviewer.
- 3 access-control/break-glass papers (RBAC-in-HIS survey, break-glass model, healthcare-IoT break-glass) for §II-E.
- The original 3 references (W3C Web NFC, NFC Forum Connection Handover, Johnson/Menezes/Vanstone ECDSA) were kept, and one more NFC Forum spec (NDEF Technical Specification itself) was added since it's directly the format this paper's byte-accounting work depends on.
- 8 of the 17 are cited inline across Related Work (the task's minimum); in practice all are cited somewhere in Related Work.
- One citation's exact datasheet revision/date could not be confirmed (NXP's site blocks automated fetching; the URL and document's existence are corroborated by three independent secondary sources) — cited without a specific revision letter rather than guessing one.

## Abstract rewrite

Replaced "we outline a reproducible benchmarking methodology" (present tense, no results) with past-tense findings and real numbers: the byte-budget overrun (up to 208 B) and the compact encoding's margin (90–292 B), the real mobile tap-to-rendered latency (1.37 s mean, N=20), physical write reliability (13/15, 86.7%), the tamper-detection result (1,600 trials, 100% rejection, 0% false-reject), and the two defects found and fixed during evaluation. Every number in the abstract traces to a `results/*.json` file.

## Figures (none before this revision → 3)

1. `paper/figures/architecture.pdf` — system architecture block diagram (TikZ, `bench/architecture-diagram.tex`).
2. `paper/figures/payload_layout.pdf` — payload byte allocation, V1 vs. V3 (matplotlib, `bench/plot_payload_layout.py`, reads `results/encoding.json` directly — not hand-typed numbers).
3. `paper/figures/sensitivity.pdf` — Phase 2's sensitivity sweep plot (already produced earlier in this engagement).

## Tables (none before this revision → 4, all generated, none hand-typed)

`bench/generate-tables.ts` reads `results/encoding.json`, `results/crypto-latency-mobile.json` + `crypto-latency-node.json`, `results/tamper.json`, and `results/nfc-trials-summary.json` and writes `paper/tables/{encoding,latency,tamper,nfc}.tex`, `\input` directly into the paper. Re-running the generator after any results change keeps the paper's numbers from drifting out of sync with the data — there is no hand-copied number in any table.

## Second revision pass: NTAG216 as the uniform hardware target, page-budget trim

The user pointed out that Future Work and Limitations still described NTAG213 support as an open item, when the implementation is complete and the tested/deployed hardware is NTAG216 (888 B). Before making this change, I flagged a real tension: the paper's headline encoding-comparison finding ("V1 exceeds budget, V3 fixes it") only holds against the 504 B NTAG215 threshold — under an 888 B NTAG216 threshold, V1 already fits every profile size tested (`results/encoding.json`: Large Profile V1 = 712 B, still under 888 B), so blindly making 888 B the uniform target everywhere would have silently erased that finding. The user chose to keep 504 B as the encoding comparison's deliberate design/portability target while stating NTAG216 (888 B) as the actual deployed/evaluated hardware everywhere else — both true simultaneously, not in conflict, as long as each is labeled for what it is.

Applied:
- Removed the NTAG213 144 B "compact mode" clause from Future Work (§VII-B) and Limitations (§VII-A) entirely — no longer presented as an open/needed capability.
- §IV-A ("passive NFC wearable"), §IV-E (Implementation), and the Introduction's "Why NFC?" subsection now state NTAG216 (888 B) plainly as the hardware, not "NTAG215/216" or an incidental aside.
- §IV-B (NFC Data Layer) rewritten: the payload is now described as written onto "the deployed hardware, NTAG216 (888 B)," with the 504 B NTAG215 comparison explicitly reframed as "a deliberate portability stress test, not an unmet requirement of the implemented system."
- §VI-B's encoding-comparison paragraph opens with the same explicit framing, right where the 504 B finding is first presented, so a reader never encounters the 504 B number without the NTAG216-is-the-real-hardware context attached.
- §VI-E (Physical NFC Reliability) already had compatible framing from the prior revision pass ("our byte-budget analysis... conservatively targets the smaller 504-byte NTAG215 budget, so these timings are reported on the higher-capacity chip actually tapped") and needed no change.
- The only remaining "NTAG213" mention in the paper is inside a bibliography entry citing the NXP datasheet's actual title (which covers the NTAG213/215/216 family) — left as-is since it's the real title of a cited document, not a claim about AegisTag's own hardware.

Also trimmed roughly 1,140 net characters (`wc -c`: 32,379 → 31,238 across this session's edits) across Related Work, Discussion, Comparative Evaluation, Methodology, Cost of Trust, Tamper Detection, Physical NFC Reliability, the Adversary/Threat Model paragraph, and the Contributions list, tightening wording without cutting any claim, number, or citation. Recompiled twice to settle cross-references: final result is 6 pages, zero LaTeX warnings, zero undefined references, and page 6 now has clear whitespace margin below the references rather than sitting exactly at the page boundary as the prior revision did.

## Claims deleted or never made because they couldn't be measured

- **No claim about NFC reliability across distance, orientation, or shielding material.** Phase 5's original design called for a full factorial sweep; the actual human-collected data covers a single condition (~1 cm, coplanar, bare tag) at practical trial counts. The paper reports only that single condition (§VI-E, Table III) and lists the full-factorial sweep as Future Work (§VII-B) rather than extrapolating untested conditions.
- **No tag unit cost (₹) claim.** `NFC_PROTOCOL.md` asked the user to record this since the paper's "low-cost" framing needs a real number; it was never provided, so no cost figure — specific or qualitative — appears anywhere in the revised paper. The word "low-cost" itself does not appear in the final draft for this reason.
- **No claim that write reliability reached 100%.** The user's own description of the final test run was "everything is working," but the actual data (`results/nfc-trials-summary.json`) shows 13/15 (86.7%) post-fix, with 2 failures on a distinct, uninvestigated `AbortError`. The paper reports 86.7%, not 100%, and names the gap explicitly (§VI-E) rather than rounding it away or adopting the more favorable framing.
- **The Kyber-768 removal is itself a "claim deleted" case**, listed under Correctness above rather than repeated here.
