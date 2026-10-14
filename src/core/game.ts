import type { GameState, Rng, TableDef, TableId, TableState } from './types';
import { FINAL_TABLE, TABLES, TABLE_IDS, previousTable } from '../tables';
import { mulberry32 } from './rng';
import {
  BAILOUT_BETS,
  CROSS_PRESTIGE_BONUS,
  MAX_AUTO_PLAYS_PER_TICK,
  MAX_BONUS_PLAYS,
  OFFLINE_CAP_SECONDS,
  OFFLINE_EFFICIENCY,
  CORE_UPGRADES,
  allUpgrades,
  autoPlaysPerSecond,
  chooseAutoBet,
  dealerChance,
  effectivePlaysPerSecond,
  estimateNetPerPlay,
  nextStreak,
  minBet,
  prestigeThreshold,
  resolvePlay,
  upgradeCost,
  bulkPurchase,
  SINGLE_BUY,
  type BuyMode,
  type Outcome,
} from './economy';
import { START_MONEY, newTableState, prestigeWallet, starterWallet } from './state';
import { observeRound, observeUpgrades, perkLevels, type AchievementDef } from './achievements';
import { markPrestige, recordRate, recordSample, recordView, skipRate } from './history';
import {
  CASINO_UPGRADES,
  MANAGER_RESERVE_BETS,
  ascensionReward,
  canAscendWith,
  ascensionThreshold,
  casinoBonus,
  casinoUpgradeCost,
  managerInterval,
  type CasinoBonus,
} from './casino';

export interface LastPlay {
  seq: number;
  outcome: Outcome;
}

export interface OfflineReport {
  seconds: number;
  plays: number;
  net: number;
}

/** The first table keeps this many of its own minimum bets before the next table may draw on its wallet. */
export const FEED_RESERVE_BETS = 50;

/** Wallet (in minimum bets) the dev unlock tops every table up to. */
const DEV_WALLET_BETS = 100000;

export class Game {
  state: GameState;
  last: Partial<Record<TableId, LastPlay>> = {};
  /** Cumulative net winnings per table this session; the UI derives income/sec from it. */
  sessionNet: Record<TableId, number> = { coinflip: 0, slots: 0, roulette: 0, blackjack: 0 };
  notice: { text: string; seq: number } | null = null;
  /** Dev mode (`?cardcounting=1`): casino shop upgrades cost no chips. */
  freeCasinoShop = false;
  /** Recent Floor Manager purchases (bounded); the UI toasts entries it has not shown yet, by `seq`. */
  managerLog: { seq: number; text: string; table: TableId; upgradeId: string; at: number }[] = [];
  private quiet = false;
  private seq = 0;
  private acc: Record<TableId, number> = { coinflip: 0, slots: 0, roulette: 0, blackjack: 0 };
  private managerClock: Record<TableId, number> = { coinflip: 0, slots: 0, roulette: 0, blackjack: 0 };

  /** Per-table levels/bonus reused across the many plays of one `tick`; null outside a tick (state may change freely). */
  private tickCtx: Partial<Record<TableId, { levels: Record<string, number>; bonus: CasinoBonus }>> | null = null;

  constructor(state: GameState, private rng: Rng = Math.random) {
    this.state = state;
  }

  /** Casino-wide shop modifiers currently in effect. */
  get bonus(): CasinoBonus {
    return casinoBonus(this.state.casino);
  }

  /** Casino bonuses plus the winnings bonus this table earns from the previous table's prestige. */
  bonusFor(id: TableId): CasinoBonus {
    const bonus = this.bonus;
    const prev = previousTable(id);
    if (!prev) return bonus;
    return { ...bonus, payout: bonus.payout * (1 + CROSS_PRESTIGE_BONUS * this.state.tables[prev].prestige) };
  }

  def(id: TableId): TableDef {
    return TABLES[id];
  }

  table(id: TableId): TableState {
    return this.state.tables[id];
  }

