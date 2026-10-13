import { describe, expect, it } from 'vitest';
import { visiblePoints, windowStart } from '../src/ui/chartRange';

const series = (n: number): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [i * 10, i]);

describe('chart range', () => {
  it('All returns the whole series', () => {
    const data = series(20);
    expect(visiblePoints(data, 'all')).toBe(data);
    expect(windowStart('all', 0, 200)).toBe(0);
  });

  it('percent windows scale with the length of the history', () => {
    expect(windowStart('p10', 0, 1000)).toBe(900);
    expect(windowStart('p50', 0, 1_000_000)).toBe(500_000);
    const pts = visiblePoints(series(100), 'p10');
    // 10% of 1000 plays = 100 plays = 10 steps (+1 anchor point before the window).
    expect(pts[pts.length - 1][0]).toBe(1000);
    expect(pts.length).toBe(12);
    expect(pts[0][0]).toBe(890);
  });

  it('never narrows below two sample steps, and survives tiny series', () => {
    expect(windowStart('p10', 0, 100, 40)).toBe(60);
    expect(windowStart('p25', 0, 10, 40)).toBe(0);
    expect(visiblePoints([[0, 0], [5, 1]], 'p10').length).toBe(2);
    expect(visiblePoints([[0, 0]], 'p10').length).toBe(1);
    expect(visiblePoints([], 'p10')).toEqual([]);
  });
});
