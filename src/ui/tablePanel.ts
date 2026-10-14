import type { TableId, UpgradeDef } from '../core/types';
import type { Game } from '../core/game';
import {
  allUpgrades,
  luckChance,
  maxPayout,
  betAtLevel,
  payoutMultiplier,
  prestigeThreshold,
} from '../core/economy';
import { h, setDisabled, setText, toggleClass } from './dom';
import { fmt } from './format';
import { previousTable } from '../tables';
import { Stage } from './stage/stage';
import { HistoryChart } from './historyChart';
import { perfBegin, perfEnd } from './perf';
import { UPGRADE_ICONS, iconSvg } from '../assets';
import { bonusLabel } from './upgradeBonus';
import { buyLabel, buyMode, buyModeSelector, onBuyModeChange } from './buyMode';

let iconSeq = 0;

/** Inline SVG medallion; gradient ids are made unique per instance so hidden panels can't break visible ones. */
function upgradeIcon(id: string): HTMLElement {
  const el = h('span', { class: 'upgrade-icon' });
  el.setAttribute('aria-hidden', 'true');
  const n = ++iconSeq;
  el.innerHTML = iconSvg(UPGRADE_ICONS[id] ?? 'coin').replace(/(id="|url\(#)([a-z]+[gf])(?=["\)])/g, `$1$2${n}`);
  return el;
}

/** Upgrade quotes refresh at most this often (ms) unless something invalidates them. */
const SLOW_MS = 250;

interface UpgradeRow {
  def: UpgradeDef;
  root: HTMLElement;
  level: HTMLElement;
  button: HTMLButtonElement;
  bonusNow: HTMLElement;
  bonusNext: HTMLElement;
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
  private statTiles: Record<'prestige' | 'luck' | 'winnings', HTMLElement>;
  private body: HTMLElement;

  private statsEl: HTMLElement;
  private winOld!: HTMLElement;
  /** Winnings multiplier captured when the prestige preview opens, so the comparison holds still. */
  private frozenWin: number | null = null;
  /** Upgrade whose buy button is hovered/focused; Bigger Bets previews its bet in the Bet / Payout tile. */
  private previewUpgrade: string | null = null;
  private stage: HTMLElement;
  private noticeEl: HTMLElement;
  private managerSeq = 0;
  private bigBet: HTMLElement;
  private bigBetGhost: HTMLElement;
  private bigBetOld: HTMLElement;
  private bigTiles: HTMLElement[] = [];
  /** The feed-share slider row; null on the first table, which stakes its own currency. */
  private feedRow: HTMLElement | null = null;
  private feedInput: HTMLInputElement | null = null;
  private feedLabel: HTMLElement | null = null;
  private winTile: HTMLElement;
  private previewing = false;
  private rows: UpgradeRow[] = [];
  private cheapestBtn: HTMLButtonElement;
  private barLabel: HTMLElement;
  private barWrap: HTMLElement;
  private prestigeBar: HTMLElement;
  private prestigeBtn: HTMLButtonElement;
  private seenSeq = 0;
  private slowAt = 0;
  private slowDirty = true;
  private canvasStage: Stage;
  /** Hosted by the App's activity card (History tab). */
  readonly history: HistoryChart;

  constructor(game: Game, id: TableId) {
    this.game = game;
    this.id = id;
    this.history = new HistoryChart(id);
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
      meter,
      this.unlockBtn,
      this.unlockNote,
    );

    // Play area
    const kv = (_label: string, cls = ''): HTMLElement => h('div', { class: 'kv-value ' + cls });
    this.statTiles = {
      prestige: kv('Prestige'),
      luck: kv('Luck', 'gain'),
      winnings: kv('Winnings', 'gain'),
    };
    this.winOld = h('small', { class: 'kv-old concealed' });
    this.winTile = h('div', { class: 'kv' }, h('small', { text: 'Winnings' }), this.statTiles.winnings, this.winOld);
    this.statsEl = h(
      'div',
      { class: 'kv-grid' },
      h('div', { class: 'kv' }, h('small', { text: 'Prestige' }), this.statTiles.prestige),
      h('div', { class: 'kv' }, h('small', { text: 'Luck' }), this.statTiles.luck),
      this.winTile,
    );
    this.canvasStage = new Stage(def.icon, id);
    this.noticeEl = h('div', { class: 'stage-notice' });
    this.stage = h('div', { class: 'stage' }, this.canvasStage.canvas, this.noticeEl);

