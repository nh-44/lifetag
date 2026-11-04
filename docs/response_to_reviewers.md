# Response to Reviewers — Paper 4846 (IEEE INDICON 2026)

**AegisTag: Decentralized, Offline-Resilient Emergency Medical Information System using Web NFC and Zero-Trust Verification**

We thank both reviewers for their careful reading. The two reports raise the same seven points, so each one is answered once below. Section numbers refer to the revised manuscript.

---

### 1. Performance inconsistency (< 1 ms vs. 2.09 ms)

The reviewers are right: the abstract and §VI-D overstated this. We now separate the two quantities:

- **Verification only:** Tier 1 + Tier 2 take 0.25 + 0.26 = **0.51 ms** on the phone.
- **Complete legacy (V1) scan path,** including gzip decompression: **2.09 ms** (p95 2.70 ms), about 1/650 of the 1.37 s tap-to-render time.

The deployed V3 encoding has no decompression step. We also state that Chrome limits the page timer to 0.1 ms here, so sub-millisecond means are resolution-limited. The "+0.1 ms" cost-of-trust figure is now labelled as the server-class reference. (Abstract, §VI-D, §VI-G, Table IV caption.)

### 2. Deployment status of V3

V3 is now **implemented and the default encoding** of the Tag Writer: a binary NDEF record with TNF Unknown. The reader accepts V3, legacy V1, and ID-only tags. The client implementation reproduces the benchmark's byte counts exactly (274 B on tag for the Medium profile), and this is checked by an automated test. (§IV-B, §VI-B, Table III, Fig. 2.)

### 3. Physical NFC testing beyond 20 reads / 15 writes, and the 86.7% write rate

We investigated the write failures. Both observed failures were `AbortError: The push operation is cancelled`, which Chrome raises when a second write starts while one is pending. We also found that unreadable tags were never reported, because the code listened for the wrong event. Both causes are fixed:

- one pending NFC operation at a time;
- timeouts on every operation;
- `readingerror` handling;
- retries only on transient I/O errors;
- the write starts in its own user gesture after certification.

To measure reliability across conditions, the client now includes an NFC trial suite that runs every trial through the production code. It generates randomized full-factorial plans over:

- distance (0–4 cm);
- orientation (0–90°);
- medium (bare, wristband, phone case, metal, skin);
- placement (approach vs. resting, which separates hand movement from system latency);
- encoding (V1, V3);
- payload size.

It covers read, write, overwrite, overwrite-protection, erase and tampered-tag trials with read-back verification, and reports Wilson intervals. The initial trials are now reported with their 95% interval (13/15, 62–96%) and the note that timings include hand movement. (§IV-D, §VI-E, Table V.) **[FILL IN after running the NFC Lab plan: summary of multi-condition results, reported in the two NFC Lab tables (by operation and by condition). Delete this sentence if the trials are not run.]**

### 4. Realistic operational threats

We added a threat analysis (§V-D, Table II). It covers tag cloning, replay of stale but valid records, revocation, authority-key compromise and unauthorized issuance. Several mechanisms are new in this revision:

- **Freshness.** The issue time and patient ID are now signed. The authority certificate binds the tag key to the patient and the issuance. Re-issuing supersedes all older tags, and a patient can revoke a lost tag. Online, the server classifies every scanned tag as current, superseded, revoked or unregistered, and only a current, certified tag opens the consent window (§V-B).
- **Evaluation.** The tamper suite grew from 1,600 trials in 7 classes to 2,600 trials in 12 classes, adding issuedAt edit, patient-ID relabel, certificate graft, superseded-tag replay and revoked-tag replay. No attack trial was accepted and no control was rejected. Superseded and revoked tags carry *valid* signatures and are rejected only by the freshness check. This directly confirms the reviewer's remark that signature validity alone does not establish freshness (§VI-F, Table VI).
- **Cloning and offline revocation** are honestly listed as not preventable with static tags. We bound their impact and name future countermeasures (§VII).

### 5/6. Shared admin password, key custody, localStorage tokens

All three are fixed in the implementation, not only discussed:

- **Admin password removed.** Certificates are issued only through an authenticated doctor account that the Healthcare Authority has verified (self-registered clinician accounts get no clinical access until verified), and each issuance records the issuing clinician.
- **Key custody.** Each tag uses a fresh, non-extractable key that is discarded after signing, so no long-lived private key remains on staff devices.
- **Session tokens.** Refresh tokens are in an HTTP-only, SameSite=Strict cookie, and access tokens are kept in memory only.

(§IV-A, §V-A, §V-C.)

### 6. iOS Safari / Web NFC

§V-E now states that Web NFC exists only in Chromium on Android. It notes that iOS Core NFC can read the standard NDEF record in a native app that reuses the same verification. It also says plainly that such a reader has not been built or evaluated, and that iOS users currently depend on ID-only online lookup.

### 7. Figure/table legibility and reproducibility

- **Figures 2–3** were regenerated at column width with legible fonts; the legend no longer covers the NTAG215 label.
- **Table III** was reduced to five columns so it fits at normal size.
- **Wide tables** now scale only when needed, so no column is clipped.
- **File paths** were removed from captions, where IEEEtran's small caps made them illegible.
- **Fig. 1** now reflects the clinician-gated issuance.
- **Repository:** all benchmark scripts, raw data and table/figure generators are at https://github.com/nh-44/lifetag (footnote in §VI-A).

---

### Additional improvements beyond the requested points

- **Positioning against deployed signed health credentials.** A new §II-F and **Table I** compare AegisTag with SMART Health Cards and the EU Digital COVID Certificate, and with identifier-only NFC systems and medical ID jewelry. The differences are stated explicitly: passive-tag memory limits, supersession without distributed revocation lists, and consent-gated access to the full record.
- **Security argument.** §V-D adds a proposition with a proof sketch. Under EUF-CMA security of ECDSA P-256 and secrecy of the authority key, the only tag the server can accept as certified and current is a copy of the genuine current tag. This reduces the residual risk to the cloning case we already discuss as a limitation. The tamper results are also read statistically: 0/2,400 attack trials bounds per-trial acceptance below 0.13% at 95% confidence.
- **Data protection.** §VI-H relates the design to data minimisation, the patient-visible access log, and India's DPDP Act 2023. Linking issuance to ABHA under ABDM is listed as future work.
- **Reproducibility.** `docs/REPRODUCE.md` maps every table and figure to its data file and command. CI re-runs the 2,600-trial tamper suite on every push and fails if any attack is accepted.

