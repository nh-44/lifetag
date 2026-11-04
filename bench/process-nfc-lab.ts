/**
 * Processes NFC Lab exports (client /bench/nfc, labVersion 2) into the summary
 * the paper's physical-reliability section is generated from. Real trial data
 * only: no simulation, no imputation, skipped plan steps are simply absent.
 *
 *   npx tsx bench/process-nfc-lab.ts                     # merges results/nfc-lab-*.csv
 *   npx tsx bench/process-nfc-lab.ts --in a.csv b.csv --out x.json
 *
 * "pass" for every row is `outcomeMatched` (for reject-type trials such as
 * protect-check and tamper-read, the system refusing for the right reason).
 * Latency stats use only trials whose NFC operation completed.
 */
import fs from 'fs';
import path from 'path';
import { computeStats } from './lib/stats';

const FACTORS = ['format', 'profile', 'distanceCm', 'orientation', 'medium', 'placement', 'tagModel', 'deviceModel'] as const;

type Row = Record<string, string>;

export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  const r = (x: number) => Math.round(x * 10000) / 10000;
  return [r(Math.max(0, c - h)), r(Math.min(1, c + h))];
}

function summarizeGroup(rows: Row[]) {
  const passed = rows.filter((r) => r.outcomeMatched === 'true').length;
  const completed = rows.filter((r) => r.opSucceeded === 'true' && r.nfcMs !== '');
  const errors: Record<string, number> = {};
  rows.filter((r) => r.outcomeMatched !== 'true' && r.errorCode).forEach((r) => { errors[r.errorCode] = (errors[r.errorCode] || 0) + 1; });
  const attempts = rows.map((r) => Number(r.attemptsUsed)).filter((n) => n > 0);
  return {
    n: rows.length,
    passed,
    passRate: rows.length ? Math.round((passed / rows.length) * 10000) / 10000 : 0,
    ci95: wilson(passed, rows.length),
    nfcMs: completed.length ? computeStats(completed.map((r) => Number(r.nfcMs))) : null,
    decodeVerifyMs: (() => {
      const v = rows.map((r) => r.decodeVerifyMs).filter((x) => x !== '').map(Number);
      return v.length ? computeStats(v) : null;
    })(),
    meanAttempts: attempts.length ? Math.round((attempts.reduce((a, b) => a + b, 0) / attempts.length) * 1000) / 1000 : null,
    errors,
  };
}

function groupBy(rows: Row[], keys: readonly string[]) {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = JSON.stringify(keys.map((key) => r[key]));
    m.set(k, [...(m.get(k) || []), r]);
  }
  return [...m.entries()].map(([k, rs]) => ({ key: Object.fromEntries(keys.map((key, i) => [key, JSON.parse(k)[i]])), ...summarizeGroup(rs) }));
}

export function processLab(rows: Row[]) {
  const lab = rows.filter((r) => r.labVersion === '2');
  const trialTypes = [...new Set(lab.map((r) => r.trialType))];
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      totalTrials: lab.length,
      sessions: [...new Set(lab.map((r) => r.sessionId))],
      devices: [...new Set(lab.map((r) => `${r.deviceModel} / Android ${r.androidVersion} / Chrome ${r.chromeVersion}`))],
      tags: [...new Set(lab.map((r) => `${r.tagLabel} (${r.tagModel})`))],
      passDefinition: 'outcomeMatched: accept-type trials completed and verified; reject-type trials refused for the right reason',
      latencyNote: 'nfcMs runs from the operation start to NFC completion; in "tap" placement it includes moving the tag to the phone',
    },
    byTrialType: groupBy(lab, ['trialType']),
    // One factor at a time, pooled over the others, per trial type: the marginal effects.
    marginal: Object.fromEntries(trialTypes.map((t) => [
      t,
      Object.fromEntries(FACTORS.map((f) => [f, groupBy(lab.filter((r) => r.trialType === t), [f])])),
    ])),
    // Every distinct cell actually run.
    cells: groupBy(lab, ['trialType', ...FACTORS]),
  };
}

function main() {
  const args = process.argv.slice(2);
  const inIdx = args.indexOf('--in');
  const outIdx = args.indexOf('--out');
  const resultsDir = path.resolve(__dirname, '..', 'results');
  const inputs = inIdx >= 0
    ? args.slice(inIdx + 1, outIdx > inIdx ? outIdx : undefined)
    : fs.readdirSync(resultsDir).filter((f) => /^nfc-lab-.*\.csv$/.test(f)).map((f) => path.join(resultsDir, f));
  if (inputs.length === 0) {
    console.error('No NFC Lab CSVs found (expected results/nfc-lab-*.csv, exported from /bench/nfc).');
    process.exit(1);
  }
  const rows = inputs.flatMap((f) => parseCsv(fs.readFileSync(f, 'utf8')));
  // Same trial exported twice (overlapping session exports) is counted once.
  const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
  const summary = processLab(unique);
  const outPath = outIdx >= 0 ? args[outIdx + 1] : path.join(resultsDir, 'nfc-lab-summary.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  console.log(`Read ${rows.length} rows from ${inputs.length} file(s); ${unique.length} unique, ${summary.meta.totalTrials} lab-v2 trials.`);
  for (const g of summary.byTrialType) {
    console.log(`  ${g.key.trialType}: ${g.passed}/${g.n} pass (${(g.passRate * 100).toFixed(1)}%, 95% CI ${(g.ci95[0] * 100).toFixed(1)}–${(g.ci95[1] * 100).toFixed(1)}%)` +
      (g.nfcMs ? `, median ${Math.round(g.nfcMs.medianMs)} ms` : ''));
  }
  console.log(`Wrote ${outPath}`);
}

if (require.main === module) main();
