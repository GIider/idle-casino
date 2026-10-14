import type { TableId } from '../core/types';
import type { Game } from '../core/game';
import { RARITIES, achievementsFor } from '../core/achievements';
import { TABLES, TABLE_IDS } from '../tables';
import { h, setText, toggleClass } from './dom';
import { achievementStatus, type AchievementStatus } from './achievementsPanel';

type StatusFilter = 'all' | 'progress' | 'done' | 'locked';

const STATUS_LABELS: [StatusFilter, string][] = [
  ['all', 'All'],
  ['progress', 'In progress'],
  ['done', 'Completed'],
  ['locked', 'Locked'],
];

/** Casino-wide overview of every table's achievements, with filters and the closest goals first. */
export class AchievementsPage {
  readonly root: HTMLElement;
  private summary: HTMLElement;
  private summaryFill: HTMLElement;
  private rarityEl: HTMLElement;
  private filters: HTMLElement;
  private body: HTMLElement;
  private tableFilter: TableId | 'all' = 'all';
  private statusFilter: StatusFilter = 'all';
  private collapsed = new Set<TableId>();
  private key = '';
  private tableBtns = new Map<TableId | 'all', HTMLButtonElement>();
  private statusBtns = new Map<StatusFilter, HTMLButtonElement>();

  constructor(private game: Game) {
    this.summary = h('strong');
    this.summaryFill = h('div', { class: 'bar-fill' });
    this.rarityEl = h('small', { class: 'ach-rarities' });
    this.filters = h('div', { class: 'ach-filters' });
    this.body = h('div', { class: 'ach-body' });

    const tableRow = h('div', { class: 'history-range side-tabs' });
    for (const id of ['all', ...TABLE_IDS] as const) {
      const btn = h('button', {
        class: 'btn small',
        text: id === 'all' ? 'All tables' : TABLES[id].name,
        onclick: () => {
          this.tableFilter = id;
          this.update();
        },
      });
      this.tableBtns.set(id, btn);
      tableRow.append(btn);
    }
    const statusRow = h('div', { class: 'history-range side-tabs' });
    for (const [id, label] of STATUS_LABELS) {
      const btn = h('button', {
        class: 'btn small',
        text: label,
        onclick: () => {
          this.statusFilter = id;
          this.update();
        },
      });
      this.statusBtns.set(id, btn);
      statusRow.append(btn);
    }
    this.filters.append(tableRow, statusRow);

    this.root = h(
      'section',
      { class: 'panel hidden' },
      h(
        'div',
        { class: 'card header-card' },
        h('h2', { text: '🏆 Achievements' }),
        h('div', { class: 'ach-summary' }, this.summary, this.rarityEl),
        h('div', { class: 'bar' }, this.summaryFill),
      ),
      h('div', { class: 'card' }, this.filters),
      this.body,
    );
  }

  setHidden(hidden: boolean): void {
    toggleClass(this.root, 'hidden', hidden);
  }

  /** Earned tiers / total tiers across every discovered table. */
  totals(): { earned: number; total: number } {
    let earned = 0;
    let total = 0;
    for (const id of TABLE_IDS) {
      if (!this.game.tableVisible(id)) continue;
      for (const def of achievementsFor(id)) {
        const s = achievementStatus(this.game, def);
        earned += s.tier;
        total += s.top;
      }
    }
    return { earned, total };
  }

  update(): void {
    const g = this.game;
    const visible = TABLE_IDS.filter((id) => g.tableVisible(id));
    if (this.tableFilter !== 'all' && !visible.includes(this.tableFilter)) this.tableFilter = 'all';

    const all = new Map<TableId, AchievementStatus[]>();
    const rarity = [0, 0, 0];
    let earned = 0;
    let total = 0;
    for (const id of visible) {
      const list = achievementsFor(id).map((def) => achievementStatus(g, def));
      all.set(id, list);
      for (const s of list) {
        earned += s.tier;
        total += s.top;
        for (let i = 0; i < s.tier && i < 3; i++) rarity[i]++;
      }
    }
    setText(this.summary, `${earned} / ${total} tiers earned`);
    setText(this.rarityEl, RARITIES.map((r, i) => `${r} ${rarity[i]}`).join(' · '));
    this.summaryFill.style.transform = `scaleX(${total ? earned / total : 0})`;

    for (const [id, btn] of this.tableBtns) {
      toggleClass(btn, 'active', this.tableFilter === id);
      toggleClass(btn, 'hidden', id !== 'all' && !visible.includes(id));
    }
    for (const [id, btn] of this.statusBtns) toggleClass(btn, 'active', this.statusFilter === id);

    const key = JSON.stringify([
      this.tableFilter,
      this.statusFilter,
      [...this.collapsed],
      [...all].map(([id, l]) => [id, l.map((s) => [s.def.id, s.tier, s.label])]),
    ]);
    if (key === this.key) return;
    this.key = key;
    this.render(all, visible);
  }

