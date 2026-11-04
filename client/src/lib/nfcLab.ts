/**
 * Pure logic for the NFC Lab (/bench/nfc): experimental factors, randomized
 * trial plans, per-condition statistics, and CSV export. No Web NFC here, so it
 * is fully unit-tested; the page only wires these to real taps.
 */
import type { TagFormat, TagModel } from "@/lib/tagCodec";

export const LAB_VERSION = 2;

// ---------------------------------------------------------------------------
// Factors and conditions
// ---------------------------------------------------------------------------

export const FACTORS = {
  distanceCm: { label: "Distance", levels: ["0", "1", "2", "3", "4"] },
  orientation: { label: "Orientation", levels: ["0° coplanar", "45°", "90° edge-on"] },
  medium: { label: "Medium", levels: ["bare", "fabric wristband", "phone case", "on metal", "on wrist (skin)"] },
  placement: { label: "Placement", levels: ["tap (approach after start)", "resting (tag in place before start)"] },
  format: { label: "Format", levels: ["v3-binary", "v1-text"] },
  profile: { label: "Payload", levels: ["small", "medium", "large"] },
} as const;

export type FactorKey = keyof typeof FACTORS;
export type Condition = { [K in FactorKey]: string };

export const DEFAULT_CONDITION: Condition = {
  distanceCm: "1",
  orientation: "0° coplanar",
  medium: "bare",
  placement: "tap (approach after start)",
  format: "v3-binary",
  profile: "medium",
};

export type TrialType = "read" | "write-blank" | "overwrite" | "read-after-write" | "protect-check" | "erase" | "tamper-read";

export const TRIAL_TYPES: Record<TrialType, { label: string; expected: "accept" | "reject"; needs: string }> = {
  "read": { label: "Read + verify", expected: "accept", needs: "a tag written by this app" },
  "write-blank": { label: "Write (blank tag only)", expected: "accept", needs: "a blank or erased tag" },
  "overwrite": { label: "Overwrite + read-back", expected: "accept", needs: "a tag that already holds data" },
  "read-after-write": { label: "Write + read-back verify", expected: "accept", needs: "any writable tag" },
  "protect-check": { label: "Overwrite protection (must refuse)", expected: "reject", needs: "a tag that already holds data" },
  "erase": { label: "Erase", expected: "accept", needs: "any writable tag" },
  "tamper-read": { label: "Tampered tag (must reject)", expected: "reject", needs: "a tag whose data was edited by another app" },
};

/** Representative payloads (same clinical content as bench/encoding-variants.ts, real 5-digit ID). */
export const PROFILES: Record<string, { name: string; bloodGroup: string; allergies: string[]; emergencyContacts: Array<{ userId: string; name: string }>; dnrStatus: boolean }> = {
  small: { name: "Jane Doe", bloodGroup: "A-Positive", allergies: [], emergencyContacts: [{ userId: "US1", name: "Bob" }], dnrStatus: false },
  medium: {
    name: "John Doe", bloodGroup: "O-Negative", allergies: ["Penicillin", "Peanuts", "Bee Stings"],
    emergencyContacts: [{ userId: "US98234", name: "Jane Doe" }, { userId: "US54321", name: "Bob Smith" }], dnrStatus: true,
  },
  large: {
    name: "Jonathan Bartholomew Doe III", bloodGroup: "AB-Negative",
    allergies: ["Penicillin", "Peanuts", "Bee Stings", "Latex", "Aspirin", "Sulfa Drugs", "Ibuprofen", "Shellfish", "Dairy", "Gluten"],
    emergencyContacts: [
      { userId: "US98234", name: "Jane Doe" }, { userId: "US54321", name: "Bob Smith" }, { userId: "US11111", name: "Alice Jones" },
      { userId: "US22222", name: "Charlie Brown" }, { userId: "US33333", name: "Eve White" },
    ],
    dnrStatus: true,
  },
};
export const LAB_PATIENT_ID = "90099";

// ---------------------------------------------------------------------------
// Trials
// ---------------------------------------------------------------------------

