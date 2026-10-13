import type { GameState, TableDef, TableId, TableState, AutoStrategy } from './types';
import { TABLES, TABLE_IDS } from '../tables';

export const SAVE_VERSION = 1;
export const START_MONEY = 100;

export function newTableState(def: TableDef): TableState {
  return {
    unlocked: def.unlockCost === 0,
    prestige: 0,
    levels: {},
    bet: def.baseMinBet,
    option: def.options?.[0].id ?? '',
    autoStrategy: 'pct',
    profit: 0,
    lifetimeProfit: 0,
    plays: 0,
  };
}

export function createInitialState(now = Date.now()): GameState {
  const tables = {} as Record<TableId, TableState>;
  for (const id of TABLE_IDS) tables[id] = newTableState(TABLES[id]);
  return { version: SAVE_VERSION, money: START_MONEY, tables, created: now, lastSaved: now };
}

function num(value: unknown, fallback: number, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, value) : fallback;
}

const STRATEGIES: AutoStrategy[] = ['min', 'pct', 'max'];

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
    ts.bet = Math.floor(num(src.bet, ts.bet, 1));
    if (STRATEGIES.includes(src.autoStrategy)) ts.autoStrategy = src.autoStrategy;
    if (def.options?.some((o) => o.id === src.option)) ts.option = src.option;
    if (src.levels && typeof src.levels === 'object') {
      for (const [key, value] of Object.entries(src.levels)) {
        ts.levels[key] = Math.floor(num(value, 0));
      }
    }
  }
  return state;
}
