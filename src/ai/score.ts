// Word-level accuracy between a confirmed reference and a hypothesis (1 − word error rate, floored at 0).
// Used to show whether training actually helps, measured on the speaker's own confirmed recordings.

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function wordEdits(ref: string[], hyp: string[]): number {
  const prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= hyp.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[hyp.length];
}

export function wordAccuracy(reference: string, hypothesis: string): number {
  const r = words(reference);
  if (r.length === 0) return hypothesis.trim() ? 0 : 1;
  return Math.max(0, 1 - wordEdits(r, words(hypothesis)) / r.length);
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
