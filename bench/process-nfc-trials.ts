/**
 * Processes the human-collected results/nfc-trials.csv (Phase 5 + Phase 6
 * human half) into summary statistics, matching the mean/median/stddev/min/
 * max/p95 format used across the rest of this bench suite. Real trial data
 * only — this script performs no simulation or estimation.
 */
import fs from 'fs';
import path from 'path';
import { computeStats } from './lib/stats';

interface Row {
  trialType: 'read' | 'write';
  note: string;
  success: boolean;
  attemptsUsed: string; // empty string = collected before the write-retry fix shipped
  handshakeMs: number | null;
  tapToRenderMs: number | null;
  errorMessage: string;
}

function parseCsv(text: string): Row[] {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    // Simple CSV split respecting quoted fields (no embedded commas/quotes in this dataset).
    const fields = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^$)/g)?.map((f) => f.replace(/^"|"$/g, '')) ?? [];
    const row: any = {};
    headers.forEach((h, i) => { row[h] = fields[i] ?? ''; });
    return {
      trialType: row.trialType,
      note: row.note,
      success: row.success === 'true',
      attemptsUsed: row.attemptsUsed || '',
      handshakeMs: row.handshakeMs ? parseFloat(row.handshakeMs) : null,
      tapToRenderMs: row.tapToRenderMs ? parseFloat(row.tapToRenderMs) : null,
      errorMessage: row.errorMessage || '',
    };
  });
}

function main() {
  const csvPath = path.resolve(__dirname, '..', 'results', 'nfc-trials.csv');
  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);

  const reads = rows.filter((r) => r.trialType === 'read');
  const allWrites = rows.filter((r) => r.trialType === 'write');
  // Rows collected before the write-retry/dangling-session fix shipped (see
  // RESULTS_LOG.md) have no attemptsUsed value and are all failures by
  // construction — they measure a since-fixed bug, not current reliability.
  const writesPreFix = allWrites.filter((r) => r.attemptsUsed === '');
  const writes = allWrites.filter((r) => r.attemptsUsed !== '');

  const readSuccess = reads.filter((r) => r.success);
  const writeSuccess = writes.filter((r) => r.success);

  const readHandshakeStats = computeStats(readSuccess.map((r) => r.handshakeMs!).filter((v) => v != null));
  const readTapToRenderStats = computeStats(readSuccess.map((r) => r.tapToRenderMs!).filter((v) => v != null));
  const writeHandshakeStats = computeStats(writeSuccess.map((r) => r.handshakeMs!).filter((v) => v != null));

  const summary = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'results/nfc-trials.csv (human-collected, real Android device + real NTAG216 tag)',
      note: `${writesPreFix.length} write trial(s) collected before the write-retry/dangling-session fix shipped are excluded from the write stats below (all ${writesPreFix.length} were failures, measuring the since-fixed bug, not current reliability) but retained in the raw CSV for provenance.`,
    },
    read: {
      n: reads.length,
      successCount: readSuccess.length,
      failureCount: reads.length - readSuccess.length,
      successRate: reads.length > 0 ? readSuccess.length / reads.length : null,
      handshakeMs: readHandshakeStats,
      tapToRenderMs: readTapToRenderStats,
    },
    write: {
      n: writes.length,
      nExcludedPreFix: writesPreFix.length,
      successCount: writeSuccess.length,
      failureCount: writes.length - writeSuccess.length,
      successRate: writes.length > 0 ? writeSuccess.length / writes.length : null,
      handshakeMs: writeHandshakeStats,
      errorMessages: writes.filter((w) => !w.success).map((w) => w.errorMessage),
    },
  };

  const outPath = path.resolve(__dirname, '..', 'results', 'nfc-trials-summary.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main();