  private matches(s: AchievementStatus): boolean {
    switch (this.statusFilter) {
      case 'done': return s.done;
      case 'locked': return s.tier === 0;
      case 'progress': return s.tier > 0 && !s.done;
      default: return true;
    }
  }

  private render(all: Map<TableId, AchievementStatus[]>, visible: TableId[]): void {
    const sections: HTMLElement[] = [];
    // "Next up": the closest unfinished goals across the casino.
    if (this.tableFilter === 'all' && this.statusFilter === 'all') {
      const next = [...all.values()]
        .flat()
        .filter((s) => !s.done && s.fraction > 0)
        .sort((a, b) => b.fraction - a.fraction)
        .slice(0, 4);
      if (next.length) {
        sections.push(
          h('div', { class: 'card ach-next' }, h('h3', { text: 'Next up' }), h('div', { class: 'ach-grid' }, ...next.map((s) => this.cardFor(s, true)))),
        );
      }
    }
    for (const id of visible) {
      if (this.tableFilter !== 'all' && this.tableFilter !== id) continue;
      const list = all.get(id)!;
      const shown = list.filter((s) => this.matches(s)).sort((a, b) => Number(a.done) - Number(b.done) || b.fraction - a.fraction);
      if (!shown.length) continue;
      const earned = list.reduce((n, s) => n + s.tier, 0);
      const total = list.reduce((n, s) => n + s.top, 0);
      const closed = this.collapsed.has(id);
      const head = h(
        'button',
        {
          class: 'ach-head',
          title: closed ? 'Expand' : 'Collapse',
          onclick: () => {
            if (this.collapsed.has(id)) this.collapsed.delete(id);
            else this.collapsed.add(id);
            this.update();
          },
        },
        h('span', { text: `${closed ? '▸' : '▾'} ${TABLES[id].icon} ${TABLES[id].name}` }),
        h('small', { text: `${earned}/${total} tiers` }),
      );
      const sec = h('div', { class: 'card ach-section' }, head);
      if (!closed) sec.append(h('div', { class: 'ach-grid' }, ...shown.map((s) => this.cardFor(s, false))));
      sections.push(sec);
    }
    if (!sections.length) sections.push(h('div', { class: 'card', text: 'Nothing matches these filters.' }));
    this.body.replaceChildren(...sections);
  }

  private cardFor(s: AchievementStatus, withTable: boolean): HTMLElement {
    const pips = h('span', { class: 'ach-pips' });
    for (let i = 0; i < s.top; i++) {
      pips.append(h('span', { class: `ach-pip r${i}${s.tier > i ? ' on' : ''}`, title: RARITIES[i] }));
    }
    const fill = h('div', { class: 'bar-fill' });
    fill.style.transform = `scaleX(${s.fraction})`;
    const rarity = s.tier > 0 ? RARITIES[s.tier - 1] : 'Locked';
    return h(
      'div',
      { class: `achievement ach-card${s.tier > 0 ? ' earned' : ''}${s.done ? ' maxed' : ''}`, title: s.def.goal },
      h('div', { class: 'ach-title' }, h('strong', { text: `${s.tier > 0 ? '🏆' : '🔒'} ${s.def.perk.name}` }), pips),
      h('small', { class: 'ach-sub', text: `${withTable ? `${TABLES[s.def.table].name} · ` : ''}${s.def.kind} · ${rarity}` }),
      h('div', { class: 'bar' }, fill),
      h('div', { class: 'level', text: s.label }),
      ...(s.goal ? [h('div', { class: 'goal', text: `▸ ${s.goal}` })] : []),
      h('div', { class: 'gain', text: `✦ ${s.tier > 0 ? s.effect : s.nextEffect}` }),
      ...(s.tier > 0 && s.nextEffect ? [h('small', { class: 'ach-next-gain', text: `Next: ${s.nextEffect}` })] : []),
    );
  }
}
