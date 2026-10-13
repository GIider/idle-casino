/** Chart x-axis windows. Relative to the length of the history so they stay useful however fast the games run. */
export type Range = 'p10' | 'p25' | 'p50' | 'all';

export const RANGES: { id: Range; label: string; fraction: number }[] = [
  { id: 'p10', label: '10%', fraction: 0.1 },
  { id: 'p25', label: '25%', fraction: 0.25 },
  { id: 'p50', label: '50%', fraction: 0.5 },
  { id: 'all', label: 'All', fraction: 1 },
];

/**
 * The x where a window ending at `end` starts. The window is `range`'s share of the history from `first`,
 * but never narrower than `minSpan` (a couple of sample steps) so a compacted series can't leave it empty.
 */
export function windowStart(range: Range, first: number, end: number, minSpan = 0): number {
  const fraction = RANGES.find((r) => r.id === range)?.fraction ?? 1;
  if (fraction >= 1) return first;
  const span = Math.max((end - first) * fraction, minSpan);
  return Math.max(first, end - span);
}

/** The points inside the window, plus the one just before it so the line enters from the left edge. */
export function visiblePoints(data: [number, number][], range: Range, step = 1): [number, number][] {
  if (range === 'all' || data.length === 0) return data;
  const end = data[data.length - 1][0];
  const from = windowStart(range, data[0][0], end, step * 2);
  const out = data.filter((p) => p[0] >= from);
  const idx = data.length - out.length - 1;
  if (idx >= 0) out.unshift(data[idx]);
  return out.length >= 2 ? out : data.slice(-2);
}
