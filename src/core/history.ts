import type { BankrollHistory, History, PlayStats, PlayView, Series, TableId } from './types';

export const MAX_HISTORY_POINTS = 400;

export const SLOT_SYMBOLS = 6;
export const POCKETS = 37;
export const RECENT_COINS = 60;
export const RECENT_POCKETS = 30;

export function newStats(): PlayStats {
  return {
    coin: { heads: 0, tails: 0, streak: 0, longest: 0, recent: [] },
    slots: { symbols: new Array(SLOT_SYMBOLS).fill(0), triples: 0, pairs: 0, rounds: 0 },
    roulette: { pockets: new Array(POCKETS).fill(0), recent: [] },
    blackjack: { natural: 0, win: 0, push: 0, lose: 0, bust: 0 },
  };
}

export function newHistory(): History {
  return { step: 1, points: [[0, 0]], marks: [], stats: newStats() };
}

/** Tallies one round's structured view into the per-game stats. */
export function recordView(h: History, view: PlayView | undefined): void {
  if (!view) return;
  const s = h.stats;
  switch (view.kind) {
    case 'coin': {
      const c = s.coin;
      if (view.heads) c.heads++;
      else c.tails++;
      const dir = view.heads ? 1 : -1;
      c.streak = Math.sign(c.streak) === dir ? c.streak + dir : dir;
      c.longest = Math.max(c.longest, Math.abs(c.streak));
      c.recent.push(view.heads ? 1 : 0);
      if (c.recent.length > RECENT_COINS) c.recent.shift();
      break;
    }
    case 'slots': {
      const sl = s.slots;
      sl.rounds++;
      for (const r of view.reels) if (r >= 0 && r < SLOT_SYMBOLS) sl.symbols[r]++;
      const [a, b, c] = view.reels;
      if (a === b && b === c) sl.triples++;
      else if (a === b || b === c || a === c) sl.pairs++;
      break;
    }
    case 'roulette': {
      const r = s.roulette;
      if (view.pocket >= 0 && view.pocket < POCKETS) r.pockets[view.pocket]++;
      r.recent.push(view.pocket);
      if (r.recent.length > RECENT_POCKETS) r.recent.shift();
      break;
    }
    case 'blackjack':
      s.blackjack[view.outcome]++;
      break;
  }
}

/** Halves the resolution: keeps every other point plus the newest, and doubles the sampling step. */
export function compact(h: Series): void {
  const last = h.points[h.points.length - 1];
  const kept = h.points.filter((_, i) => i % 2 === 0);
  if (kept[kept.length - 1] !== last) kept.push(last);
  h.points = kept;
  h.step *= 2;
}

/** Records the table's lifetime profit after `plays` total plays, sampled every `step` plays. */
export function recordSample(h: Series, plays: number, value: number, force = false): void {
  const last = h.points[h.points.length - 1];
  if (last && plays <= last[0]) {
    if (force && plays === last[0]) last[1] = value;
    return;
  }
  if (!force && last && plays - last[0] < h.step) return;
  h.points.push([plays, value]);
  if (h.points.length > MAX_HISTORY_POINTS) compact(h);
}

export function markPrestige(h: Series, plays: number): void {
  h.marks.push(plays);
  if (h.marks.length > 50) h.marks.shift();
}

const BANKROLL_TABLES: readonly TableId[] = ['coinflip', 'slots', 'roulette', 'blackjack'];

function perTable<T>(make: (id: TableId) => T): Record<TableId, T> {
  const out = {} as Record<TableId, T>;
  for (const id of BANKROLL_TABLES) out[id] = make(id);
  return out;
}

export function newBankroll(money: number): BankrollHistory {
  return {
    step: 1,
    points: [[0, money]],
    marks: [],
    rounds: 0,
    net: perTable(() => 0),
    contrib: perTable(() => ({ step: 1, points: [[0, 0]], marks: [] })),
  };
}

/** Credits a round's (or an offline stretch's) net winnings to the table that earned them. */
export function addContribution(b: BankrollHistory, id: TableId, net: number): void {
  b.net[id] += net;
}

/** Samples every table's cumulative contribution at the current round so the series stay aligned. */
export function sampleContribution(b: BankrollHistory, force = false): void {
  for (const id of BANKROLL_TABLES) recordSample(b.contrib[id], b.rounds, b.net[id], force);
}

/** Keeps ascending, finite [x, value] pairs; negative values are allowed (a table can lose money overall). */
function cleanPoints(raw: unknown): [number, number][] {
  const pts: [number, number][] = [];
  if (!Array.isArray(raw)) return pts;
  let prev = -1;
  for (const p of raw.slice(0, MAX_HISTORY_POINTS * 2)) {
    if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') continue;
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || p[0] <= prev || p[0] < 0) continue;
    pts.push([p[0], p[1]]);
    prev = p[0];
  }
  return pts;
}

