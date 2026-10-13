import type { TableId, UpgradeDef } from '../core/types';
import type { Game } from '../core/game';
import {
  allUpgrades,
  luckChance,
  maxPayout,
  minBet,
  payoutMultiplier,
  prestigeThreshold,
} from '../core/economy';
import { h, setDisabled, setText, toggleClass } from './dom';
import { fmt, fmtSigned } from './format';
import { previousTable } from '../tables';
import { Stage } from './stage/stage';
import { HistoryChart } from './historyChart';
import { AchievementsCard } from './achievementsPanel';
import { buyLabel, buyMode, buyModeSelector } from './buyMode';

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
  /** Upgrades/prestige/etc.; hosted by the App in the right-hand column. */
  readonly side: HTMLElement;
  private id: TableId;
  private game: Game;

  private locked: HTMLElement;
  private unlockBtn: HTMLButtonElement;
  private unlockNote: HTMLElement;
  private unlockFill: HTMLElement;
  private unlockLabel: HTMLElement;
  private statTiles: Record<'wallet' | 'prestige' | 'luck' | 'winnings' | 'streak', HTMLElement>;
  private streakTile: HTMLElement;
  private body: HTMLElement;

  private statsEl: HTMLElement;
  private tileProfit: HTMLElement;
  private tileIncome: HTMLElement;
  private tilePlays: HTMLElement;
  private stage: HTMLElement;
  private resultEl: HTMLElement;
  private netEl: HTMLElement;
  private bigMin: HTMLElement;
  private bigMinOld: HTMLElement;
  private bigMax: HTMLElement;
  private bigMaxOld: HTMLElement;
  private bigTiles: HTMLElement[] = [];
  private winTile: HTMLElement;
  private previewing = false;
  private rows: UpgradeRow[] = [];
  private barLabel: HTMLElement;
  private barWrap: HTMLElement;
  private prestigeBar: HTMLElement;
  private prestigeBtn: HTMLButtonElement;
  private seenSeq = 0;
  private canvasStage: Stage;
  /** Hosted by the App's activity card (History tab). */
  readonly history: HistoryChart;
  private achievements: AchievementsCard;

  constructor(game: Game, id: TableId) {
    this.game = game;
    this.id = id;
    this.history = new HistoryChart(id);
    this.achievements = new AchievementsCard(game, id);
    const def = game.def(id);

    // Locked view
    this.unlockBtn = h('button', { class: 'btn primary', onclick: () => game.unlock(id) });
    this.unlockNote = h('div', { class: 'unlock-note' });
    this.unlockFill = h('div', { class: 'bar-fill' });
    this.unlockLabel = h('div', { class: 'unlock-label' });
    const meter = h('div', { class: 'unlock-meter' }, h('div', { class: 'bar' }, this.unlockFill), this.unlockLabel);
    this.locked = h(
      'div',
      { class: 'locked' },
      h('div', { class: 'big-icon', text: def.icon }),
      h('h2', { text: def.name }),
      h('p', { text: def.blurb }),
      meter,
      this.unlockBtn,
      this.unlockNote,
    );

    // Play area
    const kv = (_label: string, cls = ''): HTMLElement => h('div', { class: 'kv-value ' + cls });
    this.statTiles = {
      wallet: kv('Wallet'),
      prestige: kv('Prestige'),
      luck: kv('Luck', 'gain'),
      winnings: kv('Winnings', 'gain'),
      streak: kv('Streak', 'gain'),
    };
    this.streakTile = h('div', { class: 'kv' }, h('small', { text: 'Streak' }), this.statTiles.streak);
    this.winTile = h('div', { class: 'kv' }, h('small', { text: 'Winnings' }), this.statTiles.winnings);
    this.statsEl = h(
      'div',
      { class: 'kv-grid' },
      h('div', { class: 'kv' }, h('small', { text: 'Wallet' }), this.statTiles.wallet),
      h('div', { class: 'kv' }, h('small', { text: 'Prestige' }), this.statTiles.prestige),
      h('div', { class: 'kv' }, h('small', { text: 'Luck' }), this.statTiles.luck),
      this.winTile,
      this.streakTile,
    );
    this.tileProfit = h('div', { class: 'tile-value', text: '0' });
    this.tileIncome = h('div', { class: 'tile-value', text: '0' });
    this.tilePlays = h('div', { class: 'tile-value', text: '0' });
    this.resultEl = h('div', { class: 'result', text: 'Place your bet' });
    this.netEl = h('div', { class: 'net', text: ' ' });
    this.canvasStage = new Stage(def.icon, id);
    this.resultEl.setAttribute('aria-live', 'polite');
    this.stage = h('div', { class: 'stage' }, this.canvasStage.canvas, this.resultEl, this.netEl);

    this.bigMin = h('div', { class: 'big-value' });
    this.bigMinOld = h('div', { class: 'big-old' });
    this.bigMax = h('div', { class: 'big-value' });
    this.bigMaxOld = h('div', { class: 'big-old' });
    const bigMinTile = h('div', { class: 'stat-tile big' }, h('small', { text: 'Min bet' }), this.bigMin, this.bigMinOld);
    const bigMaxTile = h('div', { class: 'stat-tile big' }, h('small', { text: 'Max payout' }), this.bigMax, this.bigMaxOld);
    this.bigTiles = [bigMinTile, bigMaxTile];
    const bigStats = h('div', { class: 'big-stats' }, bigMinTile, bigMaxTile);

    // Upgrades
    const upgrades = h('div', { class: 'card upgrades' }, h('h3', { text: 'Upgrades' }), buyModeSelector());
    for (const u of allUpgrades(def)) {
      const level = h('span', { class: 'level' });
      const button = h('button', { class: 'btn buy', onclick: () => game.buyUpgrade(id, u.id, buyMode()) });
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
    this.barLabel = h('div', { class: 'bar-label' });
    this.prestigeBar = h('div', { class: 'bar-fill' });
    this.prestigeBtn = h('button', {
      class: 'btn prestige',
      text: 'Prestige',
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

    const prestigeWrap = h('span', { class: 'prestige-wrap' }, this.prestigeBtn);
    const setPreview = (on: boolean): void => {
      this.previewing = on;
      this.update();
    };
    prestigeWrap.addEventListener('mouseenter', () => setPreview(true));
    prestigeWrap.addEventListener('mouseleave', () => setPreview(false));
    this.prestigeBtn.addEventListener('focus', () => setPreview(true));
    this.prestigeBtn.addEventListener('blur', () => setPreview(false));
    this.barWrap = h('div', { class: 'bar-wrap' }, h('div', { class: 'bar' }, this.prestigeBar), this.barLabel);

    this.body = h(
      'div',
      { class: 'table-body fill' },
      h(
        'div',
        { class: 'col main' },
        h(
          'div',
          { class: 'card header-card hero' },
          h('div', { class: 'hero-head' }, h('h2', { text: `${def.icon} ${def.name}` }), prestigeWrap),
          h('p', { text: def.blurb }),
          bigStats,
          h(
            'div',
            { class: 'stats-grid' },
            h('div', { class: 'stat-tile' }, h('small', { text: 'Run profit' }), this.tileProfit),
            h('div', { class: 'stat-tile' }, h('small', { text: 'Income / sec' }), this.tileIncome),
            h('div', { class: 'stat-tile' }, h('small', { text: 'Plays' }), this.tilePlays),
          ),
          this.statsEl,
          this.barWrap,
        ),
        h('div', { class: 'card play-card' }, this.stage),
      ),
    );
    const showSide = (mode: 'upgrades' | 'achievements'): void => {
      toggleClass(upgrades, 'hidden', mode !== 'upgrades');
      toggleClass(this.achievements.root, 'hidden', mode !== 'achievements');
      toggleClass(upBtn, 'active', mode === 'upgrades');
      toggleClass(achBtn, 'active', mode === 'achievements');
    };
    const upBtn = h('button', { class: 'btn small', text: 'Upgrades', onclick: () => showSide('upgrades') });
    const achBtn = h('button', { class: 'btn small', text: 'Achievements', onclick: () => showSide('achievements') });
    this.side = h(
      'div',
      { class: 'side-panel' },
      h('div', { class: 'history-range side-tabs' }, upBtn, achBtn),
      upgrades,
      this.achievements.root,
    );
    showSide('upgrades');

    this.root = h('section', { class: 'panel' }, this.locked, this.body);
  }

  update(): void {
    const { game, id } = this;
    const def = game.def(id);
    const ts = game.table(id);
    const cur = def.currency;

    toggleClass(this.locked, 'hidden', ts.unlocked);
    toggleClass(this.body, 'hidden', !ts.unlocked);
    toggleClass(this.side, 'locked-hide', !ts.unlocked);
    if (!ts.unlocked) {
      const prev = previousTable(id);
      const prevDef = prev ? game.def(prev) : null;
      const payer = game.unlockPayer(id);
      setText(this.unlockBtn, `Unlock for ${fmt(def.unlockCost)} ${prevDef?.currency.name ?? ''}`.trim());
      setDisabled(this.unlockBtn, !game.canUnlock(id));
      const have = payer?.wallet ?? 0;
      const frac = def.unlockCost > 0 ? Math.max(0, Math.min(1, have / def.unlockCost)) : 1;
      this.unlockFill.style.transform = `scaleX(${frac})`;
      setText(
        this.unlockLabel,
        prevDef && payer ? `${fmt(have)} / ${fmt(def.unlockCost)} ${prevDef.currency.name}` : '',
      );
      setText(
        this.unlockNote,
        prevDef
          ? payer
            ? ''
            : `▸ Unlock ${prevDef.name} first`
          : '',
      );
      toggleClass(this.unlockNote, 'goal', !!prevDef && !payer);
        return;
    }

    const levels = game.levelsFor(id);
    setText(this.statTiles.wallet, `${cur.icon} ${fmt(ts.wallet)}`);
    setText(this.statTiles.prestige, `${ts.prestige}`);
    setText(this.statTiles.luck, `${(luckChance(levels, game.bonus) * 100).toFixed(1)}%`);
    const curWin = payoutMultiplier(levels, ts.prestige, game.bonusFor(id), def.baseWinBonus, ts.streak);
    const curMin = minBet(def, ts.prestige);
    const curMax = maxPayout(def, ts.prestige, levels);
    const pv = this.previewing;
    const nextWin = payoutMultiplier({}, ts.prestige + 1, game.bonusFor(id), def.baseWinBonus, 0);
    setText(this.statTiles.winnings, `×${(pv ? nextWin : curWin).toFixed(2)}`);
    setText(this.bigMin, `${cur.icon} ${fmt(pv ? minBet(def, ts.prestige + 1) : curMin)}`);
    setText(this.bigMax, `${cur.icon} ${fmt(pv ? maxPayout(def, ts.prestige + 1, levels) : curMax)}`);
    setText(this.bigMinOld, pv ? `was ${fmt(curMin)}` : ' ');
    setText(this.bigMaxOld, pv ? `was ${fmt(curMax)}` : ' ');
    for (const t of this.bigTiles) toggleClass(t, 'preview', pv);
    toggleClass(this.winTile, 'preview', pv);
    toggleClass(this.streakTile, 'hidden', !ts.levels.streak);
    setText(this.statTiles.streak, `${ts.streak}`);

    setText(this.tileProfit, fmtSigned(ts.profit));
    setText(this.tileIncome, `≈ ${fmtSigned(Math.round(game.incomeEstimate(id)))}`);
    setText(this.tilePlays, fmt(ts.plays));

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
        const q = game.quoteUpgrade(id, row.def.id, buyMode());
        setText(row.button, buyLabel(q.count, q.cost, q.nextCost, fmt));
        setDisabled(row.button, q.count <= 0);
      }
    }

    const threshold = prestigeThreshold(def, ts.prestige, game.bonus);
    const progress = Math.max(0, Math.min(1, ts.profit / threshold));
    setText(this.barLabel, game.canPrestige(id) ? 'Ready to prestige!' : `${Math.floor(progress * 100)}%`);
    this.barWrap.title = `${fmt(Math.max(0, ts.profit))} / ${fmt(threshold)} ${cur.name} profit to prestige`;
    this.prestigeBar.style.transform = `scaleX(${progress})`;
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
