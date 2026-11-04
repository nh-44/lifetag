/**
 * Phase 7 — generates paper/tables/*.tex directly from results/*.json.
 * Every number in these tables traces to a file produced by a script in
 * bench/ or by the human /bench/nfc data collection — nothing here is
 * hand-typed into the paper. Re-run this after any results/*.json changes;
 * do not hand-edit the generated .tex files.
 */
import fs from 'fs';
import path from 'path';

const RESULTS = path.resolve(__dirname, '..', 'results');
const OUT = path.resolve(__dirname, '..', 'paper', 'tables');
fs.mkdirSync(OUT, { recursive: true });

const readJson = (name: string) => JSON.parse(fs.readFileSync(path.join(RESULTS, name), 'utf8'));

// Scale a table DOWN to the column width only if it is wider (never up), so no
// column is clipped at the page edge. Needs only graphicx.
const fitToColumn = (tex: string) =>
  tex
    .replace('\\begin{tabular}', '\\resizebox{\\ifdim\\width>\\columnwidth\\columnwidth\\else\\width\\fi}{!}{\\begin{tabular}')
    .replace('\\end{tabular}', '\\end{tabular}}');

function write(name: string, content: string) {
  fs.writeFileSync(path.join(OUT, name), fitToColumn(content.trimStart()));
  console.log(`Wrote paper/tables/${name}`);
}

// ---------------------------------------------------------------------------
// Table: Payload encoding comparison (Medium Profile, all 4 variants)
// ---------------------------------------------------------------------------
function genEncodingTable() {
  const data = readJson('encoding.json');
  const p = data.profiles['Medium Profile'];
  // Five columns so the table fits a column at full \small size (legibility was a review point).
  const row = (label: string, v: any) =>
    `${label} & ${v.encodedContentBytes} & ${v.totalTagBytes} & ${v.fitsNtag215 ? 'Yes' : 'No'} & ${v.marginVsNtag215 >= 0 ? '+' : ''}${v.marginVsNtag215} \\\\`;

  const tex = `
\\begin{table}[htbp]
\\caption{Payload Encoding Comparison, Medium Profile (measured)}
\\begin{center}
\\small
\\begin{tabular}{lrrcr}
\\toprule
\\textbf{Variant} & \\textbf{Content} & \\textbf{On tag} & \\textbf{Fits} & \\textbf{Margin} \\\\
 & (B) & (B) & 504\\,B & (B) \\\\
\\midrule
${row('V1 JSON/b64/gzip (legacy)', p.V1)}
${row('V2 JSON/b64/DEFLATE', p.V2)}
${row('V3 binary (deployed)', p.V3)}
${row('V4 binary/DEFLATE', p.V4)}
\\bottomrule
\\end{tabular}
\\label{tab:encoding}
\\end{center}
\\end{table}
`;
  write('encoding.tex', tex);
}

// ---------------------------------------------------------------------------
// Table: Cryptographic & compression latency, mobile (lead) + Node (reference)
// ---------------------------------------------------------------------------
function genLatencyTable() {
  const mobile = readJson('crypto-latency-mobile.json');
  const node = readJson('crypto-latency-node.json');

  const ops: Array<[string, string]> = [
    ['ecdsaKeyGeneration', 'ECDSA Key Generation'],
    ['signatureCreation', 'Signature Creation'],
    ['tier1Verification_contentSignature', 'Tier 1 Verification'],
    ['tier2Verification_authoritySignature', 'Tier 2 Verification'],
    ['compression_gzip', 'Gzip Compression'],
    ['decompression_gunzip', 'Gzip Decompression'],
    ['scanPathTotal_decompressPlusTier1PlusTier2', 'Scan-Path Total'],
  ];

  const row = ([key, label]: [string, string]) => {
    const m = mobile.operations[key];
    const n = node.operations[key];
    return `${label} & ${m.meanMs.toFixed(2)} & ${m.medianMs.toFixed(2)} & ${m.p95Ms.toFixed(2)} & ${n.meanMs.toFixed(3)} \\\\`;
  };

  const tex = `
\\begin{table}[htbp]
\\caption{Cryptographic \\& Compression Latency --- ${mobile.meta.deviceModel}, Android ${mobile.meta.androidVersion}, Chrome ${mobile.meta.chromeVersion} (n=${mobile.meta.measuredIterations}, 20 warm-up; mobile timer resolution 0.1\\,ms). Node: server-class reference.}
\\begin{center}
\\small
\\begin{tabular}{lrrrr}
\\toprule
 & \\multicolumn{3}{c}{\\textbf{Mobile (ms)}} & \\textbf{Node} \\\\
\\textbf{Operation} & Mean & Median & p95 & Mean (ms) \\\\
\\midrule
${ops.map(row).join('\n')}
\\bottomrule
\\end{tabular}
\\label{tab:latency}
\\end{center}
\\end{table}
`;
  write('latency.tex', tex);
}

