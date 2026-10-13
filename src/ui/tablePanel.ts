import type { TableId, UpgradeDef } from '../core/types';
import type { Game } from '../core/game';
import {
  allUpgrades,
  autoBetFraction,
  chooseAutoBet,
  effectivePlaysPerSecond,
  luckChance,
  maxBet,
  maxPayout,
  minBet,
  payoutMultiplier,
  prestigeThreshold,
  CROSS_PRESTIGE_BONUS,
  upgradeCost,
} from '../core/economy';
import { h, setDisabled, setText, toggleClass } from './dom';
import { fmt, fmtSigned } from './format';
import { TABLE_IDS, previousTable } from '../tables';
import { prestigeWallet, starterWallet } from '../core/state';
import { Stage } from './stage/stage';
import { HistoryChart } from './historyChart';
import { AchievementsCard } from './achievementsPanel';

interface UpgradeRow {
  def: UpgradeDef;
  root: HTMLElement;
  level: HTMLElement;
  button: HTMLButtonElement;
  /** Floor Manager switch (Purchasing Policy): whether the manager may buy this upgrade. */
  auto: HTMLLabelElement;
  autoBox: HTMLInputElement;
}

export class TablePanel {
  readonly root: HTMLElement;
  private id: TableId;
  private game: Game;

  private locked: HTMLElement;
  private unlockBtn: HTMLButtonElement;
  private unlockNote: HTMLElement;
  private body: HTMLElement;

  private statsEl: HTMLElement;
  private stage: HTMLElement;
  private resultEl: HTMLElement;
  private netEl: HTMLElement;
  private autoInfo: HTMLElement;
  private rows: UpgradeRow[] = [];
  private prestigeText: HTMLElement;
  private prestigeBar: HTMLElement;
  private prestigeBtn: HTMLButtonElement;
  private seenSeq = 0;
  private canvasStage: Stage;
  private history: HistoryChart;
  private achievements: AchievementsCard;

  constructor(game: Game, id: TableId) {
    this.game = game;
    this.id = id;
    this.history = new HistoryChart(id);
    this.achievements = new AchievementsCard(game, id);
    const def = game.def(id);

    // Locked view
    this.unlockBtn = h('button', { class: 'btn primary', onclick: () => game.unlock(id) });
    this.unlockNote = h('p', { class: 'unlock-note' });
    this.locked = h(
      'div',
      { class: 'locked' },
      h('div', { class: 'big-icon', text: def.icon }),
      h('h2', { text: def.name }),
      h('p', { text: def.blurb }),
      this.unlockBtn,
      this.unlockNote,
    );

    // Play area
    this.statsEl = h('div', { class: 'stats' });
    this.resultEl = h('div', { class: 'result', text: 'Place your bet' });
    this.netEl = h('div', { class: 'net', text: ' ' });
    this.canvasStage = new Stage(def.icon, id);
    this.resultEl.setAttribute('aria-live', 'polite');
    this.stage = h('div', { class: 'stage' }, this.canvasStage.canvas, this.resultEl, this.netEl);

    this.autoInfo = h('div', { class: 'auto-info' });
    const auto = h('div', { class: 'card' }, h('h3', { text: 'Auto-play' }), this.autoInfo);

    // Upgrades
    const upgrades = h('div', { class: 'card upgrades' }, h('h3', { text: 'Upgrades' }));
    for (const u of allUpgrades(def)) {
      const level = h('span', { class: 'level' });
      const button = h('button', { class: 'btn buy', onclick: () => game.buyUpgrade(id, u.id) });
      const autoBox = h('input', {
        type: 'checkbox',
        onchange: () => game.setAutoBuy(id, u.id, autoBox.checked),
      });
      const auto = h('label', { class: 'auto-buy hidden', title: 'Let the Floor Manager buy this upgrade' }, autoBox, ' auto');
      const root = h(
        'div',
        { class: 'upgrade' },
        h('div', { class: 'upgrade-text' }, h('div', {}, h('strong', { text: u.name }), ' ', level), h('small', { text: u.description })),
        auto,
        button,
      );
      upgrades.append(root);
      this.rows.push({ def: u, root, level, button, auto, autoBox });
    }

    // Prestige
    this.prestigeText = h('div', { class: 'prestige-text' });
    this.prestigeBar = h('div', { class: 'bar-fill' });
    this.prestigeBtn = h('button', {
      class: 'btn prestige',
      text: 'Prestige table',
      onclick: () => {
        const next = game.table(id).prestige + 1;
        if (
          game.canPrestige(id) &&
          window.confirm(
            `Prestige ${def.name}? Its upgrades and wallet reset, but its minimum bet and maximum payout rise (level ${next}).`,
          )
        ) {
          game.prestige(id);
        }
      },
    });
    const prestige = h(
      'div',
      { class: 'card' },
      h('h3', { text: 'Prestige' }),
      this.prestigeText,
      h('div', { class: 'bar' }, this.prestigeBar),
      this.prestigeBtn,
    );

    this.body = h(
      'div',
      { class: 'table-body' },
      h(
        'div',
        { class: 'col main' },
        h('div', { class: 'card header-card' }, h('h2', { text: `${def.icon} ${def.name}` }), h('p', { text: def.blurb }), this.statsEl),
        h('div', { class: 'card play-card' }, this.stage),
        auto,
      ),
      h('div', { class: 'col side' }, upgrades, prestige, this.achievements.root, this.history.root),
    );

    this.root = h('section', { class: 'panel' }, this.locked, this.body);
  }