    // Each big value stacks its shown text over a hidden copy of the other state, so the tile is always as wide as
    // the wider of the two and toggling the prestige preview can never change how it wraps (which would move the button).
    this.bigBet = h('span', { class: 'big-shown' });
    this.bigBetGhost = h('span', { class: 'big-ghost' });
    this.bigBetOld = h('div', { class: 'big-old' });
    const bigBetTile = h('div', { class: 'stat-tile big' }, h('small', { text: 'Bet / Max payout' }), h('div', { class: 'big-value' }, this.bigBet, this.bigBetGhost), this.bigBetOld);
    this.bigTiles = [bigBetTile];
    const bigStats = h('div', { class: 'big-stats' }, bigBetTile);
    const prevId = previousTable(id);
    if (prevId) {
      const prevCur = game.def(prevId).currency;
      this.feedLabel = h('span', { class: 'feed-value' });
      this.feedInput = h('input', {
        type: 'range',
        min: '0',
        max: '100',
        step: '5',
        title: `Share of your ${prevCur.name} this table may stake`,
        oninput: () => {
          game.setFeedShare(id, Number(this.feedInput!.value) / 100);
          this.invalidate();
          this.update();
        },
      });
      this.feedRow = h(
        'div',
        {
          class: 'feed-row',
          title: `Each bet is paid in ${prevCur.name} (${def.stakeCost ?? 1} per unit of bet); winnings arrive as ${def.currency.name}. The slider caps how much of your ${prevCur.name} this table may stake, leaving the rest for ${game.def(prevId).name} upgrades.`,
        },
        h('small', { text: `Stakes ${prevCur.icon} ${prevCur.name}` }),
        this.feedInput,
        this.feedLabel,
      );
      bigStats.append(this.feedRow);
    }

    // Upgrades
    this.cheapestBtn = h('button', {
      class: 'btn small',
      text: 'Buy cheapest',
      title: 'Keep buying the cheapest affordable upgrade until your wallet runs out',
      onclick: () => this.buyCheapest(),
    });
    const upgrades = h('div', { class: 'card upgrades' }, h('h3', { text: 'Upgrades' }), buyModeSelector(), this.cheapestBtn);
    for (const u of allUpgrades(def)) {
      const level = h('span', { class: 'level' });
      const bonusNow = h('span', { class: 'bonus-now' });
      const bonusNext = h('span', { class: 'bonus-next' });
      const bonus = h('div', { class: 'upgrade-bonus' }, h('span', { class: 'bonus-tag', text: 'Total' }), bonusNow, bonusNext);
      const button = h('button', { class: 'btn buy', onclick: () => {
          game.buyUpgrade(id, u.id, buyMode());
          this.invalidate();
        },
      });
      const root = h(
        'div',
        { class: 'upgrade' },
        upgradeIcon(u.id),
        h('div', { class: 'upgrade-text' }, h('div', {}, h('strong', { text: u.name }), ' ', level), h('small', { text: u.description }), bonus),
        button,
      );
      upgrades.append(root);
      if (u.id === 'autobet') {
        const set = (on: boolean): void => {
          this.previewUpgrade = on ? u.id : null;
          this.invalidate();
          this.update();
        };
        button.addEventListener('mouseenter', () => set(true));
        button.addEventListener('mouseleave', () => set(false));
        button.addEventListener('focus', () => set(true));
        button.addEventListener('blur', () => set(false));
      }
      this.rows.push({ def: u, root, level, button, bonusNow, bonusNext });
    }

    // Prestige
    this.barLabel = h('div', { class: 'bar-label' });
    this.prestigeBar = h('div', { class: 'bar-fill' });
    this.prestigeBtn = h('button', {
      class: 'btn prestige',
      text: 'Prestige',
      onclick: () => {
        if (!game.canPrestige(id)) return;
        game.prestige(id);
        this.invalidate();
      },
    });

