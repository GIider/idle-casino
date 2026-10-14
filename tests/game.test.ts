import { describe, expect, it } from 'vitest';
import { FEED_RESERVE_BETS, Game } from '../src/core/game';
import { DEFAULT_FEED_SHARE, SAVE_VERSION, createInitialState, normalizeState } from '../src/core/state';
import { DEV_SAVE_KEY, SAVE_KEY, clearSave, exportSave, importSave, loadGame, saveGame } from '../src/core/save';
import { mulberry32 } from '../src/core/rng';
import { STARTER_BETS, prestigeWallet } from '../src/core/state';
import { prestigeThreshold, minBet, upgradeCost, upgradePrice, allUpgrades } from '../src/core/economy';
import { TABLES, TABLE_IDS } from '../src/tables';

function game() {
  return new Game(createInitialState(0), mulberry32(1));
}

describe('Game', () => {
  it('plays a round and updates wallet and profit', () => {
    const g = game();
    const before = g.table('coinflip').wallet;
    const o = g.play('coinflip')!;
    expect(g.table('coinflip').wallet).toBe(before + o.net);
    expect(g.table('coinflip').plays).toBe(1);
    expect(g.table('coinflip').profit).toBe(o.net);
  });

  it('refuses locked tables and unaffordable bets', () => {
    const g = game();
    expect(g.play('slots')).toBeNull();
    g.table('coinflip').wallet = 0;
    expect(g.play('coinflip')).toBeNull();
  });

  it('buys upgrades with geometric cost and respects max level', () => {
    const g = game();
    g.table('coinflip').wallet = 1e9;
    const def = g.def('coinflip');
    const luck = allUpgrades(def).find((u) => u.id === 'luck')!;
    const c0 = upgradeCost(def, luck, 0, 0);
    expect(g.buyUpgrade('coinflip', 'luck')).toBe(true);
    expect(g.table('coinflip').wallet).toBe(1e9 - c0);
    for (let i = 0; i < 40; i++) g.buyUpgrade('coinflip', 'luck');
    expect(g.upgradeLevel('coinflip', 'luck')).toBe(luck.maxLevel);
  });

  it('unlocks a table with the previous table\'s currency and gives it a starter wallet', () => {
    const g = game();
    const cost = g.def('slots').unlockCost;
    expect(g.unlock('slots')).toBe(false);
    g.table('coinflip').wallet = cost - 1;
    expect(g.canUnlock('slots')).toBe(false);
    g.table('coinflip').wallet = cost + 7;
    expect(g.unlock('slots')).toBe(true);
    expect(g.table('coinflip').wallet).toBe(7);
    expect(g.table('slots').wallet).toBe(g.def('slots').baseMinBet * STARTER_BETS);
  });

  it('only the previous table can pay for an unlock', () => {
    const g = game();
    g.table('coinflip').wallet = 1e12;
    g.table('slots').wallet = 0;
    // Roulette is paid in Tokens, and Slots isn't even open yet.
    expect(g.canUnlock('roulette')).toBe(false);
    expect(g.unlock('roulette')).toBe(false);
    g.unlock('slots');
    g.table('slots').wallet = g.def('roulette').unlockCost;
    expect(g.unlock('roulette')).toBe(true);
    expect(g.table('coinflip').wallet).toBeGreaterThan(1e11);
  });

  it('prestige at one table boosts winnings at the next', () => {
    const g = game();
    expect(g.bonusFor('slots').payout).toBe(1);
    g.table('coinflip').prestige = 5;
    expect(g.bonusFor('slots').payout).toBeCloseTo(1.2);
    expect(g.bonusFor('coinflip').payout).toBe(1);
    expect(g.bonusFor('roulette').payout).toBe(1);
  });

  it('stakes the previous table\'s currency and pays winnings in its own', () => {
    const g = game();
    g.table('coinflip').wallet = 1e12;
    g.unlock('slots');
    const slots = g.table('slots');
    const before = g.table('coinflip').wallet;
    // Slots has no stake of its own to run on: it draws on the Pennies fed to it.
    slots.wallet = 0;
    expect(g.buyUpgrade('slots', 'luck')).toBe(false);
    const out = g.play('slots');
    expect(out).not.toBeNull();
    expect(g.table('coinflip').wallet).toBe(before - g.stakePrice('slots', out!.bet));
    expect(slots.wallet).toBe(Math.max(0, out!.net));
    // Feed share 0 starves the table without touching either wallet.
    g.setFeedShare('slots', 0);
    const frozen = g.table('coinflip').wallet;
    expect(g.play('slots')).toBeNull();
    expect(g.table('coinflip').wallet).toBe(frozen);
  });

  it('a starved table is never comped chips', () => {
    const g = game();
    g.table('coinflip').wallet = 1e12;
    g.unlock('slots');
    g.table('coinflip').wallet = 0;
    g.table('slots').wallet = 0;
    g.tick(5);
    expect(g.table('slots').plays).toBe(0);
    expect(g.table('slots').wallet).toBe(0);
  });

  it('an unlocked table plays on tick with no purchases, faster with speed', () => {
    const g = game();
    g.table('coinflip').wallet = 10000;
    g.tick(5);
    expect(g.table('coinflip').plays).toBe(5);
    g.state.tables.coinflip.levels.speed = 2;
    g.tick(5);
    expect(g.table('coinflip').plays).toBe(5 + 10);
  });

  it('bails out a broke table without touching the others', () => {
    const g = game();
    g.table('coinflip').wallet = 0;
    g.tick(0.1);
    expect(g.table('coinflip').wallet).toBeGreaterThan(0);
    expect(g.table('slots').wallet).toBe(0);
  });

  it('prestige resets upgrades and raises stakes', () => {
    const g = game();
    const def = g.def('coinflip');
    const ts = g.table('coinflip');
    ts.levels = { luck: 5, speed: 3 };
    expect(g.prestige('coinflip')).toBe(false);
    ts.profit = prestigeThreshold(def, 0);
    g.table('coinflip').wallet = 12345;
    expect(g.prestige('coinflip')).toBe(true);
    expect(g.table('coinflip').wallet).toBe(prestigeWallet(def, 1));
    expect(g.table('coinflip').wallet).toBeGreaterThanOrEqual(minBet(def, 1) * 10);
    expect(ts.prestige).toBe(1);
    expect(ts.levels).toEqual({});
    expect(ts.profit).toBe(0);
    expect(minBet(def, 1)).toBeGreaterThan(minBet(def, 0));
  });

  it('applies offline progress with a cap', () => {
    const g = game();
    g.table('coinflip').wallet = 1000;
    g.state.tables.coinflip.levels.speed = 2;
    const r = g.applyOffline(10 * 3600);
    expect(r.plays).toBe(Math.floor(2 * 8 * 3600 * 0.5));
    expect(g.table('coinflip').wallet).toBeGreaterThan(0);
  });
});

