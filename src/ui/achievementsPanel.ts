import type { TableId } from '../core/types';
import type { Game } from '../core/game';
import { RARITIES, achievementsFor, maxTier, type AchievementDef } from '../core/achievements';
import { h, setText, toggleClass } from './dom';
import { fmt } from './format';

interface Row {
  def: AchievementDef;
  root: HTMLElement;
  title: HTMLElement;
  progress: HTMLElement;
  perk: HTMLElement;
  fill: HTMLElement;
}

/** Lists a table's achievements with progress toward the next tier and the perk each one grants. */
export class AchievementsCard {
  readonly root: HTMLElement;
  private rows: Row[] = [];
  private summary: HTMLElement;

  constructor(private game: Game, table: TableId) {
    this.summary = h('span', { class: 'level' });
    this.root = h('div', { class: 'card achievements' }, h('h3', {}, 'Achievements ', this.summary));
    for (const def of achievementsFor(table)) {
      const title = h('strong');
      const progress = h('span', { class: 'level' });
      const perk = h('small');
      const fill = h('div', { class: 'bar-fill' });
      const root = h(
        'div',
        { class: 'achievement' },
        h('div', {}, title, ' ', progress),
        h('div', { class: 'bar' }, fill),
        perk,
      );
      this.root.append(root);
      this.rows.push({ def, root, title, progress, perk, fill });
    }
  }

  update(): void {
    const earned = this.rows.filter((r) => (this.game.state.achievements[r.def.id]?.tier ?? 0) > 0).length;
    setText(this.summary, `${earned}/${this.rows.length}`);
    for (const row of this.rows) {
      const { def } = row;
      const p = this.game.state.achievements[def.id] ?? { count: 0, run: 0, best: 0, tier: 0 };
      const top = maxTier(def);
      const done = p.tier >= top;
      const value = def.kind === 'grind' ? p.count : p.best;
      const next = def.targets[Math.min(p.tier, top - 1)];
      const prev = p.tier > 0 ? def.targets[p.tier - 1] : 0;
      const rarity = p.tier > 0 && def.kind === 'streak' ? ` · ${RARITIES[p.tier - 1]}` : '';

      setText(row.title, `${p.tier > 0 ? '🏆' : '🔒'} ${def.name}${rarity}`);
      setText(
        row.progress,
        done ? 'Complete' : def.kind === 'grind' ? `${fmt(value)} / ${fmt(next)}` : `best ${value} / ${next}`,
      );
      row.fill.style.width = `${(done ? 100 : Math.min(1, (value - prev) / (next - prev)) * 100).toFixed(1)}%`;
      const effect = p.tier > 0 ? def.perk.describe(p.tier) : def.perk.describe(1);
      const goal = def.kind === 'grind' ? `${def.goal} ${fmt(next)} times` : `${def.goal}: ${next}`;
      setText(row.perk, p.tier > 0 ? `${def.perk.name}: ${effect}` : `${goal} → ${def.perk.name}: ${effect}`);
      toggleClass(row.root, 'earned', p.tier > 0);
    }
  }
}