  update(): void {
    const { game, id } = this;
    const def = game.def(id);
    const ts = game.table(id);
    const money = ts.wallet;
    const cur = def.currency;

    toggleClass(this.locked, 'hidden', ts.unlocked);
    toggleClass(this.body, 'hidden', !ts.unlocked);
    if (!ts.unlocked) {
      const prev = previousTable(id);
      const prevDef = prev ? game.def(prev) : null;
      const payer = game.unlockPayer(id);
      setText(this.unlockBtn, `Unlock for ${fmt(def.unlockCost)} ${prevDef?.currency.name ?? ''}`.trim());
      setDisabled(this.unlockBtn, !game.canUnlock(id));
      setText(
        this.unlockNote,
        prevDef
          ? payer
            ? `Paid from your ${prevDef.name} wallet: ${fmt(payer.wallet)} ${prevDef.currency.name} so far. You'll start here with ${fmt(starterWallet(def))} ${cur.name}.`
            : `Unlock ${prevDef.name} first.`
          : '',
      );
      return;
    }

    const lo = minBet(def, ts.prestige);
    const hi = maxBet(def, ts.prestige);
    setText(
      this.statsEl,
      `Wallet ${fmt(ts.wallet)} ${cur.icon} ${cur.name} · Prestige ${ts.prestige} · ${fmt(ts.plays)} plays · run profit ${fmtSigned(ts.profit)} · luck ${(luckChance(ts.levels, game.bonus) * 100).toFixed(1)}% · winnings ×${payoutMultiplier(game.levelsFor(id), ts.prestige, game.bonusFor(id), def.baseWinBonus, ts.streak).toFixed(2)}${ts.levels.streak ? ` · streak ${ts.streak}` : ''}`,
    );

    const bonus = game.bonus;
    const rate = effectivePlaysPerSecond(ts.levels, bonus);
    const frac = autoBetFraction(ts.levels);
    const bet = chooseAutoBet(def, ts);
    const betText = frac > 0 ? `${(frac * 100).toFixed(1).replace(/\.0$/, '')}% of wallet` : 'minimum bet';
    setText(
      this.autoInfo,
      `${rate.toFixed(1)} plays/sec · bet ${fmt(bet || lo)} ${cur.name} (${betText}, limits ${fmt(lo)}–${fmt(hi)}) · ` +
        `max payout per play ${fmt(maxPayout(def, ts.prestige))} · ≈ ${fmtSigned(Math.round(game.incomeEstimate(id)))}/sec`,
    );

    const toggles = game.casinoLevel('policy') >= 1;
    for (const row of this.rows) {
      toggleClass(row.auto, 'hidden', !toggles);
      const enabled = game.autoBuyEnabled(id, row.def.id);
      if (row.autoBox.checked !== enabled) row.autoBox.checked = enabled;
      const level = ts.levels[row.def.id] ?? 0;
      const maxed = level >= row.def.maxLevel;
      setText(row.level, `Lv ${level}/${row.def.maxLevel}`);
      if (maxed) {
        setText(row.button, 'Maxed');
        setDisabled(row.button, true);
      } else {
        const cost = upgradeCost(def, row.def, ts.prestige, level, game.bonus);
        setText(row.button, fmt(cost));
        setDisabled(row.button, money < cost);
      }
    }

    const threshold = prestigeThreshold(def, ts.prestige, game.bonus);
    const nextId = TABLE_IDS[TABLE_IDS.indexOf(id) + 1];
    const feeds = nextId ? ` Each level also gives ${game.def(nextId).name} +${CROSS_PRESTIGE_BONUS * 100}% winnings.` : '';
    const progress = Math.max(0, Math.min(1, ts.profit / threshold));
    setText(
      this.prestigeText,
      `Earn ${fmt(threshold)} ${cur.name} profit at this table to prestige (${fmt(Math.max(0, ts.profit))} so far). ` +
        `Next level: min bet ${fmt(minBet(def, ts.prestige + 1))}, max payout ${fmt(maxPayout(def, ts.prestige + 1))}, +10% winnings; wallet resets to ${fmt(prestigeWallet(def, ts.prestige + 1))} ${cur.name}.${feeds}`,
    );
    this.prestigeBar.style.width = `${(progress * 100).toFixed(1)}%`;
    setDisabled(this.prestigeBtn, !game.canPrestige(id));

    this.canvasStage.setPlayers(1 + Math.floor((ts.levels.speed ?? 0) / 4));
    this.canvasStage.resume();
    this.achievements.update();
    this.history.update(ts.history, ts.plays);

    const last = game.last[id];
    if (last && last.seq !== this.seenSeq) {
      this.seenSeq = last.seq;
      const o = last.outcome;
      setText(this.resultEl, o.detail);
      setText(this.netEl, `${fmtSigned(o.net)}${o.capped ? ' (max payout!)' : ''}`);
      this.stage.classList.remove('win', 'lose', 'push');
      this.stage.classList.add(o.net > 0 ? 'win' : o.net < 0 ? 'lose' : 'push');
      this.canvasStage.show(last, ts.levels);
    }
  }
}