  private estimateCache: Partial<Record<TableId, { key: string; net: number }>> = {};

  /** Table upgrade levels plus the perks earned from achievements, as `TableDef.play` reads them. */
  levelsFor(id: TableId): Record<string, number> {
    return { ...this.state.tables[id].levels, ...perkLevels(this.state.achievements, id) };
  }

  /** Marks an unlocked achievement as noticed, clearing its "new" indicator. */
  markSeen(id: string): void {
    const p = this.state.achievements[id];
    if (p) p.seen = true;
  }

  private announce(gained: AchievementDef[]): void {
    if (gained.length === 0) return;
    this.tickCtx = this.tickCtx && {};
    this.say(gained.map((a) => `🏆 ${a.perk.name}! ${a.perk.describe()}`).join(' · '));
  }

  private say(text: string): void {
    this.notice = { text, seq: ++this.seq };
  }

  /** The wallet a table's stakes are drawn from: the previous table's, or its own for the first table. */
  stakeSource(id: TableId): TableState {
    const prev = previousTable(id);
    return prev ? this.state.tables[prev] : this.state.tables[id];
  }

  /** What the table may bet from, in its own bet units: the fed share of the stake wallet at the table's exchange rate. */
  stakeBudget(id: TableId): number {
    const def = TABLES[id];
    const prev = previousTable(id);
    if (!prev) return this.state.tables[id].wallet;
    return this.feedable(id) / (def.stakeCost ?? 1);
  }

  /** Units of the previous table's wallet this table may stake from: its fed share of what is above the first table's bet reserve. */
  feedable(id: TableId): number {
    const prev = previousTable(id);
    if (!prev) return 0;
    const upstream = this.state.tables[prev];
    // Only the first table bets from its own wallet, so only it needs a bankroll kept back.
    const reserve = previousTable(prev) ? 0 : minBet(TABLES[prev], upstream.prestige) * FEED_RESERVE_BETS;
    return Math.max(0, upstream.wallet - reserve) * this.state.tables[id].feedShare;
  }

  /** Units of the stake wallet that a bet of `bet` costs. */
  stakePrice(id: TableId, bet: number): number {
    return previousTable(id) ? Math.ceil(bet * (TABLES[id].stakeCost ?? 1)) : bet;
  }

  /** Units of the previous table's currency this table is consuming per second at its current bet (0 at the first table or when starved). */
  stakeRate(id: TableId): number {
    if (!previousTable(id)) return 0;
    const ts = this.state.tables[id];
    if (!ts.unlocked) return 0;
    const bet = chooseAutoBet(TABLES[id], ts, this.stakeBudget(id));
    if (bet <= 0) return 0;
    return effectivePlaysPerSecond(ts.levels, this.bonus) * this.stakePrice(id, bet);
  }

