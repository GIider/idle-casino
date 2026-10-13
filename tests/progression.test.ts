import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { createInitialState } from '../src/core/state';
import { mulberry32 } from '../src/core/rng';
import { TABLES, TABLE_IDS } from '../src/tables';
import { allUpgrades, upgradeCost } from '../src/core/economy';

interface BotOptions {
  /** Unlock new tables as soon as the previous table's wallet can pay. */
  unlock?: boolean;
  /** Ascend as soon as possible. */
  ascend?: boolean;
}

/** A greedy bot: spends each table's own wallet on its cheapest upgrade, unlocks tables, prestiges when possible. */
function runBot(minutes: number, opts: BotOptions = {}, log?: (s: string) => void) {
  const { unlock = true, ascend = false } = opts;
  const g = new Game(createInitialState(0), mulberry32(99));
  const dt = 0.1;
  const unlockedAt: Record<string, number> = {};
  const prestigeAt: string[] = [];
  let ascendedAt: number | null = null;
  for (let step = 0; step < minutes * 600; step++) {
    g.tick(dt);
    if (step % 10 !== 0) continue;
    const t = step / 600;
    // Like a human would: click by hand at tables nobody is playing for yet.
    for (const id of TABLE_IDS) {
      if (g.table(id).unlocked && (g.table(id).levels.auto ?? 0) === 0) for (let i = 0; i < 6; i++) g.play(id);
    }
    for (const id of TABLE_IDS) {
      if (unlock && !g.table(id).unlocked && g.unlock(id)) unlockedAt[id] = t;
      if (g.canPrestige(id) && g.prestige(id)) prestigeAt.push(`${id}@${t.toFixed(1)}m`);
    }
    if (ascend && ascendedAt === null && g.canAscend()) {
      ascendedAt = t;
      break;
    }
    // Each table buys its own cheapest upgrades from its own wallet.
    for (const id of TABLE_IDS) {
      const ts = g.table(id);
      if (!ts.unlocked) continue;
      for (let n = 0; n < 5; n++) {
        let best: { up: string; cost: number } | null = null;
        for (const u of allUpgrades(TABLES[id])) {
          const lvl = ts.levels[u.id] ?? 0;
          if (lvl >= u.maxLevel) continue;
          const cost = upgradeCost(TABLES[id], u, ts.prestige, lvl, g.bonus);
          if (!best || cost < best.cost) best = { up: u.id, cost };
        }
        if (!best || best.cost > ts.wallet * 0.6 || !g.buyUpgrade(id, best.up)) break;
      }
    }
    if (log && step % 6000 === 0) {
      log(
        `${t.toFixed(0)}m ` +
          TABLE_IDS.map((id) => `${id}:${g.table(id).unlocked ? Math.floor(g.table(id).wallet) : '-'}/p${g.table(id).prestige}`).join(' '),
      );
    }
  }
  return { g, unlockedAt, prestigeAt, ascendedAt };
}

describe('progression', () => {
  it('a greedy player works through every table in order', () => {
    const lines: string[] = [];
    const { g, unlockedAt, prestigeAt, ascendedAt } = runBot(120, { ascend: true }, (s) => lines.push(s));
    console.log(lines.join('\n'));
    console.log('unlocked', unlockedAt, 'prestiges', prestigeAt.slice(0, 16), 'ascended', ascendedAt);
    expect(g.table('coinflip').wallet).toBeGreaterThan(0);
    for (const id of TABLE_IDS.slice(1)) expect(unlockedAt[id]).toBeDefined();
    // Each table opens after the one before it, not all at once.
    expect(unlockedAt.slots).toBeLessThan(unlockedAt.roulette);
    expect(unlockedAt.roulette).toBeLessThan(unlockedAt.blackjack);
    // Achievements pace the endgame: nothing reaches Legendary in the first two hours of play.
    const legendary = Object.entries(g.state.achievements).filter(([id, p]) => !id.startsWith('collect_') && p.tier >= 3);
    expect(legendary.map(([id]) => id)).toEqual([]);
  }, 300000);

  it('Coin Flip alone cannot buy anything at the other tables', () => {
    const { g } = runBot(60, { unlock: false });
    expect(g.table('coinflip').wallet).toBeGreaterThan(0);
    for (const id of TABLE_IDS.slice(1)) {
      expect(g.table(id).unlocked).toBe(false);
      expect(g.table(id).wallet).toBe(0);
      expect(g.table(id).plays).toBe(0);
    }
    expect(g.canAscend()).toBe(false);
  }, 300000);
});