export interface LabTrial extends Condition {
  labVersion: number;
  id: string;
  sessionId: string;
  planStep: number | null;
  trialType: TrialType;
  expected: "accept" | "reject";
  /** The NFC operation itself completed (write resolved / tag read and decoded). */
  opSucceeded: boolean;
  /** The trial's outcome matched `expected` (for reject trials: the system refused correctly). */
  outcomeMatched: boolean;
  errorCode: string;
  errorRaw: string;
  attemptsUsed: number | null;
  /** Operation start (button press) to NFC completion. Includes hand movement in "tap" placement. */
  nfcMs: number | null;
  /** Decode + signature verification after the tag was read. */
  decodeVerifyMs: number | null;
  /** Read-back after a write: tag detected again and compared. */
  readBackMs: number | null;
  readBackMatched: boolean | null;
  tagBytes: number | null;
  detectedFormat: string;
  serialNumber: string;
  tagModel: TagModel | string;
  tagLabel: string;
  deviceModel: string;
  androidVersion: string;
  chromeVersion: string;
  note: string;
  timestamp: string;
}

export interface PlanStep {
  index: number;
  trialType: TrialType;
  condition: Condition;
  rep: number;
}

/** Deterministic PRNG so a plan can be regenerated exactly from its seed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Full-factorial plan over the varied factors x trial types, `reps` repetitions
 * per cell, in randomized order (so drift, fatigue, or tag wear is not
 * confounded with any one condition). Unvaried factors take `base`.
 */
export function buildPlan(
  varied: Partial<Record<FactorKey, string[]>>,
  base: Condition,
  trialTypes: TrialType[],
  reps: number,
  seed: number
): PlanStep[] {
  let cells: Condition[] = [{ ...base }];
  for (const key of Object.keys(varied) as FactorKey[]) {
    const levels = varied[key];
    if (!levels || levels.length === 0) continue;
    cells = cells.flatMap((c) => levels.map((level) => ({ ...c, [key]: level })));
  }
  const steps: Omit<PlanStep, "index">[] = [];
  for (const condition of cells)
    for (const trialType of trialTypes)
      for (let rep = 1; rep <= reps; rep++) steps.push({ trialType, condition, rep });

  const rand = mulberry32(seed);
  for (let i = steps.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [steps[i], steps[j]] = [steps[j], steps[i]];
  }
  return steps.map((s, index) => ({ ...s, index }));
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/** Wilson score interval: well-behaved at 0% / 100% and small n, unlike the normal approximation. */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export interface SummaryRow {
  key: Record<string, string>;
  n: number;
  matched: number;
  rate: number;
  ci95: [number, number];
  medianNfcMs: number | null;
  p95NfcMs: number | null;
  meanAttempts: number | null;
  topError: string;
}

export function summarize(trials: LabTrial[], groupBy: Array<keyof LabTrial>): SummaryRow[] {
  const groups = new Map<string, LabTrial[]>();
  for (const t of trials) {
    const k = JSON.stringify(groupBy.map((g) => String(t[g])));
    groups.set(k, [...(groups.get(k) || []), t]);
  }
  return [...groups.entries()].map(([k, ts]) => {
    const keyVals: string[] = JSON.parse(k);
    const matched = ts.filter((t) => t.outcomeMatched).length;
    const times = ts.filter((t) => t.opSucceeded && t.nfcMs != null).map((t) => t.nfcMs!);
    const attempts = ts.filter((t) => t.attemptsUsed != null).map((t) => t.attemptsUsed!);
    const errors = ts.filter((t) => !t.outcomeMatched && t.errorCode).map((t) => t.errorCode);
    const topError = [...new Set(errors)].sort((a, b) => errors.filter((e) => e === b).length - errors.filter((e) => e === a).length)[0] || "";
    return {
      key: Object.fromEntries(groupBy.map((g, i) => [g, keyVals[i]])),
      n: ts.length,
      matched,
      rate: matched / ts.length,
      ci95: wilson(matched, ts.length),
      medianNfcMs: quantile(times, 0.5),
      p95NfcMs: quantile(times, 0.95),
      meanAttempts: attempts.length ? attempts.reduce((a, b) => a + b, 0) / attempts.length : null,
      topError,
    };
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const CSV_COLUMNS: Array<keyof LabTrial> = [
  "labVersion", "sessionId", "id", "planStep", "trialType", "expected", "opSucceeded", "outcomeMatched",
  "distanceCm", "orientation", "medium", "placement", "format", "profile",
  "tagModel", "tagLabel", "serialNumber", "tagBytes", "detectedFormat",
  "attemptsUsed", "nfcMs", "decodeVerifyMs", "readBackMs", "readBackMatched",
  "errorCode", "errorRaw", "deviceModel", "androidVersion", "chromeVersion", "note", "timestamp",
];

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(trials: LabTrial[]): string {
  return [CSV_COLUMNS.join(","), ...trials.map((t) => CSV_COLUMNS.map((c) => csvCell(t[c])).join(","))].join("\n");
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export const LAB_FORMATS: TagFormat[] = ["v3-binary", "v1-text"];