describe('saves', () => {
  it('clearing the dev save (card counting mode) leaves the main save intact', () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    saveGame(createInitialState(0), store, SAVE_KEY);
    saveGame(createInitialState(0), store, DEV_SAVE_KEY);
    clearSave(store, DEV_SAVE_KEY);
    expect(loadGame(store, DEV_SAVE_KEY)).toBeNull();
    expect(loadGame(store, SAVE_KEY)).not.toBeNull();
  });

  it('round-trips through storage and export', () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const s = createInitialState(0);
    s.tables.coinflip.wallet = 777;
    s.tables.slots.wallet = 55;
    s.tables.slots.unlocked = true;
    s.tables.slots.levels.loaded = 3;
    expect(saveGame(s, store)).toBe(true);
    const loaded = loadGame(store)!;
    expect(loaded.tables.coinflip.wallet).toBe(777);
    expect(loaded.tables.slots.wallet).toBe(55);
    expect(loaded.tables.slots.levels.loaded).toBe(3);
    expect(importSave(exportSave(s)).tables.coinflip.wallet).toBe(777);
  });

  it('rejects garbage and sanitizes odd values', () => {
    expect(() => importSave('nope')).toThrow();
    expect(() => normalizeState({ money: 'x' })).toThrow();
    const s = normalizeState({
      version: SAVE_VERSION,
      tables: { coinflip: { wallet: 5.7, levels: { luck: -3, auto: 2.9, speed: 999 } } },
    });
    expect(s.tables.coinflip.wallet).toBe(5);
    expect(s.tables.coinflip.levels.luck).toBeUndefined();
    expect(s.tables.coinflip.levels.auto).toBeUndefined();
    expect(s.tables.coinflip.levels.speed).toBe(20);
    expect(s.tables.slots.unlocked).toBe(false);
    // Saves from before chained stakes get the default feed share; out-of-range values are clamped.
    expect(s.tables.slots.feedShare).toBe(DEFAULT_FEED_SHARE);
    const t = normalizeState({ version: SAVE_VERSION, tables: { slots: { feedShare: 7 }, roulette: { feedShare: -1 } } });
    expect(t.tables.slots.feedShare).toBe(1);
    expect(t.tables.roulette.feedShare).toBe(0);
  });

  it('refuses saves from before per-table wallets', () => {
    const old = { version: 2, money: 5000, tables: { coinflip: { levels: {} } } };
    expect(() => normalizeState(old)).toThrow(/older version/);
    expect(loadGame({ getItem: () => JSON.stringify(old), setItem() {}, removeItem() {} })).toBeNull();
  });
});

