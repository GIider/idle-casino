import type { CasinoState, GameState, TableDef, TableId, TableState } from './types';
import { CASINO_UPGRADES } from './casino';
import { TABLES, TABLE_IDS } from '../tables';
import { newBankroll, newHistory, normalizeBankroll, normalizeHistory } from './history';
import { backfillAchievements, newAchievements, normalizeAchievements, observeUpgrades } from './achievements';
import { allUpgrades, minBet } from './economy';

export const SAVE_VERSION = 3;
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

/** Wallets summed in minimum-bet units: the one number that is comparable across currencies. */
export function casinoValue(tables: Record<TableId, TableState>): number {
  let total = 0;
  for (const id of TABLE_IDS) total += tables[id].wallet / TABLES[id].baseMinBet;
  return total;
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
  };
}

export function newCasinoState(): CasinoState {
  return { chips: 0, totalChips: 0, ascensions: 0, levels: {} };
}

export function createInitialState(now = Date.now()): GameState {
  const tables = {} as Record<TableId, TableState>;
  for (const id of TABLE_IDS) tables[id] = newTableState(TABLES[id]);
  return { version: SAVE_VERSION, tables, bankroll: newBankroll(casinoValue(tables)), casino: newCasinoState(), achievements: newAchievements(), created: now, lastSaved: now };
}

function num(value: unknown, fallback: number, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, value) : fallback;
}

/** Validates untrusted save data and fills in anything missing. Throws on garbage. */
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
    ts.history = normalizeHistory(src.history, ts.plays, ts.lifetimeProfit);
    if (src.levels && typeof src.levels === 'object') {
      // Only current upgrades survive (e.g. the retired `auto` level is dropped), clamped to their max.
      for (const upg of allUpgrades(def)) {
        const level = Math.floor(num(src.levels[upg.id], 0));
        if (level > 0) ts.levels[upg.id] = Math.min(upg.maxLevel, level);
      }
    }
  }
  // Older saves have no contribution data: seed it from each table's lifetime profit.
  const lifetime = Object.fromEntries(TABLE_IDS.map((id) => [id, state.tables[id].lifetimeProfit]));
  state.bankroll = normalizeBankroll(r.bankroll, casinoValue(state.tables), lifetime);
  const c = r.casino;
  if (c && typeof c === 'object') {
    state.casino.chips = Math.floor(num(c.chips, 0));
    state.casino.totalChips = Math.max(state.casino.chips, Math.floor(num(c.totalChips, 0)));
    state.casino.ascensions = Math.floor(num(c.ascensions, 0));
    if (c.levels && typeof c.levels === 'object') {
      for (const upg of CASINO_UPGRADES) {
        state.casino.levels[upg.id] = Math.min(upg.maxLevel, Math.floor(num(c.levels[upg.id], 0)));
      }
    }
  }
  // Saves from before achievements get their grind counts seeded from lifetime play stats.
  state.achievements = r.achievements ? normalizeAchievements(r.achievements) : backfillAchievements(state);
  // Upgrades already owned in an older save count toward the collection achievements.
  for (const id of TABLE_IDS) observeUpgrades(state.achievements, id, allUpgrades(TABLES[id]), state.tables[id].levels);
  return state;
}