// ---------------------------------------------------------------------------
// Table: Tamper detection results
// ---------------------------------------------------------------------------
// Shortened for table width only — full descriptive names stay in tamper.ts / results/tamper.json.
const TAMPER_SHORT_LABELS: Record<string, string> = {
  'Single-byte corruption: clinical content': 'Content corruption',
  'Single-byte corruption: public key field': 'Public key corruption',
  'Single-byte corruption: patient signature': 'Patient sig.\\ corruption',
  'Single-byte corruption: authority signature': 'Authority sig.\\ corruption',
  'Payload truncation at random offset': 'Random truncation',
  "Cross-patient graft (A's key+sig on B's content)": 'Cross-patient content graft',
  'Forged-key (attacker-generated keypair + garbage authority sig)': 'Forged key (Tier 2 attack)',
  'issuedAt edit (old tag re-dated to the current issuance)': 'issuedAt edit',
  "Patient-ID relabel (certified tag presented as another patient's)": 'Patient-ID relabel',
  "Certificate graft (A's genuine cert on B-labelled content re-signed with A's key)": 'Certificate graft',
  'Superseded-tag replay (genuine tag, newer issuance exists)': 'Superseded-tag replay$^\\dagger$',
  'Revoked-tag replay (genuine tag, patient revoked it)': 'Revoked-tag replay$^\\dagger$',
  'Valid unmodified current payload (control)': 'Valid current tag (control)',
};

function genTamperTable() {
  const data = readJson('tamper.json');
  // "Accepted" is a raw count with one meaning for every row (attacks should be 0/N,
  // the control N/N), replacing the old "Rate" column whose meaning flipped for the control.
  const row = (c: any) => {
    const shortLabel = TAMPER_SHORT_LABELS[c.className] ?? c.className;
    return `${shortLabel} & ${c.acceptedCount}/${c.n} & ${c.trustedAuthorityTrueCount}/${c.n} & ${c.anomalyCount} \\\\`;
  };

  const tex = `
\\begin{table}[htbp]
\\caption{Tamper Detection, ${data.meta.totalN} Trials (measured). A trial is accepted only if the tag is authority-certified and the patient's current issuance.}
\\begin{center}
\\small
\\begin{tabular}{lrrr}
\\toprule
\\textbf{Class} & \\textbf{Accepted} & \\textbf{Cert.\\ valid} & \\textbf{Anom.} \\\\
\\midrule
${data.classes.map(row).join('\n')}
\\bottomrule
\\multicolumn{4}{l}{\\footnotesize $^\\dagger$Signatures valid; rejected only by the freshness check.}
\\end{tabular}
\\label{tab:tamper}
\\end{center}
\\end{table}
`;
  write('tamper.tex', tex);
}

// ---------------------------------------------------------------------------
// Table: Physical NFC trial summary (human-collected)
// ---------------------------------------------------------------------------
function genNfcTable() {
  const data = readJson('nfc-trials-summary.json');
  const tex = `
\\begin{table}[htbp]
\\caption{Initial Single-Condition NFC Trials, NTAG216, ${'~1\\,cm coplanar bare tag'} (measured; times include moving the tag to the phone)}
\\begin{center}
\\small
\\begin{tabular}{lrrrr}
\\toprule
\\textbf{Operation} & \\textbf{N} & \\textbf{Success} & \\textbf{Mean (ms)} & \\textbf{Median (ms)} \\\\
\\midrule
Read (handshake) & ${data.read.n} & ${(data.read.successRate * 100).toFixed(0)}\\% & ${data.read.handshakeMs.meanMs.toFixed(0)} & ${data.read.handshakeMs.medianMs.toFixed(0)} \\\\
Read (tap-to-render) & ${data.read.n} & ${(data.read.successRate * 100).toFixed(0)}\\% & ${data.read.tapToRenderMs.meanMs.toFixed(0)} & ${data.read.tapToRenderMs.medianMs.toFixed(0)} \\\\
Write (handshake) & ${data.write.n} & ${(data.write.successRate * 100).toFixed(1)}\\% & ${data.write.handshakeMs.meanMs.toFixed(0)} & ${data.write.handshakeMs.medianMs.toFixed(0)} \\\\
\\bottomrule
\\end{tabular}
\\label{tab:nfc}
\\end{center}
\\end{table}
`;
  write('nfc.tex', tex);
}

