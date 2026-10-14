import type { CasinoState, GameState, TableDef, TableId, TableState } from './types';
import { CASINO_UPGRADES, LEGACY_UPGRADES, curveCost } from './casino';
import { TABLES, TABLE_IDS } from '../tables';
import { newHistory, normalizeHistory } from './history';
import { backfillAchievements, newAchievements, normalizeAchievements, observeUpgrades } from './achievements';
import { allUpgrades, minBet } from './economy';

export const SAVE_VERSION = 4;
const MAX_STREAK_STORED = 1000;
/** The first table's starting wallet. */
export const START_MONEY = 100;
/** A newly unlocked table starts with this many of its own minimum bets. */
export const STARTER_BETS = 50;

/** What a table's wallet holds when it is first available. */
export function starterWallet(def: TableDef): number {
  return def.unlockCost === 0 ? START_MONEY : def.baseMinBet * STARTER_BETS;
}

/** What a table's wallet is reset to when it prestiges: a starter stack at the new, higher minimum bet. */
export function prestigeWallet(def: TableDef, prestige: number): number {
  return Math.max(starterWallet(def), minBet(def, prestige) * STARTER_BETS);
}

export function newTableState(def: TableDef): TableState {
  return {
    unlocked: def.unlockCost === 0,
    wallet: def.unlockCost === 0 ? START_MONEY : 0,
    prestige: 0,
    levels: {},
    profit: 0,
    lifetimeProfit: 0,
    plays: 0,
    history: newHistory(),
    streak: 0,
    peakWallet: def.unlockCost === 0 ? START_MONEY : 0,
  };
}

export function newCasinoState(): CasinoState {
  return { chips: 0, totalChips: 0, ascensions: 0, levels: {}, autoPrestige: false };
}

export function createInitialState(now = Date.now()): GameState {
  const tables = {} as Record<TableId, TableState>;
  for (const id of TABLE_IDS) tables[id] = newTableState(TABLES[id]);
  return { version: SAVE_VERSION, tables, casino: newCasinoState(), achievements: newAchievements(), created: now, lastSaved: now };
}

function num(value: unknown, fallback: number, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, value) : fallback;
}

/** Validates untrusted save data and fills in anything missing. Throws on garbage. */
/**
 * Maps shop levels from before the shop rebalance onto the current items and returns the chips refunded
 * for removed items or levels beyond a new cap. `levels` holds the already-clamped current levels.
 */
function migrateShop(raw: Record<string, unknown>, levels: Record<string, number>): number {
  // Old caps were at most 20 levels; clamping keeps corrupt saves from overflowing the refund.
  const old = (id: string) => Math.min(20, Math.max(0, Math.floor(num(raw[id], 0))));
  let refund = 0;
  // The old Floor Manager track (Lv1..4) became separate upgrades.
  const manager = old('manager');
  if (manager > 1) {
    levels.manager = 1;
    levels.overtime = Math.max(levels.overtime ?? 0, Math.min(manager - 1, 2));
    if (manager >= 4) levels.concierge = 1;
  }
  for (const [id, curve] of Object.entries(LEGACY_UPGRADES)) refund += curveCost(curve, 0, old(id));
  return refund;
}

export function normalizeState(raw: unknown, now = Date.now()): GameState {
  if (!raw || typeof raw !== 'object') throw new Error('Not a save file');
  const r = raw as Record<string, any>;
  if (typeof r.version !== 'number' || r.version < SAVE_VERSION) {
    throw new Error('This save is from an older version of the game and can no longer be loaded');
  }
  if (!r.tables || typeof r.tables !== 'object') throw new Error('Save has no tables');

  const state = createInitialState(now);
  state.created = num(r.created, now);
  state.lastSaved = num(r.lastSaved, now);

  for (const id of TABLE_IDS) {
    const def = TABLES[id];
    const src = r.tables?.[id];
    if (!src || typeof src !== 'object') continue;
    const ts = state.tables[id];
    ts.unlocked = def.unlockCost === 0 || src.unlocked === true;
    ts.wallet = Math.floor(num(src.wallet, ts.wallet));
    ts.prestige = Math.floor(num(src.prestige, 0));
    ts.profit = num(src.profit, 0, -Infinity);
    ts.lifetimeProfit = num(src.lifetimeProfit, 0, -Infinity);
    ts.plays = Math.floor(num(src.plays, 0));
    ts.streak = Math.min(MAX_STREAK_STORED, Math.floor(num(src.streak, 0)));
    ts.peakWallet = Math.max(ts.wallet, Math.floor(num(src.peakWallet, 0)));
    ts.history = normalizeHistory(src.history, ts.plays, ts.lifetimeProfit);
    if (src.levels && typeof src.levels === 'object') {
      // Only current upgrades survive (e.g. the retired `auto` level is dropped), clamped to their max.
      for (const upg of allUpgrades(def)) {
        const level = Math.floor(num(src.levels[upg.id], 0));
        if (level > 0) ts.levels[upg.id] = Math.min(upg.maxLevel, level);
      }
    }
  }
  const c = r.casino;
  if (c && typeof c === 'object') {
    state.casino.chips = Math.floor(num(c.chips, 0));
    state.casino.totalChips = Math.max(state.casino.chips, Math.floor(num(c.totalChips, 0)));
    state.casino.ascensions = Math.floor(num(c.ascensions, 0));
    if (c.levels && typeof c.levels === 'object') {
      for (const upg of CASINO_UPGRADES) {
        state.casino.levels[upg.id] = Math.min(upg.maxLevel, Math.floor(num(c.levels[upg.id], 0)));
      }
      state.casino.chips += migrateShop(c.levels, state.casino.levels);
    }
    state.casino.autoPrestige = c.autoPrestige === true;
  }
  // Saves from before achievements get their grind counts seeded from lifetime play stats.
  state.achievements = r.achievements ? normalizeAchievements(r.achievements) : backfillAchievements(state);
  // Upgrades already owned in an older save count toward the collection achievements.
  for (const id of TABLE_IDS) observeUpgrades(state.achievements, id, allUpgrades(TABLES[id]), state.tables[id].levels);
  return state;
}
