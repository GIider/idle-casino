import type { TableId } from '../core/types';
import type { Game } from '../core/game';
import { achievementsFor, type AchievementDef } from '../core/achievements';
import { TABLES, TABLE_IDS } from '../tables';
import { annotate } from './glossary';
import { h, setText, toggleClass } from './dom';
import { achievementStatus, type AchievementStatus } from './achievementsPanel';

type StatusFilter = 'all' | 'new' | 'progress' | 'done';

type KindFilter = 'all' | AchievementDef['kind'];

const KIND_LABELS: [KindFilter, string][] = [
  ['all', 'All types'],
  ['grind', 'Grind'],
  ['streak', 'Streak'],
  ['collect', 'Collect'],
];

const KIND_ICONS: Record<AchievementDef['kind'], string> = { grind: '🔁', streak: '🔥', collect: '🧩' };

const STATUS_LABELS: [StatusFilter, string][] = [
  ['all', 'All'],
  ['new', 'New'],
  ['progress', 'In progress'],
  ['done', 'Completed'],
];

const UPDATE_MS = 400;

/** Casino-wide overview of every table's achievements, with filters and the closest goals first. */
export class AchievementsPage {
  readonly root: HTMLElement;
  private summary: HTMLElement;
  private summaryFill: HTMLElement;
  private filters: HTMLElement;
  private body: HTMLElement;
  private tableFilter: TableId | 'all' = 'all';
  private statusFilter: StatusFilter = 'all';
  private kindFilter: KindFilter = 'all';
  private collapsed = new Set<TableId>();
  private key = '';
  private updatedAt = 0;
  /** Achievements hovered while the New filter is on: they stay listed there until the filter or page changes. */
  private pinned = new Set<string>();
  private tableBtns = new Map<TableId | 'all', HTMLButtonElement>();
  private statusBtns = new Map<StatusFilter, HTMLButtonElement>();
  private kindBtns = new Map<KindFilter, HTMLButtonElement>();
  private tableChips = new Map<TableId, { root: HTMLButtonElement; count: HTMLElement; fill: HTMLElement }>();

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
          this.update(true);
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
          this.pinned.clear();
          this.update(true);
        },
      });
      this.statusBtns.set(id, btn);
      statusRow.append(btn);
    }
    const kindRow = h('div', { class: 'history-range side-tabs' });
    for (const [id, label] of KIND_LABELS) {
      const btn = h('button', {
        class: 'btn small',
        text: label,
        onclick: () => {
          this.kindFilter = id;
          this.update(true);
        },
      });
      this.kindBtns.set(id, btn);
      kindRow.append(btn);
    }

    const chips = h('div', { class: 'ach-tables' });
    for (const id of TABLE_IDS) {
      const count = h('small');
      const fill = h('div', { class: 'bar-fill' });
      const root = h(
        'button',
        {
          class: 'ach-chip',
          title: `Show ${TABLES[id].name} achievements`,
          onclick: () => {
            this.tableFilter = this.tableFilter === id ? 'all' : id;
            this.update(true);
          },
        },
        h('span', { class: 'ach-chip-name', text: `${TABLES[id].icon} ${TABLES[id].name}` }),
        count,
        h('div', { class: 'bar' }, fill),
      );
      this.tableChips.set(id, { root, count, fill });
      chips.append(root);
    }
    const labelled = (label: string, row: HTMLElement) => h('div', { class: 'ach-filter-row' }, h('span', { class: 'ach-filter-label', text: label }), row);
    this.filters.append(labelled('Table', tableRow), labelled('Status', statusRow), labelled('Type', kindRow));

    this.root = h(
      'section',
      { class: 'panel hidden' },
      h(
        'div',
        { class: 'card header-card ach-hero' },
        h(
          'div',
          { class: 'ach-hero-top' },
          h('span', { class: 'ach-trophy', text: '🏆' }),
          h('div', { class: 'ach-hero-text' }, h('h2', { text: 'Achievements' }), h('div', { class: 'ach-summary' }, this.summary)),
        ),
        h('div', { class: 'bar ach-hero-bar' }, this.summaryFill),
        chips,
      ),
      h('div', { class: 'card' }, this.filters),
      this.body,
    );
  }

  setHidden(hidden: boolean): void {
    toggleClass(this.root, 'hidden', hidden);
    if (hidden) this.pinned.clear();
    else this.updatedAt = 0;
  }

  /** Unlocked / total achievements across every unlocked table. */
  totals(): { earned: number; total: number } {
    let earned = 0;
    let total = 0;
    for (const id of TABLE_IDS) {
      if (!this.game.state.tables[id].unlocked) continue;
      for (const def of achievementsFor(id)) {
        if (this.game.state.achievements[def.id]?.unlocked) earned++;
        total++;
      }
    }
    return { earned, total };
  }

  /** Progress text only changes slowly, so the full refresh is rate-limited unless a filter/click forces it. */
  update(force = false): void {
    const now = performance.now();
    if (!force && now - this.updatedAt < UPDATE_MS) return;
    this.updatedAt = now;
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
    for (const [id, chip] of this.tableChips) {
      toggleClass(chip.root, 'hidden', !visible.includes(id));
      toggleClass(chip.root, 'active', this.tableFilter === id);
      const list = all.get(id) ?? [];
      const done = list.filter((x) => x.unlocked).length;
      setText(chip.count, `${done} / ${list.length}`);
      chip.fill.style.transform = `scaleX(${list.length ? done / list.length : 0})`;
      toggleClass(chip.root, 'complete', list.length > 0 && done === list.length);
    }
    setText(this.summary, `${earned} / ${total} achievements unlocked`);
    this.summaryFill.style.transform = `scaleX(${total ? earned / total : 0})`;

    // Each button's counter is the result count if that button were selected, other filters unchanged.
    const count = (t: TableId | 'all', st: StatusFilter, k: KindFilter): number => {
      let n = 0;
      for (const [id, list] of all) {
        if (t !== 'all' && t !== id) continue;
        for (const s of list) if (this.pass(s, st, k)) n++;
      }
      return n;
    };
    for (const [id, btn] of this.tableBtns) {
      toggleClass(btn, 'active', this.tableFilter === id);
      toggleClass(btn, 'hidden', id !== 'all' && !visible.includes(id));
      setText(btn, `${id === 'all' ? 'All tables' : TABLES[id].name} (${count(id, this.statusFilter, this.kindFilter)})`);
    }
    for (const [id, btn] of this.statusBtns) {
      toggleClass(btn, 'active', this.statusFilter === id);
      setText(btn, `${STATUS_LABELS.find(([i]) => i === id)![1]} (${count(this.tableFilter, id, this.kindFilter)})`);
    }
    for (const [id, btn] of this.kindBtns) {
      toggleClass(btn, 'active', this.kindFilter === id);
      setText(btn, `${KIND_LABELS.find(([i]) => i === id)![1]} (${count(this.tableFilter, this.statusFilter, id)})`);
    }

    const key = JSON.stringify([
      this.tableFilter,
      this.kindFilter,
      this.statusFilter,
      [...this.collapsed],
      [...all].map(([id, l]) => [id, l.map((s) => [s.def.id, s.unlocked, s.isNew, s.label])]),
    ]);
    if (key === this.key) return;
    this.key = key;
    this.render(all, visible);
  }

  private matches(s: AchievementStatus): boolean {
    return this.pass(s, this.statusFilter, this.kindFilter);
  }

  private pass(s: AchievementStatus, status: StatusFilter, kind: KindFilter): boolean {
    if (kind !== 'all' && s.def.kind !== kind) return false;
    switch (status) {
      case 'new': return s.isNew || this.pinned.has(s.def.id);
      case 'done': return s.unlocked;
      case 'progress': return !s.unlocked;
      default: return true;
    }
  }

  private render(all: Map<TableId, AchievementStatus[]>, visible: TableId[]): void {
    const sections: HTMLElement[] = [];
    // "Next up": the closest unfinished goals across the casino.
    if (this.tableFilter === 'all' && this.statusFilter === 'all' && this.kindFilter === 'all') {
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
            this.update(true);
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
    const chip = s.isNew ? h('span', { class: 'ach-new', text: 'NEW' }) : null;
    const card = h(
      'div',
      { class: `achievement ach-card${s.unlocked ? ' earned maxed' : ''}${s.isNew ? ' new' : ''}`, title: s.def.goal },
      h(
        'div',
        { class: 'ach-title' },
        h('span', { class: 'ach-medal', text: s.unlocked ? '🏆' : KIND_ICONS[s.def.kind] }),
        h(
          'div',
          { class: 'ach-name' },
          h('strong', {}, ...annotate(s.def.perk.name)),
          h('small', { class: 'ach-sub', text: `${withTable ? `${TABLES[s.def.table].name} · ` : ''}${s.def.kind}` }),
        ),
        ...(chip ? [chip] : []),
      ),
      ...(s.goal ? [h('div', { class: 'goal', text: `▸ ${s.goal}` })] : []),
      h('div', { class: 'ach-progress' }, h('div', { class: 'bar' }, fill), h('span', { class: 'level', text: s.label })),
      h('div', { class: 'gain ach-reward' }, '✦ ', ...annotate(s.effect)),
    );
    if (s.isNew) {
      card.addEventListener('mouseenter', () => {
        this.game.markSeen(s.def.id);
        this.pinned.add(s.def.id);
        card.classList.remove('new');
        chip?.remove();
      });
    }
    return card;
  }
}