// ---------------------------------------------------------------------------
// Tables: NFC Lab multi-condition trials (results/nfc-lab-summary.json, from bench/process-nfc-lab.ts)
// ---------------------------------------------------------------------------
const LAB_TRIAL_LABELS: Record<string, string> = {
  'read': 'Read + verify',
  'write-blank': 'Write (blank tag)',
  'overwrite': 'Overwrite + read-back',
  'read-after-write': 'Write + read-back',
  'protect-check': 'Overwrite refused$^\\ast$',
  'erase': 'Erase',
  'tamper-read': 'Tampered tag rejected$^\\ast$',
};

const ci = (g: any) => `${(g.ci95[0] * 100).toFixed(0)}--${(g.ci95[1] * 100).toFixed(0)}`;

function genNfcLabTables() {
  if (!fs.existsSync(path.join(RESULTS, 'nfc-lab-summary.json'))) {
    console.log('Skipped NFC Lab tables: results/nfc-lab-summary.json not found (run npm run bench:nfc-lab after collecting trials).');
    return;
  }
  const data = readJson('nfc-lab-summary.json');

  const typeRows = data.byTrialType.map((g: any) =>
    `${LAB_TRIAL_LABELS[g.key.trialType] ?? g.key.trialType} & ${g.passed}/${g.n} & ${ci(g)} & ${g.nfcMs ? g.nfcMs.medianMs.toFixed(0) : '--'} & ${g.meanAttempts != null ? g.meanAttempts.toFixed(2) : '--'} \\\\`
  );
  write('nfc-lab.tex', `
\\begin{table}[htbp]
\\caption{Physical NFC Trials by Operation, ${data.meta.totalTrials} Trials, ${data.meta.devices.length} Device(s), ${data.meta.tags.length} Tag(s) (measured)}
\\begin{center}
\\small
\\begin{tabular}{lrrrr}
\\toprule
\\textbf{Operation} & \\textbf{Pass} & \\textbf{95\\% CI (\\%)} & \\textbf{Median ms} & \\textbf{Attempts} \\\\
\\midrule
${typeRows.join('\n')}
\\bottomrule
\\multicolumn{5}{l}{\\footnotesize $^\\ast$Pass = the system correctly refused. Times include moving the tag in \\textquotedblleft tap\\textquotedblright\\ placement.}
\\end{tabular}
\\label{tab:nfclab}
\\end{center}
\\end{table}
`);

  // Read and write success by distance and format: the factors the reviewers asked about.
  const factorRows: string[] = [];
  for (const trialType of ['read', 'read-after-write']) {
    for (const factor of ['distanceCm', 'orientation', 'medium', 'format']) {
      const groups = data.marginal?.[trialType]?.[factor] ?? [];
      if (groups.length < 2) continue; // factor not varied in the data
      for (const g of groups) {
        const level = factor === 'distanceCm' ? `${g.key[factor]} cm` : g.key[factor];
        factorRows.push(`${LAB_TRIAL_LABELS[trialType]} & ${level} & ${g.passed}/${g.n} & ${ci(g)} \\\\`);
      }
    }
  }
  if (factorRows.length === 0) {
    console.log('Skipped nfc-lab-factors.tex: no factor was varied in the lab data.');
    return;
  }
  write('nfc-lab-factors.tex', `
\\begin{table}[htbp]
\\caption{NFC Success by Condition (each factor pooled over the others)}
\\begin{center}
\\small
\\begin{tabular}{llrr}
\\toprule
\\textbf{Operation} & \\textbf{Condition} & \\textbf{Pass} & \\textbf{95\\% CI (\\%)} \\\\
\\midrule
${factorRows.join('\n')}
\\bottomrule
\\end{tabular}
\\label{tab:nfcfactors}
\\end{center}
\\end{table}
`);
}

genEncodingTable();
genLatencyTable();
genTamperTable();
genNfcTable();
genNfcLabTables();