  /** Sets the share of the previous table's wallet this table may stake from. */
  setFeedShare(id: TableId, share: number): void {
    this.state.tables[id].feedShare = Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0));
    delete this.estimateCache[id];
  }

  /** Plays one round at the table's automatic stake. Returns null if the table is locked or can't afford it. */
  play(id: TableId): Outcome | null {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    if (!ts.unlocked) return null;
    const stake = chooseAutoBet(def, ts, this.stakeBudget(id));
    if (stake <= 0) return null;

    // The stake leaves the stake wallet (the previous table's, except at the first table); winnings land in this table's own.
    this.stakeSource(id).wallet -= this.stakePrice(id, stake);
    let ctx = this.tickCtx?.[id];
    if (!ctx) {
      ctx = { levels: this.levelsFor(id), bonus: this.bonusFor(id) };
      if (this.tickCtx) this.tickCtx[id] = ctx;
    }
    const { levels } = ctx;
    const outcome = resolvePlay(def, levels, ts.prestige, stake, this.rng, ctx.bonus, ts.streak);
    // A fed table pays its winnings in its own currency (the stake was paid upstream); the first table settles its own stake.
    ts.wallet += previousTable(id) ? Math.max(0, outcome.net) : outcome.payout;
    ts.streak = nextStreak(ts.streak, outcome.net, levels);
    ts.plays++;
    ts.profit += outcome.net;
    ts.lifetimeProfit += outcome.net;
    recordSample(ts.history, ts.plays, ts.lifetimeProfit);
    recordView(ts.history, outcome.view);
    this.announce(observeRound(this.state.achievements, id, outcome));
    this.sessionNet[id] += outcome.net;
    this.last[id] = { seq: ++this.seq, outcome };
    return outcome;
  }

  /** Advances every unlocked table by `dt` seconds of play. */
  tick(dt: number): void {
    this.tickCtx = {};
    try {
      this.tickInner(dt);
    } finally {
      this.tickCtx = null;
    }
  }

  private tickInner(dt: number): void {
    const bonus = this.bonus;
    for (const id of TABLE_IDS) {
      const ts = this.state.tables[id];
      if (!ts.unlocked) continue;
      this.acc[id] += autoPlaysPerSecond(ts.levels, bonus) * dt;
      let n = Math.floor(this.acc[id]);
      this.acc[id] -= n;
      n = Math.min(n, MAX_AUTO_PLAYS_PER_TICK);
      for (let i = 0; i < n; i++) {
        const first = this.play(id);
        if (!first) break;
        // Second Dealer (and Pity Flip): a play may immediately trigger another at the same table.
        const chance = dealerChance(ts.levels);
        const again = (o: { bonusPlay?: boolean }) => !!o.bonusPlay || (chance > 0 && this.rng() < chance);
        let more = again(first);
        for (let b = 0; b < MAX_BONUS_PLAYS && more; b++) {
          const o = this.play(id);
          if (!o) break;
          more = again(o);
        }
      }
      recordRate(ts.history, dt, ts.plays, ts.lifetimeProfit);
    }
    this.runManager(dt);
    this.bailout();
    this.trackPeak();
  }

  /** Keeps each table's all-time (since ascension) wallet high-water mark, which ascension progress reads. */
  private trackPeak(): void {
    for (const id of TABLE_IDS) {
      const ts = this.state.tables[id];
      if (ts.wallet > ts.peakWallet) ts.peakWallet = ts.wallet;
    }
  }

  /** Final-table money that counts toward ascending: the best wallet reached, not what is left after spending or prestige. */
  ascensionMoney(): number {
    const ts = this.state.tables[FINAL_TABLE];
    return Math.max(ts.wallet, ts.peakWallet);
  }

  /** Progress (0..1) toward the next ascension: the money reached over the threshold, so the bar matches the stated target. */
  ascensionProgress(): number {
    const money = this.ascensionMoney();
    if (money <= 0) return 0;
    const threshold = ascensionThreshold(this.state.casino.ascensions);
    return Math.min(1, Math.max(0, money / threshold));
  }

  private managerInterval(): number {
    return managerInterval(this.casinoLevel('manager'), this.casinoLevel('overtime'));
  }

  /**
   * The Floor Manager's purchase for one table: the cheapest enabled core upgrade that leaves the bet reserve
   * intact, otherwise the cheapest of the rest.
   */
  autoBuy(id: TableId): boolean {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    if (!ts.unlocked) return false;
    // The reserve keeps the table betting, which only matters where the bet comes from its own wallet.
    const reserve = previousTable(id) ? 0 : minBet(def, ts.prestige) * MANAGER_RESERVE_BETS;
    let best: { id: string; cost: number; core: boolean } | null = null;
    for (const upg of allUpgrades(def)) {
      const level = ts.levels[upg.id] ?? 0;
      if (level >= upg.maxLevel) continue;
      const cost = upgradeCost(def, upg, ts.prestige, level, this.bonus);
      if (ts.wallet - cost < reserve) continue;
      const core = CORE_UPGRADES.includes(upg.id);
      if (!best || (core && !best.core) || (core === best.core && cost < best.cost)) best = { id: upg.id, cost, core };
    }
    if (best === null || !this.buyUpgrade(id, best.id)) return false;
    if (!this.quiet) {
      const name = allUpgrades(def).find((u) => u.id === best!.id)?.name ?? best.id;
      const text = `🤵 Floor Manager bought ${name} Lv ${ts.levels[best.id] ?? 0} (${def.name})`;
      this.managerLog.push({ seq: ++this.seq, text, table: id, upgradeId: best.id, at: Date.now() });
      if (this.managerLog.length > 20) this.managerLog.shift();
    }
    return true;
  }

  /** One manager pass at a table: (Concierge, if enabled) prestige as soon as possible, otherwise buy an upgrade. */
  private managerStep(id: TableId): boolean {
    if (this.casinoLevel('concierge') >= 1 && this.prestige(id)) {
      if (!this.quiet) {
        const def = TABLES[id];
        const text = `🤵 Floor Manager prestiged ${def.name} (Prestige ${this.state.tables[id].prestige})`;
        this.managerLog.push({ seq: ++this.seq, text, table: id, upgradeId: 'prestige', at: Date.now() });
        if (this.managerLog.length > 20) this.managerLog.shift();
      }
      return true;
    }
    return this.autoBuy(id);
  }

  private runManager(dt: number): void {
    const interval = this.managerInterval();
    if (interval <= 0) return;
    for (const id of TABLE_IDS) {
      if (!this.state.tables[id].unlocked) continue;
      this.managerClock[id] += dt;
      // Several steps at most per call so a long frame can't spin.
      for (let i = 0; i < 20 && this.managerClock[id] >= interval; i++) {
        this.managerClock[id] -= interval;
        this.managerStep(id);
      }
      if (this.managerClock[id] > interval) this.managerClock[id] = interval;
    }
  }

  /** If a table's wallet can't cover its minimum bet, the house comps that table some chips. */
  private bailout(): void {
    for (const id of TABLE_IDS) {
      const ts = this.state.tables[id];
      if (!ts.unlocked) continue;
      // Only the first table bets from its own wallet; the others are starved, never comped (chips would be free money).
      if (previousTable(id)) continue;
      const lowest = minBet(TABLES[id], ts.prestige);
      if (ts.wallet >= lowest) continue;
      ts.wallet = lowest * BAILOUT_BETS;
      this.say(`Busted at ${TABLES[id].name}! The pit boss slides you a few comp ${TABLES[id].currency.name}.`);
    }
  }

  /** Wallet of the table whose currency pays for unlocking `id`, or null if that table isn't available yet. */
  unlockPayer(id: TableId): TableState | null {
    const prev = previousTable(id);
    if (!prev) return null;
    const payer = this.state.tables[prev];
    return payer.unlocked ? payer : null;
  }

  /** Whether the player may see `id`: it is unlocked, or it is the next table to unlock. Later tables stay a mystery. */
  tableVisible(id: TableId): boolean {
    const prev = previousTable(id);
    return this.state.tables[id].unlocked || prev === null || this.state.tables[prev].unlocked;
  }

  /** Whether the casino (ascension and shop) has been reached: ascension is available (by peak wallet) or the player has ascended. */
  casinoVisible(): boolean {
    const c = this.state.casino;
    return this.canAscend() || c.ascensions > 0 || c.totalChips > 0;
  }

  canUnlock(id: TableId): boolean {
    const payer = this.unlockPayer(id);
    return !this.state.tables[id].unlocked && payer !== null && payer.wallet >= TABLES[id].unlockCost;
  }

  /** Pays the previous table's wallet and opens the table with a starter wallet of its own currency. */
  unlock(id: TableId): boolean {
    if (!this.canUnlock(id)) return false;
    const def = TABLES[id];
    const ts = this.state.tables[id];
    this.unlockPayer(id)!.wallet -= def.unlockCost;
    ts.unlocked = true;
    ts.wallet = starterWallet(def);
    return true;
  }

  upgradeLevel(id: TableId, upgradeId: string): number {
    return this.state.tables[id].levels[upgradeId] ?? 0;
  }

  /** What `mode` would buy of one table upgrade right now: levels, total cost, and the next single level's cost. */
  quoteUpgrade(id: TableId, upgradeId: string, mode: BuyMode = SINGLE_BUY): { count: number; cost: number; nextCost: number } {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    const upg = allUpgrades(def).find((u) => u.id === upgradeId);
    if (!upg || !ts.unlocked) return { count: 0, cost: 0, nextCost: 0 };
    const level = ts.levels[upgradeId] ?? 0;
    const costAt = (l: number): number => upgradeCost(def, upg, ts.prestige, l, this.bonus);
    const { count, cost } = bulkPurchase(costAt, level, upg.maxLevel, ts.wallet * mode.fraction, mode.cap);
    return { count, cost, nextCost: level < upg.maxLevel ? costAt(level) : 0 };
  }

  buyUpgrade(id: TableId, upgradeId: string, mode: BuyMode = SINGLE_BUY): boolean {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    const { count, cost } = this.quoteUpgrade(id, upgradeId, mode);
    if (count <= 0) return false;
    this.tickCtx = this.tickCtx && {};
    ts.wallet -= cost;
    ts.levels[upgradeId] = (ts.levels[upgradeId] ?? 0) + count;
    this.announce(observeUpgrades(this.state.achievements, id, allUpgrades(def), ts.levels));
    return true;
  }

  /** Cheapest affordable level of any upgrade at a table, or null. */
  private cheapestUpgrade(id: TableId): string | null {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    let best: { id: string; cost: number } | null = null;
    for (const upg of allUpgrades(def)) {
      const level = ts.levels[upg.id] ?? 0;
      if (level >= upg.maxLevel) continue;
      const cost = upgradeCost(def, upg, ts.prestige, level, this.bonus);
      if (cost <= ts.wallet && (!best || cost < best.cost)) best = { id: upg.id, cost };
    }
    return best?.id ?? null;
  }

  /** Whether any upgrade at the table is currently affordable. */
  canBuyCheapest(id: TableId): boolean {
    return this.casinoLevel('bulkbuy') >= 1 && this.state.tables[id].unlocked && this.cheapestUpgrade(id) !== null;
  }

  /** Repeatedly buys the cheapest affordable upgrade level until the wallet can't cover another. */
  buyCheapest(id: TableId): number {
    if (this.casinoLevel('bulkbuy') < 1) return 0;
    let bought = 0;
    for (let next = this.cheapestUpgrade(id); next && bought < 10000; next = this.cheapestUpgrade(id)) {
      if (!this.buyUpgrade(id, next)) break;
      bought++;
    }
    return bought;
  }

  /** Progress (0..1) of this run's profit toward the next prestige threshold. */
  prestigeProgress(id: TableId): number {
    const ts = this.state.tables[id];
    if (!ts.unlocked) return 0;
    return Math.min(1, Math.max(0, ts.profit / prestigeThreshold(TABLES[id], ts.prestige, this.bonus)));
  }

  canPrestige(id: TableId): boolean {
    const ts = this.state.tables[id];
    return ts.unlocked && ts.profit >= prestigeThreshold(TABLES[id], ts.prestige, this.bonus);
  }

  /** Resets the table's upgrades, wallet and run profit, permanently raising its stakes. */
  prestige(id: TableId): boolean {
    if (!this.canPrestige(id)) return false;
    this.tickCtx = this.tickCtx && {};
    const ts = this.state.tables[id];
    markPrestige(ts.history, ts.plays);
    ts.prestige += 1;
    ts.levels = {};
    ts.profit = 0;
    ts.streak = 0;
    ts.wallet = prestigeWallet(TABLES[id], ts.prestige);
    this.acc[id] = 0;
    return true;
  }

  canAscend(): boolean {
    return canAscendWith(this.ascensionMoney(), this.state.casino.ascensions);
  }

  /** Chips an ascension would grant right now (0 if the threshold isn't met). */
  ascendReward(): number {
    return ascensionReward(this.ascensionMoney(), this.state.casino.ascensions);
  }

  /** Resets every table (including history) and every wallet in exchange for casino chips. */
  ascend(): boolean {
    if (!this.canAscend()) return false;
    const reward = this.ascendReward();
    const casino = this.state.casino;
    casino.chips += reward;
    casino.totalChips += reward;
    casino.ascensions += 1;
    for (const id of TABLE_IDS) {
      const feedShare = this.state.tables[id].feedShare;
      this.state.tables[id] = newTableState(TABLES[id]);
      this.state.tables[id].feedShare = feedShare;
      this.acc[id] = 0;
      this.managerClock[id] = 0;
      delete this.last[id];
    }
    const first = this.state.tables[TABLE_IDS[0]];
    first.wallet = START_MONEY + this.bonus.startCash;
    this.say(`Ascended! +${reward} casino chips.`);
    return true;
  }

  casinoLevel(upgradeId: string): number {
    return this.state.casino.levels[upgradeId] ?? 0;
  }

  /** Chip price of a casino upgrade level; free in dev mode. */
  casinoUpgradeCostFor(upg: Parameters<typeof casinoUpgradeCost>[0], level: number): number {
    return this.freeCasinoShop ? 0 : casinoUpgradeCost(upg, level);
  }

  /** What `mode` would buy of one casino upgrade right now (`locked` when its requirement is unmet). */
  quoteCasinoUpgrade(
    upgradeId: string,
    mode: BuyMode = SINGLE_BUY,
  ): { count: number; cost: number; nextCost: number; locked: boolean } {
    const upg = CASINO_UPGRADES.find((u) => u.id === upgradeId);
    if (!upg) return { count: 0, cost: 0, nextCost: 0, locked: false };
    const casino = this.state.casino;
    const level = casino.levels[upgradeId] ?? 0;
    const locked = !!upg.requires && (casino.levels[upg.requires.id] ?? 0) < upg.requires.level;
    const costAt = (l: number): number => this.casinoUpgradeCostFor(upg, l);
    const nextCost = level < upg.maxLevel ? costAt(level) : 0;
    if (locked) return { count: 0, cost: 0, nextCost, locked };
    const { count, cost } = bulkPurchase(costAt, level, upg.maxLevel, casino.chips * mode.fraction, mode.cap);
    return { count, cost, nextCost, locked };
  }

  buyCasinoUpgrade(upgradeId: string, mode: BuyMode = SINGLE_BUY): boolean {
    const { count, cost } = this.quoteCasinoUpgrade(upgradeId, mode);
    if (count <= 0) return false;
    const casino = this.state.casino;
    casino.chips -= cost;
    casino.levels[upgradeId] = (casino.levels[upgradeId] ?? 0) + count;
    return true;
  }

  /** Offline, the manager gets the purchases it would have made (bounded, at the table's current wallet). */
  private offlineManager(id: TableId, seconds: number): void {
    const interval = this.managerInterval();
    if (interval <= 0) return;
    const steps = Math.min(100, Math.floor(seconds / interval));
    this.quiet = true;
    try {
      for (let i = 0; i < steps; i++) {
        if (!this.managerStep(id)) break;
      }
    } finally {
      this.quiet = false;
    }
  }

  /** Approximates play for time spent away using an expected-value estimate. */
  applyOffline(seconds: number): OfflineReport {
    const report: OfflineReport = { seconds, plays: 0, net: 0 };
    const bonus = this.bonus;
    const cap = OFFLINE_CAP_SECONDS + bonus.offlineHours * 3600;
    const efficiency = Math.min(1, OFFLINE_EFFICIENCY + bonus.offlineEfficiency);
    const effective = Math.min(Math.max(seconds, 0), cap);
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const ts = this.state.tables[id];
      if (!ts.unlocked) continue;
      this.offlineManager(id, effective * efficiency);
      let plays = Math.floor(effectivePlaysPerSecond(ts.levels, bonus) * effective * efficiency);
      if (plays <= 0) continue;
      const bet = chooseAutoBet(def, ts, this.stakeBudget(id));
      if (bet <= 0) continue;
      const source = this.stakeSource(id);
      const fed = previousTable(id) !== null;
      // Stakes come out of the stake wallet; it can only fund as many plays as the fed share covers.
      const price = this.stakePrice(id, bet);
      if (fed) plays = Math.min(plays, Math.floor(this.feedable(id) / price));
      if (plays <= 0) continue;
      const avg = estimateNetPerPlay(def, this.levelsFor(id), ts.prestige, bet, mulberry32(1337), 2000, this.bonusFor(id));
      const net = Math.round(avg * plays);
      // A fed table's wallet receives only winnings; the stakes were paid from the stake wallet.
      const applied = fed ? net : Math.max(net, -ts.wallet);
      if (fed) {
        source.wallet -= price * plays;
        ts.wallet += Math.max(0, net);
      } else {
        ts.wallet += applied;
      }
      ts.profit += applied;
      ts.lifetimeProfit += applied;
      ts.plays += plays;
      recordSample(ts.history, ts.plays, ts.lifetimeProfit, true);
      skipRate(ts.history, effective, ts.lifetimeProfit);
      report.plays += plays;
      report.net += applied;
    }
    this.bailout();
    this.trackPeak();
    return report;
  }

  /** Dev tool: unlocks every table, grants the Floor Manager upgrades, funds every table to max out its upgrades, and reaches the ascension threshold. Leaves prestige, achievements and chips alone. */
  devUnlockAll(): void {
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const ts = this.state.tables[id];
      ts.unlocked = true;
      // Enough to buy every remaining upgrade level at once, with the manager's bet reserve on top.
      let maxAll = minBet(def, ts.prestige) * MANAGER_RESERVE_BETS;
      for (const upg of allUpgrades(def)) {
        for (let l = ts.levels[upg.id] ?? 0; l < upg.maxLevel; l++) maxAll += upgradeCost(def, upg, ts.prestige, l, this.bonus);
      }
      ts.wallet = Math.max(ts.wallet, def.baseMinBet * DEV_WALLET_BETS, maxAll);
    }
    // Hand over the Floor Manager line so it can be exercised; table upgrades stay unbought for it to work through.
    for (const upg of CASINO_UPGRADES) {
      if (['manager', 'overtime', 'concierge'].includes(upg.id)) this.state.casino.levels[upg.id] = upg.maxLevel;
    }
    const final = this.state.tables[FINAL_TABLE];
    const need = ascensionThreshold(this.state.casino.ascensions);
    final.wallet = Math.max(final.wallet, need);
    final.peakWallet = Math.max(final.peakWallet, need);
  }

  /** Estimated net per second at the current settings (for display). */
  incomeEstimate(id: TableId): number {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    const bonus = this.bonus;
    const rate = effectivePlaysPerSecond(ts.levels, bonus);
    const bet = chooseAutoBet(def, ts, this.stakeBudget(id));
    if (bet <= 0) return 0;
    const levels = this.levelsFor(id);
    const bonusFor = this.bonusFor(id);
    // The estimate is deterministic (fixed seed), so reuse it until an input changes.
    const key = JSON.stringify([levels, ts.prestige, bet, bonusFor]);
    const hit = this.estimateCache[id];
    if (hit && hit.key === key) return rate * hit.net;
    const net = estimateNetPerPlay(def, levels, ts.prestige, bet, mulberry32(7), 400, bonusFor);
    this.estimateCache[id] = { key, net };
    return rate * net;
  }
}
