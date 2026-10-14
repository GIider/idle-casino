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

/** The last N samples of the series for the range. */
export function visiblePoints(data: [number, number][], range: Range): [number, number][] {
  const n = RANGES.find((r) => r.id === range)?.samples ?? Infinity;
  if (!Number.isFinite(n) || data.length <= n) return data;
  return data.slice(-n);
}
