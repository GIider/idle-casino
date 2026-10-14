import { describe, expect, it } from 'vitest';
import { BOTS, TARGET_MINUTES, runSeeds, summarize, type RunResult } from '../../src/sim/bots';

const SEEDS = [1, 2, 3, 4, 5];
const fmt = (x: number | null) => (x === null ? ' never' : x.toFixed(1).padStart(6));

describe('balance: time to first ascension', () => {
  const results = new Map<string, RunResult[]>();
  it('runs every bot', () => {
    const lines: string[] = ['bot             reached   min  median    max  progress(log10)  unlocks(median s/r/b)'];
    for (const bot of BOTS) {
      const runs = runSeeds(bot, SEEDS, { maxMinutes: 150 });
      results.set(bot.id, runs);
      const s = summarize(bot.id, runs);
      const un = (id: 'slots' | 'roulette' | 'blackjack') => {
        const xs = runs.map((r) => r.unlockedAt[id]).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
        return xs.length ? xs[xs.length >> 1].toFixed(0) : '-';
      };
      lines.push(
        `${bot.id.padEnd(15)} ${String(s.reached).padStart(1)}/${s.runs} ${fmt(s.min)} ${fmt(s.median)} ${fmt(s.max)}  ${s.medianProgress.toFixed(2).padStart(8)}   ${un('slots')}/${un('roulette')}/${un('blackjack')}`,
      );
    }
    console.log(lines.join('\n'));
  }, 600000);

  it('greedy and optimal-ish bots ascend within an hour', () => {
    for (const id of ["greedy", "optimal"]) {
      const s = summarize(id, results.get(id)!);
      expect(s.median, id).not.toBeNull();
      expect(s.median!, id).toBeLessThanOrEqual(TARGET_MINUTES.greedy);
    }
    // Not trivial either: an attentive, efficient player should still need real time.
    expect(summarize('optimal', results.get('optimal')!).median!).toBeGreaterThanOrEqual(25);
  });

  it('even poor strategies ascend within 90 minutes', () => {
    for (const bot of BOTS) {
      // Never prestiging is reported but not asserted: prestige is the core loop, not a "wrong upgrade".
      if (bot.id === 'never-prestige') continue;
      const s = summarize(bot.id, results.get(bot.id)!);
      expect(s.median, bot.id).not.toBeNull();
      expect(s.median!, bot.id).toBeLessThanOrEqual(TARGET_MINUTES.worst);
    }
  });
});
