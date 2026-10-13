import type { AutoStrategy, TableId, UpgradeDef } from '../core/types';
import type { Game } from '../core/game';
import {
  allUpgrades,
  autoPlaysPerSecond,
  luckChance,
  maxBet,
  maxPayout,
  minBet,
  payoutMultiplier,
  prestigeThreshold,
  upgradeCost,
} from '../core/economy';
import { flash, h, setDisabled, setText, toggleClass } from './dom';
import { fmt, fmtSigned } from './format';

interface UpgradeRow {
  def: UpgradeDef;
  root: HTMLElement;
  level: HTMLElement;
  button: HTMLButtonElement;
}

export class TablePanel {
  readonly root: HTMLElement;
  private id: TableId;
  private game: Game;

  private locked: HTMLElement;
  private unlockBtn: HTMLButtonElement;
  private body: HTMLElement;

  private statsEl: HTMLElement;
  private stage: HTMLElement;
  private resultEl: HTMLElement;
  private netEl: HTMLElement;
  private betInput: HTMLInputElement;
  private rangeEl: HTMLElement;
  private playBtn: HTMLButtonElement;
  private optionSelect: HTMLSelectElement | null = null;
  private strategySelect: HTMLSelectElement;
  private autoInfo: HTMLElement;
  private rows: UpgradeRow[] = [];
  private prestigeText: HTMLElement;
  private prestigeBar: HTMLElement;
  private prestigeBtn: HTMLButtonElement;
  private seenSeq = 0;

  constructor(game: Game, id: TableId) {
    this.game = game;
    this.id = id;
    const def = game.def(id);

    // Locked view
    this.unlockBtn = h('button', { class: 'btn primary', onclick: () => game.unlock(id) });
    this.locked = h(
      'div',
      { class: 'locked' },
      h('div', { class: 'big-icon', text: def.icon }),
      h('h2', { text: def.name }),
      h('p', { text: def.blurb }),
      this.unlockBtn,
    );

    // Play area
    this.statsEl = h('div', { class: 'stats' });
    this.resultEl = h('div', { class: 'result', text: 'Place your bet' });
    this.netEl = h('div', { class: 'net', text: ' ' });
    this.stage = h('div', { class: 'stage' }, this.resultEl, this.netEl);

    this.betInput = h('input', {
      type: 'number',
      min: '1',
      step: '1',
      class: 'bet-input',
      onchange: () => game.setBet(id, Number(this.betInput.value)),
    });
    const betBtn = (label: string, fn: () => void, title?: string) =>
      h('button', { class: 'btn small', text: label, title, onclick: fn });
    const ts = () => game.table(id);
    this.rangeEl = h('div', { class: 'range' });
    this.playBtn = h('button', {
      class: 'btn play',
      text: 'Play',
      onclick: () => game.play(id),
    });
    const betRow = h(
      'div',
      { class: 'bet-row' },
      betBtn('Min', () => game.setBet(id, minBet(def, ts().prestige))),
      betBtn('½', () => game.setBet(id, ts().bet / 2)),
      this.betInput,
      betBtn('2×', () => game.setBet(id, ts().bet * 2)),
      betBtn('Max', () => game.setBet(id, maxBet(def, ts().prestige))),
    );

    const controls = h('div', { class: 'controls' }, betRow, this.rangeEl);
    if (def.options) {
      this.optionSelect = h(
        'select',
        { class: 'select', onchange: () => game.setOption(id, this.optionSelect!.value) },
        ...def.options.map((o) => {
          const opt = h('option', { text: o.name });
          opt.value = o.id;
          return opt;
        }),
      );
      controls.append(h('label', { class: 'field' }, h('span', { text: 'Bet on' }), this.optionSelect));
    }
    controls.append(this.playBtn);

    this.strategySelect = h('select', {
      class: 'select',
      onchange: () => game.setStrategy(id, this.strategySelect.value as AutoStrategy),
    });
    for (const [value, name] of [
      ['min', 'Minimum bet'],
      ['pct', '5% of bankroll'],
      ['max', 'Maximum bet'],
    ] as const) {
      const opt = h('option', { text: name });
      opt.value = value;
      this.strategySelect.append(opt);
    }
    this.autoInfo = h('div', { class: 'auto-info' });
    const auto = h(
      'div',
      { class: 'card' },
      h('h3', { text: 'Auto-players' }),
      this.autoInfo,
      h('label', { class: 'field' }, h('span', { text: 'They bet' }), this.strategySelect),
    );

    // Upgrades
    const upgrades = h('div', { class: 'card upgrades' }, h('h3', { text: 'Upgrades' }));
    for (const u of allUpgrades(def)) {
      const level = h('span', { class: 'level' });
      const button = h('button', { class: 'btn buy', onclick: () => game.buyUpgrade(id, u.id) });
      const root = h(
        'div',
        { class: 'upgrade' },
        h('div', { class: 'upgrade-text' }, h('div', {}, h('strong', { text: u.name }), ' ', level), h('small', { text: u.description })),
        button,
      );
      upgrades.append(root);
      this.rows.push({ def: u, root, level, button });
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
            `Prestige ${def.name}? Its upgrades and auto-players reset, but its minimum bet and maximum payout rise (level ${next}).`,
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
        h('div', { class: 'card play-card' }, this.stage, controls),
        auto,
      ),
      h('div', { class: 'col side' }, upgrades, prestige),
    );