describe('dev unlock', () => {
  it('unlocks every table and grants the Floor Manager without touching meta progress', () => {
    const g = game();
    g.devUnlockAll();
    for (const id of TABLE_IDS) {
      const ts = g.table(id);
      expect(ts.unlocked).toBe(true);
      expect(ts.wallet).toBeGreaterThan(0);
      expect(ts.prestige).toBe(0);
    }
    expect(g.state.casino.chips).toBe(0);
    expect(g.state.casino.ascensions).toBe(0);
    expect(g.casinoLevel('manager')).toBe(1);
    for (const id of TABLE_IDS) {
      const ts = g.table(id);
      const total = allUpgrades(TABLES[id]).reduce((sum, u) => {
        for (let l = 0; l < u.maxLevel; l++) sum += upgradeCost(TABLES[id], u, ts.prestige, l);
        return sum;
      }, 0);
      expect(ts.wallet).toBeGreaterThanOrEqual(total);
    }
    g.tick(10);
    expect(g.managerLog.length).toBeGreaterThan(0);
  });
});

describe('cross-table upgrade prices', () => {
  const mk = () => {
    const g = new Game(createInitialState(0), mulberry32(1));
    g.state.tables.slots.unlocked = true;
    return g;
  };
  const speed = allUpgrades(TABLES.slots).find((u) => u.id === 'speed')!;

  it('prices follow the tie shapes', () => {
    const exp = upgradePrice(TABLES.slots, speed, {}, 0);
    expect(exp.ties.length).toBe(1);
    expect(exp.ties[0].from).toBe('coinflip');
    expect(upgradePrice(TABLES.slots, speed, {}, 2).ties[0].amount).toBeGreaterThan(exp.ties[0].amount);
    const auto = allUpgrades(TABLES.slots).find((u) => u.id === 'autobet')!;
    // Only the large-bet levels draw on the earlier currency, and it follows that table's prestige.
    expect(upgradePrice(TABLES.slots, auto, {}, 2).ties).toEqual([]);
    const l3 = upgradePrice(TABLES.slots, auto, {}, 3).ties[0].amount;
    expect(upgradePrice(TABLES.slots, auto, { coinflip: 1 }, 3).ties[0].amount).toBe(l3 * 3);
    expect(upgradePrice(TABLES.slots, auto, { slots: 2 }, 3).ties[0].amount).toBe(l3);
  });

  it('buying spends every currency in the price', () => {
    const g = mk();
    const price = upgradePrice(TABLES.slots, speed, {}, 0);
    g.table('coinflip').wallet = 1e9;
    g.table('slots').wallet = price.own + 5;
    expect(g.buyUpgrade('slots', 'speed')).toBe(true);
    expect(g.table('slots').wallet).toBe(5);
    expect(g.table('coinflip').wallet).toBe(1e9 - price.ties[0].amount);
  });

  it('is refused when only the earlier currency is short, and never dips into the Coin Flip bankroll', () => {
    const g = mk();
    const price = upgradePrice(TABLES.slots, speed, {}, 0);
    g.table('slots').wallet = 1e9;
    const reserve = TABLES.coinflip.baseMinBet * FEED_RESERVE_BETS;
    g.table('coinflip').wallet = reserve + price.ties[0].amount - 1;
    expect(g.buyUpgrade('slots', 'speed')).toBe(false);
    g.table('coinflip').wallet = reserve + price.ties[0].amount;
    expect(g.buyUpgrade('slots', 'speed')).toBe(true);
    expect(g.table('coinflip').wallet).toBe(reserve);
  });
});

describe('cross-table price distance', () => {
  it('a currency from further back always costs more minimum bets than one from a closer table', () => {
    for (const id of TABLE_IDS) {
      for (const upg of allUpgrades(TABLES[id])) {
        const ties = upg.ties ?? [];
        const level = Math.max(0, ...ties.map((t) => t.fromLevel ?? 0));
        const price = upgradePrice(TABLES[id], upg, {}, level).ties;
        for (const a of price) {
          for (const b of price) {
            if (TABLE_IDS.indexOf(a.from) < TABLE_IDS.indexOf(b.from)) {
              // Compared in minimum bets of the paying table, the unit prices are set in.
              expect(a.amount / TABLES[a.from].baseMinBet, `${id}:${upg.id} ${a.from} vs ${b.from}`).toBeGreaterThan(b.amount / TABLES[b.from].baseMinBet);
            }
          }
        }
      }
    }
  });

  it('each table further back multiplies a price exponentially', () => {
    const payout = allUpgrades(TABLES.blackjack).find((u) => u.id === 'cashback')!;
    const probe = { ...payout, ties: [{ from: 'roulette' as const, share: 1, scale: 'flat' as const }, { from: 'slots' as const, share: 1, scale: 'flat' as const }, { from: 'coinflip' as const, share: 1, scale: 'flat' as const }] };
    const [near, mid, far] = upgradePrice(TABLES.blackjack, probe, {}, 0).ties.map((t) => t.amount / TABLES[t.from].baseMinBet);
    expect(mid / near).toBeCloseTo(far / mid, 5);
    expect(mid / near).toBeGreaterThan(1);
  });
});
