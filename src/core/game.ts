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
  type Outcome,
} from './economy';
import { START_MONEY, casinoValue, newTableState, prestigeWallet, starterWallet } from './state';
import { observeRound, observeUpgrades, perkLevels, RARITIES, type AchievementDef } from './achievements';
import { addContribution, markPrestige, recordRate, recordSample, recordView, sampleContribution } from './history';
import {
  CASINO_UPGRADES,
  MANAGER_RESERVE_BETS,
  ascensionReward,
  canAscendWith,
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

/** Wallet (in minimum bets) the dev unlock tops every table up to. */
const DEV_WALLET_BETS = 100000;

export class Game {
  state: GameState;
  last: Partial<Record<TableId, LastPlay>> = {};
  /** Cumulative net winnings per table this session; the UI derives income/sec from it. */
  sessionNet: Record<TableId, number> = { coinflip: 0, slots: 0, roulette: 0, blackjack: 0 };
  notice: { text: string; seq: number } | null = null;
  private seq = 0;
  private acc: Record<TableId, number> = { coinflip: 0, slots: 0, roulette: 0, blackjack: 0 };
  private managerClock: Record<TableId, number> = { coinflip: 0, slots: 0, roulette: 0, blackjack: 0 };

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

  /** Table upgrade levels plus the perks earned from achievements, as `TableDef.play` reads them. */
  levelsFor(id: TableId): Record<string, number> {
    return { ...this.state.tables[id].levels, ...perkLevels(this.state.achievements, id) };
  }

  private announce(gained: { def: AchievementDef; tier: number }[]): void {
    if (gained.length === 0) return;
    this.say(
      gained
        .map(({ def: a, tier }) =>
          a.kind === 'grind'
            ? `🏆 ${a.name}! ${a.perk.name}: ${a.perk.describe(tier)}`
            : `🏆 ${a.name} — ${RARITIES[tier - 1]}! ${a.perk.name}: ${a.perk.describe(tier)}`,
        )
        .join(' · '),
    );
  }

  private say(text: string): void {
    this.notice = { text, seq: ++this.seq };
  }

  /** Plays one round at the table's automatic stake. Returns null if the table is locked or can't afford it. */
  play(id: TableId): Outcome | null {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    if (!ts.unlocked) return null;
    const stake = chooseAutoBet(def, ts);
    if (stake <= 0) return null;

    ts.wallet -= stake;
    const outcome = resolvePlay(def, this.levelsFor(id), ts.prestige, stake, this.rng, this.bonusFor(id), ts.streak);
    ts.wallet += outcome.payout;
    ts.streak = nextStreak(ts.streak, outcome.net);
    ts.plays++;
    ts.profit += outcome.net;
    ts.lifetimeProfit += outcome.net;
    recordSample(ts.history, ts.plays, ts.lifetimeProfit);
    recordView(ts.history, outcome.view);
    this.announce(observeRound(this.state.achievements, id, outcome));
    this.sessionNet[id] += outcome.net;
    this.last[id] = { seq: ++this.seq, outcome };
    this.state.bankroll.rounds++;
    recordSample(this.state.bankroll, this.state.bankroll.rounds, casinoValue(this.state.tables));
    addContribution(this.state.bankroll, id, outcome.net);
    sampleContribution(this.state.bankroll);
    return outcome;
  }

  /** Advances every unlocked table by `dt` seconds of play. */
  tick(dt: number): void {
    const bonus = this.bonus;
    for (const id of TABLE_IDS) {
      const ts = this.state.tables[id];
      if (!ts.unlocked) continue;
      this.acc[id] += autoPlaysPerSecond(ts.levels, bonus) * dt;
      let n = Math.floor(this.acc[id]);
      this.acc[id] -= n;
      n = Math.min(n, MAX_AUTO_PLAYS_PER_TICK);
      for (let i = 0; i < n; i++) {
        if (!this.play(id)) break;
        // Second Dealer: a play may immediately trigger another at the same table.
        const chance = dealerChance(ts.levels);
        for (let b = 0; b < MAX_BONUS_PLAYS && chance > 0 && this.rng() < chance; b++) {
          if (!this.play(id)) break;
        }
      }
      recordRate(ts.history, dt, ts.plays, ts.lifetimeProfit);
    }
    this.runManager(dt);
    this.bailout();
  }

  private managerInterval(): number {
    return managerInterval(this.casinoLevel('manager'), this.casinoLevel('overtime'));
  }

  /** Whether the Floor Manager may buy this upgrade (it is on unless switched off at manager level 3+). */
  autoBuyEnabled(id: TableId, upgradeId: string): boolean {
    return !this.state.casino.autoOff.includes(`${id}:${upgradeId}`);
  }

  /** Switches the Floor Manager's buying of one upgrade on or off. */
  setAutoBuy(id: TableId, upgradeId: string, on: boolean): void {
    if (this.casinoLevel('policy') < 1) return;
    const off = this.state.casino.autoOff;
    const key = `${id}:${upgradeId}`;
    const at = off.indexOf(key);
    if (on && at >= 0) off.splice(at, 1);
    if (!on && at < 0) off.push(key);
  }

  setAutoPrestige(on: boolean): void {
    if (this.casinoLevel('concierge') < 1) return;
    this.state.casino.autoPrestige = on;
  }

  /** The Floor Manager's purchase for one table: the cheapest enabled upgrade that leaves the bet reserve intact. */
  autoBuy(id: TableId): boolean {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    if (!ts.unlocked) return false;
    const reserve = minBet(def, ts.prestige) * MANAGER_RESERVE_BETS;
    let best: { id: string; cost: number } | null = null;
    for (const upg of allUpgrades(def)) {
      const level = ts.levels[upg.id] ?? 0;
      if (level >= upg.maxLevel || !this.autoBuyEnabled(id, upg.id)) continue;
      const cost = upgradeCost(def, upg, ts.prestige, level, this.bonus);
      if (ts.wallet - cost < reserve) continue;
      if (!best || cost < best.cost) best = { id: upg.id, cost };
    }
    return best !== null && this.buyUpgrade(id, best.id);
  }

  /** One manager pass at a table: buy an upgrade, otherwise (Concierge, if enabled) prestige. */
  private managerStep(id: TableId): boolean {
    if (this.autoBuy(id)) return true;
    return this.casinoLevel('concierge') >= 1 && this.state.casino.autoPrestige && this.prestige(id);
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
      const lowest = minBet(TABLES[id], ts.prestige);
      if (ts.wallet >= lowest) continue;
      ts.wallet = lowest * BAILOUT_BETS;
      this.say(`Busted at ${TABLES[id].name}! The pit boss slides you a few comp ${TABLES[id].currency.name}.`);
      const b = this.state.bankroll;
      recordSample(b, b.rounds, casinoValue(this.state.tables), true);
    }
  }

  /** Wallet of the table whose currency pays for unlocking `id`, or null if that table isn't available yet. */
  unlockPayer(id: TableId): TableState | null {
    const prev = previousTable(id);
    if (!prev) return null;
    const payer = this.state.tables[prev];
    return payer.unlocked ? payer : null;
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

  buyUpgrade(id: TableId, upgradeId: string): boolean {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    const upg = allUpgrades(def).find((u) => u.id === upgradeId);
    if (!upg || !ts.unlocked) return false;
    const level = ts.levels[upgradeId] ?? 0;
    if (level >= upg.maxLevel) return false;
    const cost = upgradeCost(def, upg, ts.prestige, level, this.bonus);
    if (ts.wallet < cost) return false;
    ts.wallet -= cost;
    ts.levels[upgradeId] = level + 1;
    this.announce(observeUpgrades(this.state.achievements, id, allUpgrades(def), ts.levels));
    return true;
  }

  canPrestige(id: TableId): boolean {
    const ts = this.state.tables[id];
    return ts.unlocked && ts.profit >= prestigeThreshold(TABLES[id], ts.prestige, this.bonus);
  }

  /** Resets the table's upgrades, wallet and run profit, permanently raising its stakes. */
  prestige(id: TableId): boolean {
    if (!this.canPrestige(id)) return false;
    const ts = this.state.tables[id];
    markPrestige(ts.history, ts.plays);
    ts.prestige += 1;
    ts.levels = {};
    ts.profit = 0;
    ts.streak = 0;
    ts.wallet = prestigeWallet(TABLES[id], ts.prestige);
    this.acc[id] = 0;
    const b = this.state.bankroll;
    recordSample(b, b.rounds, casinoValue(this.state.tables), true);
    return true;
  }

  canAscend(): boolean {
    return canAscendWith(this.state.tables[FINAL_TABLE].wallet, this.state.casino.ascensions);
  }

  /** Chips an ascension would grant right now (0 if the threshold isn't met). */
  ascendReward(): number {
    return ascensionReward(this.state.tables[FINAL_TABLE].wallet, this.state.casino.ascensions);
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
      this.state.tables[id] = newTableState(TABLES[id]);
      this.acc[id] = 0;
      this.managerClock[id] = 0;
      delete this.last[id];
    }
    markPrestige(this.state.bankroll, this.state.bankroll.rounds);
    const first = this.state.tables[TABLE_IDS[0]];
    first.wallet = START_MONEY + this.bonus.startCash;
    recordSample(this.state.bankroll, this.state.bankroll.rounds + 1, casinoValue(this.state.tables), true);
    this.state.bankroll.rounds++;
    sampleContribution(this.state.bankroll, true);
    this.say(`Ascended! +${reward} casino chips.`);
    return true;
  }

  casinoLevel(upgradeId: string): number {
    return this.state.casino.levels[upgradeId] ?? 0;
  }

  buyCasinoUpgrade(upgradeId: string): boolean {
    const upg = CASINO_UPGRADES.find((u) => u.id === upgradeId);
    if (!upg) return false;
    const casino = this.state.casino;
    const level = casino.levels[upgradeId] ?? 0;
    if (level >= upg.maxLevel) return false;
    if (upg.requires && (casino.levels[upg.requires.id] ?? 0) < upg.requires.level) return false;
    const cost = casinoUpgradeCost(upg, level);
    if (casino.chips < cost) return false;
    casino.chips -= cost;
    casino.levels[upgradeId] = level + 1;
    return true;
  }

  /** Offline, the manager gets the purchases it would have made (bounded, at the table's current wallet). */
  private offlineManager(id: TableId, seconds: number): void {
    const interval = this.managerInterval();
    if (interval <= 0) return;
    const steps = Math.min(100, Math.floor(seconds / interval));
    for (let i = 0; i < steps; i++) {
      if (!this.managerStep(id)) break;
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
      const plays = Math.floor(effectivePlaysPerSecond(ts.levels, bonus) * effective * efficiency);
      if (plays <= 0) continue;
      const bet = chooseAutoBet(def, ts);
      if (bet <= 0) continue;
      const avg = estimateNetPerPlay(def, this.levelsFor(id), ts.prestige, bet, mulberry32(1337), 2000, this.bonusFor(id));
      const net = Math.round(avg * plays);
      const applied = Math.max(net, -ts.wallet);
      ts.wallet += applied;
      ts.profit += applied;
      ts.lifetimeProfit += applied;
      ts.plays += plays;
      addContribution(this.state.bankroll, id, applied);
      recordSample(ts.history, ts.plays, ts.lifetimeProfit, true);
      recordRate(ts.history, effective, ts.plays, ts.lifetimeProfit, true);
      report.plays += plays;
      report.net += applied;
    }
    this.bailout();
    if (report.plays > 0) {
      this.state.bankroll.rounds += report.plays;
      recordSample(this.state.bankroll, this.state.bankroll.rounds, casinoValue(this.state.tables), true);
      sampleContribution(this.state.bankroll, true);
    }
    return report;
  }

  /** Dev tool: unlocks every table, maxes every upgrade and fills wallets. Leaves prestige, achievements and chips alone. */
  devUnlockAll(): void {
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const ts = this.state.tables[id];
      ts.unlocked = true;
      ts.wallet = Math.max(ts.wallet, def.baseMinBet * DEV_WALLET_BETS);
      for (const upg of allUpgrades(def)) ts.levels[upg.id] = upg.maxLevel;
      this.announce(observeUpgrades(this.state.achievements, id, allUpgrades(def), ts.levels));
    }
    const b = this.state.bankroll;
    recordSample(b, b.rounds, casinoValue(this.state.tables), true);
  }

  /** Estimated net per second at the current settings (for display). */
  incomeEstimate(id: TableId): number {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    const bonus = this.bonus;
    const rate = effectivePlaysPerSecond(ts.levels, bonus);
    const bet = chooseAutoBet(def, ts);
    if (bet <= 0) return 0;
    return rate * estimateNetPerPlay(def, this.levelsFor(id), ts.prestige, bet, mulberry32(7), 400, this.bonusFor(id));
  }
}