/** Restores the per-table contribution data, or seeds it from lifetime table profits for older saves. */
function normalizeContribution(b: BankrollHistory, raw: unknown, seed: Partial<Record<TableId, number>>): void {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  for (const id of BANKROLL_TABLES) {
    const total = r.net?.[id];
    const src = r.contrib?.[id];
    const pts = cleanPoints(src?.points);
    if (typeof total === 'number' && Number.isFinite(total) && pts.length > 0) {
      b.net[id] = total;
      b.contrib[id].points = pts;
      if (typeof src.step === 'number' && Number.isFinite(src.step) && src.step >= 1) b.contrib[id].step = Math.floor(src.step);
      while (b.contrib[id].points.length > MAX_HISTORY_POINTS) compact(b.contrib[id]);
    } else {
      b.net[id] = seed[id] ?? 0;
      b.contrib[id].points = [[b.rounds, b.net[id]]];
    }
  }
}

/** Validates an untrusted bankroll series; falls back to a single point at the current bankroll. */
export function normalizeBankroll(
  raw: unknown,
  money: number,
  seed: Partial<Record<TableId, number>> = {},
): BankrollHistory {
  const b = normalizeBankrollSeries(raw, money);
  normalizeContribution(b, raw, seed);
  return b;
}

function normalizeBankrollSeries(raw: unknown, money: number): BankrollHistory {
  const b = newBankroll(money);
  if (!raw || typeof raw !== 'object') return b;
  const r = raw as Partial<BankrollHistory>;
  if (!Array.isArray(r.points)) return b;
  const pts: [number, number][] = [];
  let prev = -1;
  for (const p of r.points.slice(0, MAX_HISTORY_POINTS * 2)) {
    if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') continue;
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || p[0] <= prev || p[0] < 0 || p[1] < 0) continue;
    pts.push([p[0], p[1]]);
    prev = p[0];
  }
  if (pts.length === 0) return b;
  b.points = pts;
  if (typeof r.step === 'number' && Number.isFinite(r.step) && r.step >= 1) b.step = Math.floor(r.step);
  if (Array.isArray(r.marks)) {
    b.marks = r.marks.filter((m): m is number => typeof m === 'number' && Number.isFinite(m)).slice(-50);
  }
  b.rounds = Math.max(count(r.rounds), pts[pts.length - 1][0]);
  while (b.points.length > MAX_HISTORY_POINTS) compact(b);
  return b;
}

function counts(raw: unknown, length: number): number[] {
  const out = new Array<number>(length).fill(0);
  if (Array.isArray(raw)) {
    for (let i = 0; i < length; i++) {
      const v = raw[i];
      if (typeof v === 'number' && Number.isFinite(v)) out[i] = Math.max(0, Math.floor(v));
    }
  }
  return out;
}

function count(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

function recent(raw: unknown, limit: number, max: number): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max)
    .slice(-limit);
}

/** Validates untrusted per-game stats; anything missing or malformed becomes zero. */
export function normalizeStats(raw: unknown): PlayStats {
  const s = newStats();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, any>;
  if (r.coin && typeof r.coin === 'object') {
    s.coin.heads = count(r.coin.heads);
    s.coin.tails = count(r.coin.tails);
    s.coin.streak = typeof r.coin.streak === 'number' && Number.isFinite(r.coin.streak) ? Math.trunc(r.coin.streak) : 0;
    s.coin.longest = Math.max(count(r.coin.longest), Math.abs(s.coin.streak));
    s.coin.recent = recent(r.coin.recent, RECENT_COINS, 1);
  }
  if (r.slots && typeof r.slots === 'object') {
    s.slots.symbols = counts(r.slots.symbols, SLOT_SYMBOLS);
    s.slots.triples = count(r.slots.triples);
    s.slots.pairs = count(r.slots.pairs);
    s.slots.rounds = count(r.slots.rounds);
  }
  if (r.roulette && typeof r.roulette === 'object') {
    s.roulette.pockets = counts(r.roulette.pockets, POCKETS);
    s.roulette.recent = recent(r.roulette.recent, RECENT_POCKETS, POCKETS - 1);
  }
  if (r.blackjack && typeof r.blackjack === 'object') {
    for (const k of ['natural', 'win', 'push', 'lose', 'bust'] as const) s.blackjack[k] = count(r.blackjack[k]);
  }
  return s;
}

/** Validates untrusted history data from a save; falls back to a fresh series seeded with the current totals. */
export function normalizeHistory(raw: unknown, plays: number, lifetimeProfit: number): History {
  const h = newHistory();
  const r = raw as Partial<History> | null;
  h.stats = normalizeStats(r && typeof r === 'object' ? r.stats : null);
  if (r && typeof r === 'object' && Array.isArray(r.points)) {
    const pts: [number, number][] = [];
    let prev = -1;
    for (const p of r.points.slice(0, MAX_HISTORY_POINTS * 2)) {
      if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') continue;
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || p[0] <= prev) continue;
      pts.push([p[0], p[1]]);
      prev = p[0];
    }
    if (pts.length > 0) {
      h.points = pts;
      if (typeof r.step === 'number' && Number.isFinite(r.step) && r.step >= 1) h.step = Math.floor(r.step);
      if (Array.isArray(r.marks)) {
        h.marks = r.marks.filter((m): m is number => typeof m === 'number' && Number.isFinite(m)).slice(-50);
      }
      while (h.points.length > MAX_HISTORY_POINTS) compact(h);
      return h;
    }
  }
  // Old save: start the series at the current totals so the chart isn't lying about the past.
  if (plays > 0) h.points = [[plays, lifetimeProfit]];
  return h;
}
