export interface LatencyStats {
  n: number;
  meanMs: number;
  medianMs: number;
  stdDevMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
}

export function computeStats(samplesMs: number[]): LatencyStats {
  const n = samplesMs.length;
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const mean = samplesMs.reduce((a, b) => a + b, 0) / n;
  const variance = samplesMs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
  const p95Index = Math.min(n - 1, Math.ceil(0.95 * n) - 1);

  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    n,
    meanMs: round(mean),
    medianMs: round(median),
    stdDevMs: round(stdDev),
    minMs: round(sorted[0]),
    maxMs: round(sorted[n - 1]),
    p95Ms: round(sorted[p95Index]),
  };
}

/** Runs fn() `warmup + measured` times via performance.now(), discards the first `warmup` timings. */
export function timeOperation(fn: () => void, warmup: number, measured: number): number[] {
  const { performance } = require('perf_hooks');
  const samples: number[] = [];
  for (let i = 0; i < warmup + measured; i++) {
    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    if (i >= warmup) samples.push(t1 - t0);
  }
  return samples;
}
