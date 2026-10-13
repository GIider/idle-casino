import type { AutoStrategy, GameState, Rng, TableDef, TableId, TableState } from './types';
import { TABLES, TABLE_IDS } from '../tables';
import { mulberry32 } from './rng';
import {
  BAILOUT_BETS,
  MAX_AUTO_PLAYS_PER_TICK,
  OFFLINE_CAP_SECONDS,
  OFFLINE_EFFICIENCY,
  allUpgrades,
  autoPlaysPerSecond,
  chooseAutoBet,
  clampBet,
  estimateNetPerPlay,
  minBet,
  prestigeThreshold,
  resolvePlay,
  upgradeCost,
  type Outcome,
} from './economy';
import { newTableState } from './state';

export interface LastPlay {
  seq: number;
  outcome: Outcome;
  auto: boolean;
}

export interface OfflineReport {
  seconds: number;
  plays: number;
  net: number;
}

export class Game {
  state: GameState;
  last: Partial<Record<TableId, LastPlay>> = {};
  /** Cumulative net winnings this session; the UI derives income/sec from it. */
  sessionNet = 0;
  notice: { text: string; seq: number } | null = null;
  private seq = 0;
  private acc: Record<TableId, number> = { coinflip: 0, slots: 0, roulette: 0, blackjack: 0 };

  constructor(state: GameState, private rng: Rng = Math.random) {
    this.state = state;
  }

  def(id: TableId): TableDef {
    return TABLES[id];
  }

  table(id: TableId): TableState {
    return this.state.tables[id];
  }

  private say(text: string): void {
    this.notice = { text, seq: ++this.seq };
  }

  /** Plays one round. Returns null if the bet is invalid or unaffordable. */
  play(id: TableId, bet?: number, auto = false): Outcome | null {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    if (!ts.unlocked) return null;
    const stake = clampBet(def, ts.prestige, bet ?? ts.bet);
    if (this.state.money < stake) return null;

    this.state.money -= stake;
    const outcome = resolvePlay(def, ts.levels, ts.prestige, ts.option, stake, this.rng);
    this.state.money += outcome.payout;
    ts.plays++;
    ts.profit += outcome.net;
    ts.lifetimeProfit += outcome.net;
    this.sessionNet += outcome.net;
    this.last[id] = { seq: ++this.seq, outcome, auto };
    if (!auto) this.bailout();
    return outcome;
  }

  /** Advances auto-players by `dt` seconds. */
  tick(dt: number): void {
    for (const id of TABLE_IDS) {
      const ts = this.state.tables[id];
      if (!ts.unlocked) continue;
      const rate = autoPlaysPerSecond(ts.levels);
      if (rate <= 0) {
        this.acc[id] = 0;
        continue;
      }
      this.acc[id] += rate * dt;
      let n = Math.floor(this.acc[id]);
      this.acc[id] -= n;
      n = Math.min(n, MAX_AUTO_PLAYS_PER_TICK);
      const def = TABLES[id];
      for (let i = 0; i < n; i++) {
        const bet = chooseAutoBet(def, ts, this.state.money);
        if (bet <= 0) break;
        this.play(id, bet, true);
      }
    }
    this.bailout();
  }

  /** If the player can't afford any table's minimum bet, the house comps them some chips. */
  private bailout(): void {
    let lowest = Infinity;
    for (const id of TABLE_IDS) {
      const ts = this.state.tables[id];
      if (ts.unlocked) lowest = Math.min(lowest, minBet(TABLES[id], ts.prestige));
    }
    if (this.state.money < lowest) {
      this.state.money = lowest * BAILOUT_BETS;
      this.say('Busted! The pit boss slides you a few comp chips.');
    }
  }

  setBet(id: TableId, bet: number): void {
    const ts = this.state.tables[id];
    ts.bet = clampBet(TABLES[id], ts.prestige, bet);
  }

  setOption(id: TableId, option: string): void {
    if (TABLES[id].options?.some((o) => o.id === option)) this.state.tables[id].option = option;
  }

  setStrategy(id: TableId, strategy: AutoStrategy): void {
    this.state.tables[id].autoStrategy = strategy;
  }

  unlock(id: TableId): boolean {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    if (ts.unlocked || this.state.money < def.unlockCost) return false;
    this.state.money -= def.unlockCost;
    ts.unlocked = true;
    return true;
  }

  upgradeLevel(id: TableId, upgradeId: string): number {
    return this.state.tables[id].levels[upgradeId] ?? 0;
  }

  buyUpgrade(id: TableId, upgradeId: string): boolean {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    const upg = allUpgrades(def).find((u) => u.id === upgradeId);
    if (!upg || !ts.unlocked) return false;
    const level = ts.levels[upgradeId] ?? 0;
    if (level >= upg.maxLevel) return false;
    const cost = upgradeCost(def, upg, ts.prestige, level);
    if (this.state.money < cost) return false;
    this.state.money -= cost;
    ts.levels[upgradeId] = level + 1;
    return true;
  }

  canPrestige(id: TableId): boolean {
    const ts = this.state.tables[id];
    return ts.unlocked && ts.profit >= prestigeThreshold(TABLES[id], ts.prestige);
  }

  /** Resets the table's upgrades and run profit, permanently raising its stakes. */
  prestige(id: TableId): boolean {
    if (!this.canPrestige(id)) return false;
    const def = TABLES[id];
    const ts = this.state.tables[id];
    const fresh = newTableState(def);
    ts.prestige += 1;
    ts.levels = {};
    ts.profit = 0;
    ts.bet = clampBet(def, ts.prestige, fresh.bet);
    ts.autoStrategy = 'pct';
    this.acc[id] = 0;
    this.bailout();
    return true;
  }

  /** Approximates auto-play for time spent away using an expected-value estimate. */
  applyOffline(seconds: number): OfflineReport {
    const report: OfflineReport = { seconds, plays: 0, net: 0 };
    const effective = Math.min(Math.max(seconds, 0), OFFLINE_CAP_SECONDS);
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const ts = this.state.tables[id];
      if (!ts.unlocked) continue;
      const plays = Math.floor(autoPlaysPerSecond(ts.levels) * effective * OFFLINE_EFFICIENCY);
      if (plays <= 0) continue;
      const bet = chooseAutoBet(def, ts, this.state.money);
      if (bet <= 0) continue;
      const avg = estimateNetPerPlay(def, ts.levels, ts.prestige, ts.option, bet, mulberry32(1337));
      const net = Math.round(avg * plays);
      const applied = Math.max(net, -this.state.money);
      this.state.money += applied;
      ts.profit += applied;
      ts.lifetimeProfit += applied;
      ts.plays += plays;
      report.plays += plays;
      report.net += applied;
    }
    this.bailout();
    return report;
  }

  /** Estimated net per second from auto-players at the current settings (for display). */
  incomeEstimate(id: TableId): number {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    const rate = autoPlaysPerSecond(ts.levels);
    if (rate <= 0) return 0;
    const bet = chooseAutoBet(def, ts, this.state.money);
    if (bet <= 0) return 0;
    return rate * estimateNetPerPlay(def, ts.levels, ts.prestige, ts.option, bet, mulberry32(7), 400);
  }
}
