import type { TableId } from '../core/types';
import type { Game } from '../core/game';
import { achievementsFor } from '../core/achievements';
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
        h('div', { class: 'ach-summary' }, this.summary),
        h('div', { class: 'bar' }, this.summaryFill),
      ),
      h('div', { class: 'card' }, this.filters),
      this.body,
    );
  }

  setHidden(hidden: boolean): void {
    toggleClass(this.root, 'hidden', hidden);
  }

  /** Unlocked / total achievements across every unlocked table. */
  totals(): { earned: number; total: number } {
    let earned = 0;
    let total = 0;
    for (const id of TABLE_IDS) {
      if (!this.game.state.tables[id].unlocked) continue;
      for (const def of achievementsFor(id)) {
        const s = achievementStatus(this.game, def);
        if (s.unlocked) earned++;
        total++;
      }
    }
    return { earned, total };
  }

  update(): void {
    const g = this.game;
    const visible = TABLE_IDS.filter((id) => g.state.tables[id].unlocked);
    if (this.tableFilter !== 'all' && !visible.includes(this.tableFilter)) this.tableFilter = 'all';

    const all = new Map<TableId, AchievementStatus[]>();
    let earned = 0;
    let total = 0;
    for (const id of visible) {
      const list = achievementsFor(id).map((def) => achievementStatus(g, def));
      all.set(id, list);
      for (const s of list) {
        if (s.unlocked) earned++;
        total++;
      }
    }
    setText(this.summary, `${earned} / ${total} achievements unlocked`);
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
      [...all].map(([id, l]) => [id, l.map((s) => [s.def.id, s.unlocked, s.label])]),
    ]);
    if (key === this.key) return;
    this.key = key;
    this.render(all, visible);
  }

  private matches(s: AchievementStatus): boolean {
    switch (this.statusFilter) {
      case 'done': return s.unlocked;
      case 'locked': return !s.unlocked && s.fraction === 0;
      case 'progress': return !s.unlocked && s.fraction > 0;
      default: return true;
    }
  }

  private render(all: Map<TableId, AchievementStatus[]>, visible: TableId[]): void {
    const sections: HTMLElement[] = [];
    // "Next up": the closest unfinished goals across the casino.
    if (this.tableFilter === 'all' && this.statusFilter === 'all') {
      const next = [...all.values()]
        .flat()
        .filter((s) => !s.unlocked && s.fraction > 0)
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
      const shown = list.filter((s) => this.matches(s)).sort((a, b) => Number(a.unlocked) - Number(b.unlocked) || b.fraction - a.fraction);
      if (!shown.length) continue;
      const earned = list.filter((s) => s.unlocked).length;
      const total = list.length;
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
        h('small', { text: `${earned}/${total}` }),
      );
      const sec = h('div', { class: 'card ach-section' }, head);
      if (!closed) sec.append(h('div', { class: 'ach-grid' }, ...shown.map((s) => this.cardFor(s, false))));
      sections.push(sec);
    }
    if (!sections.length) sections.push(h('div', { class: 'card', text: 'Nothing matches these filters.' }));
    this.body.replaceChildren(...sections);
  }

  private cardFor(s: AchievementStatus, withTable: boolean): HTMLElement {
    const fill = h('div', { class: 'bar-fill' });
    fill.style.transform = `scaleX(${s.fraction})`;
    return h(
      'div',
      { class: `achievement ach-card${s.unlocked ? ' earned maxed' : ''}`, title: s.def.goal },
      h('div', { class: 'ach-title' }, h('strong', { text: `${s.unlocked ? '🏆' : '🔒'} ${s.def.perk.name}` })),
      h('small', { class: 'ach-sub', text: `${withTable ? `${TABLES[s.def.table].name} · ` : ''}${s.def.kind}` }),
      h('div', { class: 'bar' }, fill),
      h('div', { class: 'level', text: s.label }),
      ...(s.goal ? [h('div', { class: 'goal', text: `▸ ${s.goal}` })] : []),
      h('div', { class: 'gain', text: `✦ ${s.effect}` }),
    );
  }
}
