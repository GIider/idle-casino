import type { TableId } from '../core/types';
import type { Game } from '../core/game';
import { TABLES, TABLE_IDS } from '../tables';
import { exportSave } from '../core/save';
import { h, setText, toggleClass } from './dom';
import { fmt } from './format';
import { TablePanel } from './tablePanel';
import { CasinoPanel } from './casinoPanel';
import { cycleQuality } from './quality';
import { CROSS_PRESTIGE_BONUS } from '../core/economy';
import { previousTable } from '../tables';

const RECENT_MAX = 12;

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
  private casinoIcon!: HTMLElement;
  private casinoName!: HTMLElement;
  private casinoFill!: HTMLElement;
  private toastEl: HTMLElement;
  private toastSeq = 0;
  private toastTimer = 0;
  private handlers: AppHandlers;
  private recentEl: HTMLElement;
  private activityCard!: HTMLElement;
  private recent: { id: TableId; net: number; at: number }[] = [];
  private recentKey = '\0';
  private lastSeq: Partial<Record<TableId, number>> = {};
  private sides = new Map<TableId, HTMLElement>();
  private qualityBtn: HTMLButtonElement;
  private activityMode: 'wins' | 'history' = 'wins';
  private activityBtns!: Record<'wins' | 'history', HTMLButtonElement>;
  private histories = new Map<TableId, HTMLElement>();
  private tiles = new Map<TableId, { root: HTMLButtonElement; sub: HTMLElement; lvl: HTMLElement; icon: HTMLElement; name: HTMLElement; fill: HTMLElement }>();
  private chips = new Map<TableId, HTMLElement>();
  private slowAt = 0;

  constructor(host: HTMLElement, game: Game, handlers: AppHandlers) {
    this.game = game;
    this.handlers = handlers;

    this.toastEl = h('div', { class: 'toast hidden' });

    const header = h(
      'header',
      { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'logo', text: '♠ IDLE CASINO ♦' })),
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
    this.recentEl = h('div', { class: 'recent-list' });
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
      const icon = h('span', { class: 'tile-icon', text: def.icon });
      const name = h('strong', { text: def.name });
      const fill = h('div', { class: 'bar-fill' });
      const bar = h('div', { class: 'bar tile-bar' }, fill);
      const root = h('button', { class: 'tab tile', title: def.name, onclick: () => this.select(id) }, icon, bar, name, lvl, sub);
      this.tiles.set(id, { root, sub, lvl, icon, name, fill });
      this.tabs.set(id, root);
      if (previousTable(id)) {
        const chip = h('span', { class: 'link-chip', text: '→' });
        this.chips.set(id, chip);
        tileRow.append(chip);
      }
      tileRow.append(root);
    }
    const yourCasino = h('section', { class: 'your-casino' }, tileRow);

    this.casinoPanel = new CasinoPanel(game);
    this.casinoLabel = h('small', { text: '' });
    this.casinoIcon = h('span', { class: 'tile-icon', text: '🏛' });
    this.casinoName = h('strong', { text: 'Casino' });
    this.casinoTab = h(
      'button',
      { class: 'tab tile', title: 'Casino', onclick: () => this.select('casino') },
      this.casinoIcon,
      h('div', { class: 'bar tile-bar' }, (this.casinoFill = h('div', { class: 'bar-fill' }))),
      this.casinoName,
      this.casinoLabel,
    );
    tileRow.append(this.casinoTab);
    main.prepend(yourCasino);
    main.append(this.casinoPanel.root);

    this.activityCard = h(
      'div',
      { class: 'card activity' },
      h('div', { class: 'history-range' }, this.activityBtns.wins, this.activityBtns.history),
      this.recentEl,
      ...this.histories.values(),
    );
    side.append(this.activityCard);
    host.replaceChildren(header, h('div', { class: 'shell' }, main, side), this.toastEl);
    this.select(this.selected);
  }

  select(id: TableId | 'casino'): void {
    const g = this.game;
    if (id === 'casino' ? !g.casinoVisible() : !g.tableVisible(id)) id = 'coinflip';
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
    if (now - this.slowAt >= 250) {
      this.slowAt = now;
      this.updateRecent(g);
      this.updateTiles(g);
      const ready = TABLE_IDS.some((id) => g.canPrestige(id));
      const title = `${ready ? '● ' : ''}Idle Casino`;
      if (document.title !== title) document.title = title;
    }
    for (const id of TABLE_IDS) {
      const tab = this.tabs.get(id)!;
      toggleClass(tab, 'affordable', g.tableVisible(id) && g.canUnlock(id));
    }
    const { chips } = g.state.casino;
    const canAscend = g.canAscend();
    const casinoSeen = g.casinoVisible();
    setText(this.casinoIcon, casinoSeen ? '🏛' : '?');
    setText(this.casinoName, casinoSeen ? 'Casino' : '???');
    this.casinoFill.style.transform = `scaleX(${g.ascensionProgress()})`;
    setText(this.casinoLabel, !casinoSeen ? `${Math.floor(g.ascensionProgress() * 100)}% to unlock` : canAscend ? 'Ascend ★' : chips > 0 ? `${fmt(chips)} chips` : 'Meta upgrades');
    toggleClass(this.casinoTab, 'affordable', casinoSeen && canAscend);
    toggleClass(this.casinoTab, 'ready', casinoSeen && canAscend);
    toggleClass(this.casinoTab, 'hidden-feature', !casinoSeen);
    this.casinoTab.disabled = !casinoSeen;
    this.casinoTab.title = casinoSeen ? 'Casino' : '';
    this.syncActivity();
    if (this.selected === 'casino' ? !casinoSeen : !g.tableVisible(this.selected)) this.select('coinflip');
    this.updateSelected();

    if (g.notice && g.notice.seq !== this.toastSeq) {
      this.toastSeq = g.notice.seq;
      if (this.selected === 'casino') this.toast(g.notice.text);
      else this.panels.get(this.selected)!.showNotice(g.notice.text);
    }
  }

  private setActivity(mode: 'wins' | 'history'): void {
    this.activityMode = mode;
    this.syncActivity();
    this.updateSelected();
  }

  private syncActivity(): void {
    // Nothing to show on a table's unlock screen.
    const onLockedTable = this.selected !== 'casino' && !this.game.table(this.selected).unlocked;
    toggleClass(this.activityCard, 'hidden', onLockedTable);
    const history = this.activityMode === 'history' && this.selected !== 'casino';
    toggleClass(this.recentEl, 'hidden', history);
    for (const [id, el] of this.histories) toggleClass(el, 'hidden', !history || id !== this.selected);
    toggleClass(this.activityBtns.wins, 'active', !history);
    toggleClass(this.activityBtns.history, 'active', history);
    toggleClass(this.activityBtns.history, 'hidden', this.selected === 'casino');
  }

  private updateTiles(g: Game): void {
    let teased = false;
    for (const id of TABLE_IDS) {
      const t = this.tiles.get(id)!;
      const ts = g.table(id);
      // Only tease the next undiscovered table; hide the rest.
      const collapse = !g.tableVisible(id) && teased;
      if (!g.tableVisible(id)) teased = true;
      toggleClass(t.root, 'collapsed', collapse);
      const c = this.chips.get(id);
      if (c) toggleClass(c, 'collapsed', collapse);
      const cur = TABLES[id].currency.name;
      const seen = g.tableVisible(id);
      toggleClass(t.root, 'active', this.selected === id);
      toggleClass(t.root, 'locked', !ts.unlocked);
      toggleClass(t.root, 'hidden-feature', !seen);
      toggleClass(t.root, 'ready', seen && g.canPrestige(id));
      t.fill.style.transform = `scaleX(${g.prestigeProgress(id)})`;
      t.root.disabled = !seen;
      t.root.title = seen ? TABLES[id].name : '';
      const chip = this.chips.get(id);
      if (chip) {
        const prev = previousTable(id)!;
        const pp = g.table(prev).prestige;
        const now = 1 + CROSS_PRESTIGE_BONUS * pp;
        const next = now + CROSS_PRESTIGE_BONUS;
        toggleClass(chip, 'hidden', !seen || collapse);
        toggleClass(chip, 'hot', g.canPrestige(prev));
        setText(chip, `→ ×${now.toFixed(2)}`);
        chip.title = `${TABLES[prev].name} prestige boosts ${TABLES[id].name} winnings: ×${now.toFixed(2)} now, ×${next.toFixed(2)} after the next prestige`;
      }
      setText(t.icon, seen ? TABLES[id].icon : '?');
      setText(t.name, seen ? TABLES[id].name : '???');
      setText(t.lvl, !seen ? '' : ts.unlocked ? `Prestige ${ts.prestige}` : 'Locked');
      setText(
        t.sub,
        !seen
          ? ''
          : ts.unlocked
            ? g.canPrestige(id)
            ? 'Prestige ready ▲'
            : `${fmt(Math.round(g.incomeEstimate(id) * 60))} ${cur} / min`
            : `Unlock: ${fmt(TABLES[id].unlockCost)}`,
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