    this.root = h('section', { class: 'panel' }, this.locked, this.body);
  }

  update(): void {
    const { game, id } = this;
    const def = game.def(id);
    const ts = game.table(id);
    const money = game.state.money;

    toggleClass(this.locked, 'hidden', ts.unlocked);
    toggleClass(this.body, 'hidden', !ts.unlocked);
    if (!ts.unlocked) {
      setText(this.unlockBtn, `Unlock for ${fmt(def.unlockCost)}`);
      setDisabled(this.unlockBtn, money < def.unlockCost);
      return;
    }

    const lo = minBet(def, ts.prestige);
    const hi = maxBet(def, ts.prestige);
    setText(
      this.statsEl,
      `Prestige ${ts.prestige} · ${fmt(ts.plays)} plays · run profit ${fmtSigned(ts.profit)} · luck ${(luckChance(ts.levels) * 100).toFixed(1)}% · winnings ×${payoutMultiplier(ts.levels, ts.prestige).toFixed(2)}`,
    );

    if (document.activeElement !== this.betInput && this.betInput.value !== String(ts.bet)) {
      this.betInput.value = String(ts.bet);
    }
    this.betInput.min = String(lo);
    this.betInput.max = String(hi);
    setText(
      this.rangeEl,
      `Bet ${fmt(lo)} – ${fmt(hi)} · max payout per play ${fmt(maxPayout(def, ts.prestige))}`,
    );
    setDisabled(this.playBtn, money < ts.bet);
    if (this.optionSelect && this.optionSelect.value !== ts.option) this.optionSelect.value = ts.option;
    if (this.strategySelect.value !== ts.autoStrategy) this.strategySelect.value = ts.autoStrategy;

    const rate = autoPlaysPerSecond(ts.levels);
    setText(
      this.autoInfo,
      rate > 0
        ? `${ts.levels.auto ?? 0} players · ${rate.toFixed(1)} plays/sec`
        : 'Nobody is playing for you yet. Hire an auto-player.',
    );

    for (const row of this.rows) {
      const level = ts.levels[row.def.id] ?? 0;
      const maxed = level >= row.def.maxLevel;
      setText(row.level, `Lv ${level}/${row.def.maxLevel}`);
      if (maxed) {
        setText(row.button, 'Maxed');
        setDisabled(row.button, true);
      } else {
        const cost = upgradeCost(def, row.def, ts.prestige, level);
        setText(row.button, fmt(cost));
        setDisabled(row.button, money < cost);
      }
    }

    const threshold = prestigeThreshold(def, ts.prestige);
    const progress = Math.max(0, Math.min(1, ts.profit / threshold));
    setText(
      this.prestigeText,
      `Earn ${fmt(threshold)} profit at this table to prestige (${fmt(Math.max(0, ts.profit))} so far). ` +
        `Next level: min bet ${fmt(minBet(def, ts.prestige + 1))}, max payout ${fmt(maxPayout(def, ts.prestige + 1))}, +10% winnings.`,
    );
    this.prestigeBar.style.width = `${(progress * 100).toFixed(1)}%`;
    setDisabled(this.prestigeBtn, !game.canPrestige(id));

    const last = game.last[id];
    if (last && last.seq !== this.seenSeq) {
      this.seenSeq = last.seq;
      const o = last.outcome;
      setText(this.resultEl, o.detail);
      setText(this.netEl, `${fmtSigned(o.net)}${o.capped ? ' (max payout!)' : ''}${last.auto ? ' · auto' : ''}`);
      this.stage.classList.remove('win', 'lose', 'push');
      this.stage.classList.add(o.net > 0 ? 'win' : o.net < 0 ? 'lose' : 'push');
      flash(this.stage, 'pop');
    }
  }
}
