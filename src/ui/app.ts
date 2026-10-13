import type { TableId } from '../core/types';
import type { Game } from '../core/game';
import { TABLES, TABLE_IDS } from '../tables';
import { exportSave } from '../core/save';
import { h, setText, toggleClass } from './dom';
import { fmt, fmtSigned } from './format';
import { TablePanel } from './tablePanel';
import { CasinoPanel } from './casinoPanel';

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
  private wallets = new Map<TableId, { root: HTMLElement; amount: HTMLElement }>();
  private rateEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastSeq = 0;
  private toastTimer = 0;
  private samples: Record<TableId, { t: number; net: number }[]> = { coinflip: [], slots: [], roulette: [], blackjack: [] };
  private handlers: AppHandlers;

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
        h('button', { class: 'btn small', text: 'Export', onclick: () => this.doExport() }),
        h('button', { class: 'btn small', text: 'Import', onclick: () => this.doImport() }),
        h('button', { class: 'btn small danger', text: 'Reset', onclick: () => this.doReset() }),
      ),
    );

    const nav = h('nav', { class: 'tabs' });
    const main = h('main', {});
    for (const id of TABLE_IDS) {
      const def = TABLES[id];
      const tab = h('button', { class: 'tab', onclick: () => this.select(id) });
      this.tabs.set(id, tab);
      nav.append(tab);
      const panel = new TablePanel(game, id);
      this.panels.set(id, panel);
      main.append(panel.root);
      tab.title = def.name;
    }

    this.casinoPanel = new CasinoPanel(game);
    this.casinoTab = h('button', { class: 'tab', title: 'Casino', onclick: () => this.select('casino') });
    nav.append(this.casinoTab);
    main.append(this.casinoPanel.root);

    host.replaceChildren(header, nav, main, this.toastEl);
    this.select(this.selected);
  }

  select(id: TableId | 'casino'): void {
    this.selected = id;
    for (const [tid, panel] of this.panels) toggleClass(panel.root, 'hidden', tid !== id);
    for (const [tid, tab] of this.tabs) toggleClass(tab, 'active', tid === id);
    this.casinoPanel.setHidden(id !== 'casino');
    toggleClass(this.casinoTab, 'active', id === 'casino');
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
      toggleClass(w.root, 'hidden', !ts.unlocked);
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

    for (const id of TABLE_IDS) {
      const tab = this.tabs.get(id)!;
      const ts = g.table(id);
      const def = TABLES[id];
      const affordable = g.canUnlock(id);
      setText(tab, `${ts.unlocked ? def.icon : '🔒'} ${def.name}`);
      toggleClass(tab, 'affordable', affordable);
    }
    const { chips } = g.state.casino;
    const canAscend = g.canAscend();
    setText(this.casinoTab, canAscend ? '🏛 Casino ★' : chips > 0 ? `🏛 Casino (${fmt(chips)})` : '🏛 Casino');
    toggleClass(this.casinoTab, 'affordable', canAscend);
    this.updateSelected();

    if (g.notice && g.notice.seq !== this.toastSeq) {
      this.toastSeq = g.notice.seq;
      this.toast(g.notice.text);
    }
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
