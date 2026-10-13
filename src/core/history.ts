import type { History, PlayStats, PlayView, Series } from './types';

export const MAX_HISTORY_POINTS = 400;
/** Income is averaged over at least this many seconds of play per chart sample. */
export const RATE_WINDOW_SECONDS = 5;

export const SLOT_SYMBOLS = 6;
export const POCKETS = 37;
export const RECENT_COINS = 60;
export const RECENT_POCKETS = 30;
export const RECENT_SPINS = 12;

export function newStats(): PlayStats {
  return {
    coin: { heads: 0, tails: 0, streak: 0, longest: 0, recent: [] },
    slots: { symbols: new Array(SLOT_SYMBOLS).fill(0), triples: 0, pairs: 0, rounds: 0, recent: [] },
    roulette: { pockets: new Array(POCKETS).fill(0), recent: [] },
    blackjack: { natural: 0, win: 0, push: 0, lose: 0, bust: 0 },
  };
}

export function newHistory(): History {
  return {
    step: 1,
    points: [[0, 0]],
    marks: [],
    rate: { step: 1, points: [[0, 0]], marks: [] },
    clock: 0,
    rateFrom: [0, 0],
    stats: newStats(),
  };
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
      sl.recent.push([...view.reels]);
      if (sl.recent.length > RECENT_SPINS) sl.recent.shift();
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

/** Adds `seconds` of play time and, once a window has elapsed, samples net currency/sec at x = `plays`. */
export function recordRate(h: History, seconds: number, plays: number, lifetimeProfit: number, force = false): void {
  h.clock += seconds;
  const elapsed = h.clock - h.rateFrom[0];
  if (elapsed <= 0 || (!force && elapsed < RATE_WINDOW_SECONDS)) return;
  recordSample(h.rate, plays, (lifetimeProfit - h.rateFrom[1]) / elapsed, true);
  h.rateFrom = [h.clock, lifetimeProfit];
}

export function markPrestige(h: Series, plays: number): void {
  h.marks.push(plays);
  if (h.marks.length > 50) h.marks.shift();
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
    if (Array.isArray(r.slots.recent)) {
      s.slots.recent = r.slots.recent
        .map((x: unknown) => recent(x, 3, SLOT_SYMBOLS - 1))
        .filter((x: number[]) => x.length === 3)
        .slice(-RECENT_SPINS);
    }
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
  let hasRate = false;
  if (r && typeof r === 'object') {
    h.clock = typeof r.clock === 'number' && Number.isFinite(r.clock) ? Math.max(0, r.clock) : 0;
    const rate = (r as Partial<History>).rate;
    const pts = cleanPoints(rate?.points);
    if (rate && pts.length > 0) {
      hasRate = true;
      h.rate.points = pts;
      if (typeof rate.step === 'number' && Number.isFinite(rate.step) && rate.step >= 1) h.rate.step = Math.floor(rate.step);
      while (h.rate.points.length > MAX_HISTORY_POINTS) compact(h.rate);
    }
  }
  if (!hasRate && plays > 0) h.rate.points = [[plays, 0]];
  const from = r?.rateFrom;
  const fromOk =
    Array.isArray(from) && from.every((v) => typeof v === 'number' && Number.isFinite(v)) && from[0] >= 0 && from[0] <= h.clock;
  h.rateFrom = fromOk ? [from![0], from![1]] : [h.clock, lifetimeProfit];
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