    const prestigeWrap = h('span', { class: 'prestige-wrap' }, this.prestigeBtn);
    const setPreview = (on: boolean): void => {
      this.previewing = on;
      this.invalidate();
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
        h('div', { class: 'card play-card' }, this.stage),
        h(
          'div',
          { class: 'below-stage' },
          h(
            'div',
            { class: 'card header-card hero' },
            h('div', { class: 'hero-head' }, h('h2', { text: `${def.icon} ${def.name}` }), prestigeWrap),
            h('p', { text: def.blurb }),
            bigStats,
            this.statsEl,
            this.barWrap,
          ),
          this.history.root,
        ),
      ),
    );
    this.side = h('div', { class: 'side-panel' }, upgrades);

    this.root = h('section', { class: 'panel' }, this.locked, this.body);
    onBuyModeChange(() => this.invalidate());
  }

  /** Forces the next update to refresh the throttled parts (upgrade rows). */
  invalidate(): void {
    this.slowDirty = true;
  }

  /** Highlights an upgrade row that was just bought. */
  private flashRow(row: UpgradeRow): void {
    row.root.classList.remove('manager-buy');
    void row.root.offsetWidth; // restart the animation
    row.root.classList.add('manager-buy');
    window.setTimeout(() => row.root.classList.remove('manager-buy'), 1500);
  }

  /** "Buy cheapest": buys, then flashes every row whose level went up. */
  private buyCheapest(): void {
    const levels = this.rows.map((r) => this.game.upgradeLevel(this.id, r.def.id));
    this.game.buyCheapest(this.id);
    this.invalidate();
    this.rows.forEach((r, i) => {
      if (this.game.upgradeLevel(this.id, r.def.id) > levels[i]) this.flashRow(r);
    });
  }

  /** Shows a popup over the animation stage. */
  showNotice(text: string, ms = 5000): void {
    const el = h('div', { class: 'stage-toast', text });
    this.noticeEl.append(el);
    while (this.noticeEl.children.length > 4) this.noticeEl.firstElementChild!.remove();
    window.setTimeout(() => el.remove(), ms);
  }

  update(): void {
    const t0 = perfBegin();
    this.render();
    perfEnd(`panel.${this.id}`, t0);
  }

  private render(): void {
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

    const nowMs = performance.now();
    const slow = this.slowDirty || nowMs - this.slowAt >= SLOW_MS;
    if (slow) {
      this.slowDirty = false;
      this.slowAt = nowMs;
    }
    if (slow) {
      const levels = game.levelsFor(id);
      setText(this.statTiles.prestige, `${ts.prestige}`);
      setText(this.statTiles.luck, `${(luckChance(levels, game.bonus) * 100).toFixed(1)}%`);
      const curWin = payoutMultiplier(levels, ts.prestige, game.bonusFor(id), def.baseWinBonus, ts.streak);
      const autobetLvl = ts.levels.autobet ?? 0;
      const curBet = betAtLevel(def, ts.prestige, game.stakeBudget(id), autobetLvl);
      const curMax = maxPayout(def, ts.prestige, levels);
      const prestigePv = this.previewing;
      const betPv = !prestigePv && this.previewUpgrade === 'autobet' && autobetLvl < 7;
      const pv = prestigePv;
      const nextWin = payoutMultiplier({}, ts.prestige + 1, game.bonusFor(id), def.baseWinBonus, 0);
      setText(this.statTiles.winnings, `×${(pv ? nextWin : curWin).toFixed(2)}`);
      let shownBet = curBet;
      let shownMax = curMax;
      if (prestigePv) {
        shownBet = betAtLevel(def, ts.prestige + 1, game.stakeBudget(id), autobetLvl);
        shownMax = maxPayout(def, ts.prestige + 1, levels);
      } else if (betPv) {
        const n = Math.max(1, game.quoteUpgrade(id, 'autobet', buyMode()).count);
        shownBet = betAtLevel(def, ts.prestige, game.stakeBudget(id), Math.min(7, autobetLvl + n));
      }
      // The bet is paid in the previous table's currency (the first table's own); the payout lands in this table's.
      const stakeIcon = previousTable(id) ? game.def(previousTable(id)!).currency.icon : cur.icon;
      const line = (b: number, m: number): string => `${stakeIcon} ${fmt(game.stakePrice(id, b))} → ${cur.icon} ${fmt(m)}`;
      setText(this.bigBet, line(shownBet, shownMax));
      if (this.feedInput && this.feedLabel) {
        const prev = game.def(previousTable(id)!).currency;
        const pct = Math.round(ts.feedShare * 100);
        if (document.activeElement !== this.feedInput) this.feedInput.value = String(pct);
        const price = game.stakePrice(id, curBet);
        setText(this.feedLabel, curBet > 0 && game.stakeBudget(id) >= curBet ? `${pct}% · ${prev.icon} ${fmt(price)}/bet` : `${pct}% · starved`);
      }
      // Ghost holds the widest candidate so toggling a preview never changes the tile's width.
      setText(this.bigBetGhost, line(Math.max(shownBet, curBet), Math.max(shownMax, curMax)));
      // Always rendered (just concealed) so the tile keeps its size and the button doesn't move under the cursor.
      setText(this.bigBetOld, `was ${line(curBet, curMax)}`);
      const anyPv = prestigePv || betPv;
      toggleClass(this.bigBetOld, 'concealed', !anyPv);
      if (pv && this.frozenWin === null) this.frozenWin = payoutMultiplier({}, ts.prestige, game.bonusFor(id), def.baseWinBonus, 0);
      if (!pv) this.frozenWin = null;
      setText(this.winOld, `was ×${(this.frozenWin ?? curWin).toFixed(2)}`);
      toggleClass(this.winOld, 'concealed', !pv);
      for (const t of this.bigTiles) toggleClass(t, 'preview', anyPv);
      toggleClass(this.winTile, 'preview', pv);

    }
    toggleClass(this.cheapestBtn, 'hidden', game.casinoLevel('bulkbuy') < 1);
    setDisabled(this.cheapestBtn, !game.canBuyCheapest(id));
    // Light up rows the Floor Manager just bought (only recent entries, so a freshly shown tab doesn't replay old ones).
    for (const e of game.managerLog) {
      if (e.table !== id || e.seq <= this.managerSeq) continue;
      this.managerSeq = e.seq;
      if (Date.now() - e.at > 1500) continue;
      const row = this.rows.find((r) => r.def.id === e.upgradeId);
      if (!row) continue;
      this.flashRow(row);
    }
    for (const row of slow ? this.rows : []) {
      const level = ts.levels[row.def.id] ?? 0;
      const maxed = level >= row.def.maxLevel;
      setText(row.level, `Lv ${level}/${row.def.maxLevel}`);
      const nowText = bonusLabel(row.def.id, level);
      setText(row.bonusNow, nowText);
      row.bonusNow.title = nowText;
      setText(row.bonusNext, maxed ? 'Max level reached' : `Next: ${bonusLabel(row.def.id, level + 1)}`);
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
    if (slow) this.barWrap.title = `${fmt(Math.max(0, ts.profit))} / ${fmt(threshold)} ${cur.name} profit to prestige`;
    this.prestigeBar.style.transform = `scaleX(${progress})`;
    setDisabled(this.prestigeBtn, !game.canPrestige(id));

    this.canvasStage.setPlayers(1 + Math.floor((ts.levels.speed ?? 0) / 4));
    this.canvasStage.resume();
    this.history.update(ts.history, ts.plays);

    const last = game.last[id];
    if (last && last.seq !== this.seenSeq) {
      this.seenSeq = last.seq;
      const o = last.outcome;
      this.stage.classList.remove('win', 'lose', 'push');
      this.stage.classList.add(o.net > 0 ? 'win' : o.net < 0 ? 'lose' : 'push');
      this.canvasStage.show(last, ts.levels);
    }
  }
}
