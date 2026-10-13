import type { GameState, Rng, TableDef, TableId, TableState } from './types';
import { FINAL_TABLE, TABLES, TABLE_IDS, previousTable } from '../tables';
import { mulberry32 } from './rng';
import {
  BAILOUT_BETS,
  CROSS_PRESTIGE_BONUS,
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
import { START_MONEY, casinoValue, newTableState, starterWallet } from './state';
import { observeRound, observeUpgrades, perkLevels, RARITIES, type AchievementDef } from './achievements';
import { addContribution, markPrestige, recordSample, recordView, sampleContribution } from './history';
import {
  CASINO_UPGRADES,
  ascensionReward,
  canAscendWith,
  casinoBonus,
  casinoUpgradeCost,
  type CasinoBonus,
} from './casino';

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
  /** Cumulative net winnings per table this session; the UI derives income/sec from it. */
  sessionNet: Record<TableId, number> = { coinflip: 0, slots: 0, roulette: 0, blackjack: 0 };
  notice: { text: string; seq: number } | null = null;
  private seq = 0;
  private acc: Record<TableId, number> = { coinflip: 0, slots: 0, roulette: 0, blackjack: 0 };

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

  /** Plays one round. Returns null if the bet is invalid or unaffordable. */
  play(id: TableId, bet?: number, auto = false): Outcome | null {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    if (!ts.unlocked) return null;
    const stake = clampBet(def, ts.prestige, bet ?? ts.bet);
    if (ts.wallet < stake) return null;

    ts.wallet -= stake;
    const outcome = resolvePlay(def, this.levelsFor(id), ts.prestige, ts.option, stake, this.rng, this.bonusFor(id));
    ts.wallet += outcome.payout;
    ts.plays++;
    ts.profit += outcome.net;
    ts.lifetimeProfit += outcome.net;
    recordSample(ts.history, ts.plays, ts.lifetimeProfit);
    recordView(ts.history, outcome.view);
    this.announce(observeRound(this.state.achievements, id, outcome));
    this.sessionNet[id] += outcome.net;
    this.last[id] = { seq: ++this.seq, outcome, auto };
    this.state.bankroll.rounds++;
    recordSample(this.state.bankroll, this.state.bankroll.rounds, casinoValue(this.state.tables));
    addContribution(this.state.bankroll, id, outcome.net);
    sampleContribution(this.state.bankroll);
    if (!auto) this.bailout();
    return outcome;
  }

  /** Advances auto-players by `dt` seconds. */
  tick(dt: number): void {
    const bonus = this.bonus;
    for (const id of TABLE_IDS) {
      const ts = this.state.tables[id];
      if (!ts.unlocked) continue;
      const rate = autoPlaysPerSecond(ts.levels, bonus);
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
        const bet = chooseAutoBet(def, ts);
        if (bet <= 0) break;
        this.play(id, bet, true);
      }
    }
    this.bailout();
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

  setBet(id: TableId, bet: number): void {
    const ts = this.state.tables[id];
    ts.bet = clampBet(TABLES[id], ts.prestige, bet);
  }

  setOption(id: TableId, option: string): void {
    if (TABLES[id].options?.some((o) => o.id === option)) this.state.tables[id].option = option;
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

  /** Resets the table's upgrades and run profit, permanently raising its stakes. */
  prestige(id: TableId): boolean {
    if (!this.canPrestige(id)) return false;
    const def = TABLES[id];
    const ts = this.state.tables[id];
    const fresh = newTableState(def);
    markPrestige(ts.history, ts.plays);
    ts.prestige += 1;
    ts.levels = {};
    ts.profit = 0;
    ts.bet = clampBet(def, ts.prestige, fresh.bet);
    this.acc[id] = 0;
    this.bailout();
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
    const cost = casinoUpgradeCost(upg, level);
    if (casino.chips < cost) return false;
    casino.chips -= cost;
    casino.levels[upgradeId] = level + 1;
    return true;
  }

  /** Approximates auto-play for time spent away using an expected-value estimate. */
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
      const plays = Math.floor(autoPlaysPerSecond(ts.levels, bonus) * effective * efficiency);
      if (plays <= 0) continue;
      const bet = chooseAutoBet(def, ts);
      if (bet <= 0) continue;
      const avg = estimateNetPerPlay(def, this.levelsFor(id), ts.prestige, ts.option, bet, mulberry32(1337), 2000, this.bonusFor(id));
      const net = Math.round(avg * plays);
      const applied = Math.max(net, -ts.wallet);
      ts.wallet += applied;
      ts.profit += applied;
      ts.lifetimeProfit += applied;
      ts.plays += plays;
      addContribution(this.state.bankroll, id, applied);
      recordSample(ts.history, ts.plays, ts.lifetimeProfit, true);
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

  /** Estimated net per second from auto-players at the current settings (for display). */
  incomeEstimate(id: TableId): number {
    const def = TABLES[id];
    const ts = this.state.tables[id];
    const bonus = this.bonus;
    const rate = autoPlaysPerSecond(ts.levels, bonus);
    if (rate <= 0) return 0;
    const bet = chooseAutoBet(def, ts);
    if (bet <= 0) return 0;
    return rate * estimateNetPerPlay(def, this.levelsFor(id), ts.prestige, ts.option, bet, mulberry32(7), 400, this.bonusFor(id));
  }
}
