import type { TableId } from '../core/types';
import type { Game } from '../core/game';
import { TABLES, TABLE_IDS } from '../tables';
import { exportSave } from '../core/save';
import { h, setText, toggleClass } from './dom';
import { fmt, fmtSigned } from './format';
import { TablePanel } from './tablePanel';
import { CasinoPanel } from './casinoPanel';
import { cycleQuality } from './quality';

const RECENT_MAX = 4;

export interface AppHandlers {
  onImport(text: string): void;
  onReset(): void;
}

export class App {
  private game: Game;
  private panels = new Map<TableId, TablePanel>();
  private tabs = new Map<TableId, HTMLButtonElement>();
  private selected: TableId | 'casino' = 'coinflip';
  private casinoPanel: CasinoPanel;
  private casinoTab: HTMLButtonElement;
  private casinoLabel: HTMLElement;
  private wallets = new Map<TableId, { root: HTMLElement; amount: HTMLElement }>();
  private rateEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastSeq = 0;
  private toastTimer = 0;
  private samples: Record<TableId, { t: number; net: number }[]> = { coinflip: [], slots: [], roulette: [], blackjack: [] };
  private handlers: AppHandlers;
  private recentEl: HTMLElement;
  private recent: { id: TableId; net: number; at: number }[] = [];
  private recentKey = '\0';
  private lastSeq: Partial<Record<TableId, number>> = {};
  private sides = new Map<TableId, HTMLElement>();
  private qualityBtn: HTMLButtonElement;
  private activityMode: 'wins' | 'history' = 'wins';
  private activityBtns!: Record<'wins' | 'history', HTMLButtonElement>;
  private histories = new Map<TableId, HTMLElement>();
  private tiles = new Map<TableId, { root: HTMLButtonElement; sub: HTMLElement; lvl: HTMLElement }>();
  private slowAt = 0;

  constructor(host: HTMLElement, game: Game, handlers: AppHandlers) {
    this.game = game;
    this.handlers = handlers;

    this.rateEl = h('div', { class: 'rate', text: '' });
    this.toastEl = h('div', { class: 'toast hidden' });

    const walletStrip = h('div', { class: 'wallets' });
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const amount = h('span', { class: 'money', text: '0' });
      const root = h(
        'button',
        { class: 'wallet', title: `${def.currency.name} (${def.name})`, onclick: () => this.select(id) },
        h('span', { class: 'wallet-icon', text: def.currency.icon }),
        h('span', { class: 'wallet-name', text: def.currency.name }),
        amount,
      );
      this.wallets.set(id, { root, amount });
      walletStrip.append(root);
    }

