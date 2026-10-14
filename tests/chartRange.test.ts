import { describe, expect, it } from 'vitest';
import { visiblePoints } from '../src/ui/chartRange';

const series = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => [i * 10, i]);

describe('chart range', () => {
  it('All returns the whole series', () => {
    const data = series(200);
    expect(visiblePoints(data, 'all')).toBe(data);
  });

  it('time windows keep only the last N samples', () => {
    const pts = visiblePoints(series(200), 'm3');
    expect(pts.length).toBe(36);
    expect(pts[pts.length - 1]).toEqual([1990, 199]);
    expect(visiblePoints(series(200), 'm10').length).toBe(120);
  });

  it('survives short and empty series', () => {
    expect(visiblePoints(series(5), 'm3').length).toBe(5);
    expect(visiblePoints([], 'm3')).toEqual([]);
  });

  it('starts at the last leading zero instead of showing zeros in the past', () => {
    const data: [number, number][] = [[0, 0], [10, 0], [20, 0], [30, 5], [40, 0], [50, 7]];
    expect(visiblePoints(data, 'all')).toEqual([[20, 0], [30, 5], [40, 0], [50, 7]]);
    expect(visiblePoints(data, 'm3')).toEqual([[20, 0], [30, 5], [40, 0], [50, 7]]);
  });

  it('leaves an all-zero series alone', () => {
    const data: [number, number][] = [[0, 0], [10, 0]];
    expect(visiblePoints(data, 'all').length).toBeGreaterThan(0);
  });
});
