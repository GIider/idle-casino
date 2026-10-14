/**
 * Chart x-axis windows, counted in samples. Each rate sample covers at least 5s of play, so a sample count is a
 * span of time regardless of how many plays/sec the table manages (1 with no upgrades, ~11+ maxed).
 */
export type Range = 'm3' | 'm10' | 'all';

export const RANGES: { id: Range; label: string; samples: number }[] = [
  { id: 'm3', label: '~3 min', samples: 36 },
  { id: 'm10', label: '~10 min', samples: 120 },
  { id: 'all', label: 'All', samples: Infinity },
];

/** Drops a leading run of zero samples except its last point, so the line starts at 0 rather than lying flat in the past. */
export function trimLeadingZeros(data: [number, number][]): [number, number][] {
  let i = 0;
  while (i + 1 < data.length && data[i + 1][1] === 0 && data[i][1] === 0) i++;
  return i > 0 ? data.slice(i) : data;
}

/** The last N samples of the series for the range, starting at the first real income. */
export function visiblePoints(data: [number, number][], range: Range): [number, number][] {
  const n = RANGES.find((r) => r.id === range)?.samples ?? Infinity;
  const pts = trimLeadingZeros(data);
  if (!Number.isFinite(n) || pts.length <= n) return pts;
  return trimLeadingZeros(pts.slice(-n));
}