    const header = h(
      'header',
      { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'logo', text: '♠ IDLE CASINO ♦' })),
      h('div', { class: 'bank' }, walletStrip, this.rateEl),
      h(
        'div',
        { class: 'menu' },
        (this.qualityBtn = h('button', {
          class: 'btn small',
          title: 'Graphics quality',
          text: `Quality: ${document.documentElement.dataset.quality ?? 'auto'}`,
          onclick: () => {
            cycleQuality();
            setText(this.qualityBtn, `Quality: ${document.documentElement.dataset.quality}`);
          },
        })),
        h('button', { class: 'btn small', text: 'Export', onclick: () => this.doExport() }),
        h('button', { class: 'btn small', text: 'Import', onclick: () => this.doImport() }),
        h('button', { class: 'btn small danger', text: 'Reset', onclick: () => this.doReset() }),
        ...(new URLSearchParams(window.location.search).get('cardcounting') === '1'
          ? [h('button', { class: 'btn small dev', text: '🛠 Unlock everything', onclick: () => game.devUnlockAll() })]
          : []),
      ),
    );

    game.freeCasinoShop = new URLSearchParams(window.location.search).get('cardcounting') === '1';

    const main = h('main', { class: 'mainview' });
    const side = h('aside', { class: 'rightcol' });
    this.activityBtns = {
      wins: h('button', { class: 'btn small', text: 'Recent wins', onclick: () => this.setActivity('wins') }),
      history: h('button', { class: 'btn small', text: 'History', onclick: () => this.setActivity('history') }),
    };
    this.recentEl = h('div', {});
    for (const id of TABLE_IDS) {
      const panel = new TablePanel(game, id);
      this.panels.set(id, panel);
      main.append(panel.root);
      this.sides.set(id, panel.side);
      this.histories.set(id, panel.history.root);
      side.append(panel.side);
    }

    const tileRow = h('div', { class: 'tiles' });
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const lvl = h('small', { text: '' });
      const sub = h('small', { class: 'tile-rate', text: '' });
      const root = h(
        'button',
        { class: 'tab tile', title: def.name, onclick: () => this.select(id) },
        h('span', { class: 'tile-icon', text: def.icon }),
        h('strong', { text: def.name }),
        lvl,
        sub,
      );
      this.tiles.set(id, { root, sub, lvl });
      this.tabs.set(id, root);
      tileRow.append(root);
    }
    const yourCasino = h('section', { class: 'your-casino' }, tileRow);

    this.casinoPanel = new CasinoPanel(game);
    this.casinoLabel = h('small', { text: '' });
    this.casinoTab = h(
      'button',
      { class: 'tab tile', title: 'Casino', onclick: () => this.select('casino') },
      h('span', { class: 'tile-icon', text: '🏛' }),
      h('strong', { text: 'Casino' }),
      this.casinoLabel,
    );
    tileRow.append(this.casinoTab);
    main.append(this.casinoPanel.root, yourCasino);

    side.append(
      h(
        'div',
        { class: 'card activity' },
        h('div', { class: 'history-range' }, this.activityBtns.wins, this.activityBtns.history),
        this.recentEl,
        ...this.histories.values(),
      ),
    );
    host.replaceChildren(header, h('div', { class: 'shell' }, main, side), this.toastEl);
    this.select(this.selected);
  }

  select(id: TableId | 'casino'): void {
    this.selected = id;
    for (const [tid, panel] of this.panels) toggleClass(panel.root, 'hidden', tid !== id);
    for (const [tid, el] of this.sides) toggleClass(el, 'hidden', tid !== id);
    for (const [tid, tab] of this.tabs) toggleClass(tab, 'active', tid === id);
    this.casinoPanel.setHidden(id !== 'casino');
    toggleClass(this.casinoTab, 'active', id === 'casino');
    this.slowAt = 0;
    this.syncActivity();
    this.updateSelected();
  }

  private updateSelected(): void {
    if (this.selected === 'casino') this.casinoPanel.update();
    else this.panels.get(this.selected)!.update();
  }

  toast(text: string, ms = 5000): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  update(): void {
    const g = this.game;
    const now = performance.now();
    for (const id of TABLE_IDS) {
      const series = this.samples[id];
      series.push({ t: now, net: g.sessionNet[id] });
      while (series.length > 2 && now - series[0].t > 8000) series.shift();
      const w = this.wallets.get(id)!;
      const ts = g.table(id);
      toggleClass(w.root, 'hidden', !ts.unlocked || this.selected !== id);
      toggleClass(w.root, 'active', this.selected === id);
      setText(w.amount, fmt(ts.wallet));
    }
    if (this.selected === 'casino') {
      setText(this.rateEl, '');
    } else {
      const series = this.samples[this.selected];
      const first = series[0];
      const span = (now - first.t) / 1000;
      const perSec = span > 0.5 ? (g.sessionNet[this.selected] - first.net) / span : 0;
      const def = TABLES[this.selected];
      setText(this.rateEl, `${fmtSigned(Math.round(perSec))} ${def.currency.name} / sec`);
      toggleClass(this.rateEl, 'neg', perSec < 0);
    }

    if (now - this.slowAt >= 250) {
      this.slowAt = now;
      this.updateRecent(g);
      this.updateTiles(g);
    }
    for (const id of TABLE_IDS) {
      const tab = this.tabs.get(id)!;
      const affordable = g.canUnlock(id);
      toggleClass(tab, 'affordable', affordable);
    }
    const { chips } = g.state.casino;
    const canAscend = g.canAscend();
    setText(this.casinoLabel, canAscend ? 'Ascend ★' : chips > 0 ? `${fmt(chips)} chips` : 'Meta upgrades');
    toggleClass(this.casinoTab, 'affordable', canAscend);
    this.updateSelected();

    if (g.notice && g.notice.seq !== this.toastSeq) {
      this.toastSeq = g.notice.seq;
      this.toast(g.notice.text);
    }
  }

  private setActivity(mode: 'wins' | 'history'): void {
    this.activityMode = mode;
    this.syncActivity();
    this.updateSelected();
  }

  private syncActivity(): void {
    const history = this.activityMode === 'history' && this.selected !== 'casino';
    toggleClass(this.recentEl, 'hidden', history);
    for (const [id, el] of this.histories) toggleClass(el, 'hidden', !history || id !== this.selected);
    toggleClass(this.activityBtns.wins, 'active', !history);
    toggleClass(this.activityBtns.history, 'active', history);
    toggleClass(this.activityBtns.history, 'hidden', this.selected === 'casino');
  }

  private updateTiles(g: Game): void {
    for (const id of TABLE_IDS) {
      const t = this.tiles.get(id)!;
      const ts = g.table(id);
      const cur = TABLES[id].currency.name;
      toggleClass(t.root, 'active', this.selected === id);
      toggleClass(t.root, 'locked', !ts.unlocked);
      toggleClass(t.root, 'affordable', g.canUnlock(id));
      setText(t.lvl, ts.unlocked ? `Prestige ${ts.prestige}` : 'Locked');
      setText(
        t.sub,
        ts.unlocked ? `${fmt(Math.round(g.incomeEstimate(id) * 60))} ${cur} / min` : `Unlock: ${fmt(TABLES[id].unlockCost)}`,
      );
    }
  }

  private updateRecent(g: Game): void {
    let changed = false;
    for (const id of TABLE_IDS) {
      const last = g.last[id];
      if (!last || last.seq === this.lastSeq[id]) continue;
      const first = this.lastSeq[id] === undefined;
      this.lastSeq[id] = last.seq;
      if (first || last.outcome.net <= 0) continue;
      this.recent.unshift({ id, net: last.outcome.net, at: performance.now() });
      changed = true;
    }
    if (this.recent.length > RECENT_MAX) this.recent.length = RECENT_MAX;
    const now = performance.now();
    const rows = this.recent.map((r) => `${TABLES[r.id].name}|${fmt(r.net)}|${Math.floor((now - r.at) / 10000)}`);
    const key = rows.join(',');
    if (!changed && key === this.recentKey) return;
    this.recentKey = key;
    this.recentEl.replaceChildren(
      ...(this.recent.length
        ? this.recent.map((r) =>
            h(
              'div',
              { class: 'recent-row' },
              h('span', { text: `${TABLES[r.id].icon} ${TABLES[r.id].name}` }),
              h('span', { class: 'amt', text: `+${fmt(r.net)} ${TABLES[r.id].currency.name}` }),
            ),
          )
        : [h('small', { text: 'No wins yet.' })]),
    );
  }

  private doExport(): void {
    const text = exportSave(this.game.state);
    const done = () => this.toast('Save copied to clipboard. Keep it somewhere safe.');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => window.prompt('Copy your save:', text));
    } else {
      window.prompt('Copy your save:', text);
    }
  }

  private doImport(): void {
    const text = window.prompt('Paste your save code. This replaces your current game.');
    if (!text) return;
    try {
      this.handlers.onImport(text);
    } catch (e) {
      this.toast(e instanceof Error ? e.message : 'Import failed');
    }
  }

  private doReset(): void {
    if (window.confirm('Delete your save and start over? This cannot be undone.')) this.handlers.onReset();
  }
}
