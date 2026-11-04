import { describe, it, expect } from 'vitest';
import { buildPlan, wilson, quantile, summarize, toCsv, parseCsv, DEFAULT_CONDITION, LabTrial, LAB_VERSION } from '@/lib/nfcLab';

const trial = (over: Partial<LabTrial>): LabTrial => ({
  ...DEFAULT_CONDITION, labVersion: LAB_VERSION, id: Math.random().toString(36), sessionId: 's', planStep: null,
  trialType: 'read', expected: 'accept', opSucceeded: true, outcomeMatched: true, errorCode: '', errorRaw: '',
  attemptsUsed: 1, nfcMs: 1000, decodeVerifyMs: 1, readBackMs: null, readBackMatched: null, tagBytes: 274,
  detectedFormat: 'v3-binary', serialNumber: '04:01', tagModel: 'NTAG216', tagLabel: 'A', deviceModel: 'X',
  androidVersion: '14', chromeVersion: '130', note: '', timestamp: '2026-10-31T00:00:00Z', ...over,
});

describe('buildPlan', () => {
  it('is full-factorial over varied factors x trial types x reps', () => {
    const plan = buildPlan({ distanceCm: ['0', '2', '4'], orientation: ['0° coplanar', '90° edge-on'] }, DEFAULT_CONDITION, ['read', 'write-blank'], 5, 1);
    expect(plan).toHaveLength(3 * 2 * 2 * 5);
    const cells = new Set(plan.map((s) => `${s.condition.distanceCm}|${s.condition.orientation}|${s.trialType}`));
    expect(cells.size).toBe(12);
    expect(plan.every((s) => s.condition.medium === DEFAULT_CONDITION.medium)).toBe(true);
  });

  it('is randomized but reproducible from its seed', () => {
    const a = buildPlan({ distanceCm: ['0', '1', '2', '3'] }, DEFAULT_CONDITION, ['read'], 5, 42);
    const b = buildPlan({ distanceCm: ['0', '1', '2', '3'] }, DEFAULT_CONDITION, ['read'], 5, 42);
    const c = buildPlan({ distanceCm: ['0', '1', '2', '3'] }, DEFAULT_CONDITION, ['read'], 5, 43);
    expect(a.map((s) => s.condition.distanceCm)).toEqual(b.map((s) => s.condition.distanceCm));
    expect(a.map((s) => s.condition.distanceCm)).not.toEqual(c.map((s) => s.condition.distanceCm));
    // not left in generation order
    expect(a.slice(0, 5).every((s) => s.condition.distanceCm === '0')).toBe(false);
  });
});

describe('statistics', () => {
  it('wilson interval matches known values and never exceeds [0, 1]', () => {
    const [lo, hi] = wilson(13, 15);
    expect(lo).toBeCloseTo(0.621, 2);
    expect(hi).toBeCloseTo(0.963, 2);
    expect(wilson(20, 20)[1]).toBe(1);
    expect(wilson(0, 20)[0]).toBe(0);
    expect(wilson(20, 20)[0]).toBeCloseTo(0.839, 2); // 20/20 does NOT mean "100% reliable"
  });

  it('quantile interpolates', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
  });

  it('summarize groups by condition and reports rate, CI, timing and the dominant error', () => {
    const trials = [
      trial({ distanceCm: '1' }), trial({ distanceCm: '1', nfcMs: 3000 }),
      trial({ distanceCm: '4', opSucceeded: false, outcomeMatched: false, errorCode: 'timeout', nfcMs: null }),
      trial({ distanceCm: '4', opSucceeded: false, outcomeMatched: false, errorCode: 'timeout', nfcMs: null }),
      trial({ distanceCm: '4', opSucceeded: false, outcomeMatched: false, errorCode: 'io', nfcMs: null }),
    ];
    const rows = summarize(trials, ['trialType', 'distanceCm']);
    const near = rows.find((r) => r.key.distanceCm === '1')!;
    const far = rows.find((r) => r.key.distanceCm === '4')!;
    expect(near).toMatchObject({ n: 2, matched: 2, rate: 1, medianNfcMs: 2000 });
    expect(far).toMatchObject({ n: 3, matched: 0, topError: 'timeout', medianNfcMs: null });
  });

  it('a correctly refused protect-check counts as a match', () => {
    const rows = summarize([trial({ trialType: 'protect-check', expected: 'reject', opSucceeded: false, outcomeMatched: true, errorCode: 'not-empty' })], ['trialType']);
    expect(rows[0].rate).toBe(1);
  });
});

describe('CSV', () => {
  it('round-trips values containing commas, quotes and newlines', () => {
    const t = trial({ errorRaw: 'AbortError: "push", cancelled\nagain', note: 'a,b' });
    const [row] = parseCsv(toCsv([t]));
    expect(row.errorRaw).toBe(t.errorRaw);
    expect(row.note).toBe('a,b');
    expect(row.distanceCm).toBe('1');
  });
});
