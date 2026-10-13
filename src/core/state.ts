import type { CasinoState, GameState, TableDef, TableId, TableState } from './types';
import { CASINO_UPGRADES } from './casino';
import { TABLES, TABLE_IDS } from '../tables';
import { newHistory, normalizeHistory } from './history';
import { backfillAchievements, newAchievements, normalizeAchievements } from './achievements';

export const SAVE_VERSION = 2;
export const START_MONEY = 100;

export function newTableState(def: TableDef): TableState {
  return {
    unlocked: def.unlockCost === 0,
    prestige: 0,
    levels: {},
    bet: def.baseMinBet,
    option: def.options?.[0].id ?? '',
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
  return { version: SAVE_VERSION, money: START_MONEY, tables, casino: newCasinoState(), achievements: newAchievements(), created: now, lastSaved: now };
}

function num(value: unknown, fallback: number, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, value) : fallback;
}

/** Validates untrusted save data and fills in anything missing. Throws on garbage. */
export function normalizeState(raw: unknown, now = Date.now()): GameState {
  if (!raw || typeof raw !== 'object') throw new Error('Not a save file');
  const r = raw as Record<string, any>;
  if (typeof r.money !== 'number' || !Number.isFinite(r.money)) throw new Error('Save has no bankroll');

  const state = createInitialState(now);
  state.money = Math.max(0, Math.floor(r.money));
  state.created = num(r.created, now);
  state.lastSaved = num(r.lastSaved, now);

  for (const id of TABLE_IDS) {
    const def = TABLES[id];
    const src = r.tables?.[id];
    if (!src || typeof src !== 'object') continue;
    const ts = state.tables[id];
    ts.unlocked = def.unlockCost === 0 || src.unlocked === true;
    ts.prestige = Math.floor(num(src.prestige, 0));
    ts.profit = num(src.profit, 0, -Infinity);
    ts.lifetimeProfit = num(src.lifetimeProfit, 0, -Infinity);
    ts.plays = Math.floor(num(src.plays, 0));
    ts.history = normalizeHistory(src.history, ts.plays, ts.lifetimeProfit);
    ts.bet = Math.floor(num(src.bet, ts.bet, 1));
    if (def.options?.some((o) => o.id === src.option)) ts.option = src.option;
    if (src.levels && typeof src.levels === 'object') {
      for (const [key, value] of Object.entries(src.levels)) {
        ts.levels[key] = Math.floor(num(value, 0));
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
    }
  }
  // Saves from before achievements get their grind counts seeded from lifetime play stats.
  state.achievements = r.achievements ? normalizeAchievements(r.achievements) : backfillAchievements(state);
  return state;
}
