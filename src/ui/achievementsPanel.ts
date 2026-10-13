import type { AchievementProgress, TableId } from '../core/types';
import type { Game } from '../core/game';
import { RARITIES, achievementsFor, maxTier, type AchievementDef } from '../core/achievements';
import { allUpgrades } from '../core/economy';
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

  constructor(private game: Game, private table: TableId) {
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
      if (def.kind === 'collect') {
        this.updateCollection(row, p);
        continue;
      }
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
      row.root.title = this.tooltip(def, p);
    }
  }

  /** Collection achievements: progress is how many of the table's upgrades are owned (tier 1) or maxed (tier 2). */
  private updateCollection(row: Row, p: AchievementProgress): void {
    const { def } = row;
    const levels = this.game.table(this.table).levels;
    const upgrades = allUpgrades(this.game.def(this.table));
    const owned = upgrades.filter((u) => (levels[u.id] ?? 0) >= 1).length;
    const maxed = upgrades.filter((u) => (levels[u.id] ?? 0) >= u.maxLevel).length;
    const top = maxTier(def);
    const done = p.tier >= top;
    const nextTier = Math.min(top, p.tier + 1);
    const have = p.tier === 0 ? owned : maxed;
    const rarity = p.tier > 0 ? ` · ${RARITIES[p.tier - 1]}` : '';
    setText(row.title, `${p.tier > 0 ? '🏆' : '🔒'} ${def.name}${rarity}`);
    setText(row.progress, done ? 'Complete' : `${have} / ${upgrades.length} ${p.tier === 0 ? 'owned' : 'maxed'}`);
    row.fill.style.width = `${(done ? 100 : (have / upgrades.length) * 100).toFixed(1)}%`;
    const goal = p.tier === 0 ? 'Own every upgrade' : 'Max every upgrade';
    const effect = def.perk.describe(nextTier);
    setText(row.perk, done ? `${def.perk.name}: ${effect}` : `${goal} → ${def.perk.name}: ${effect}`);
    toggleClass(row.root, 'earned', p.tier > 0);
    row.root.title = [
      `Own at least one level of every upgrade on this table (Rare: ${def.perk.describe(1)}),`,
      `then max them all (Epic: ${def.perk.describe(2)}).`,
      'Current: ' + `${owned}/${upgrades.length} owned, ${maxed}/${upgrades.length} maxed.`,
      'Tiers are permanent and survive prestige and ascension.',
    ].join('\n');
  }

  /** Full explanation shown on hover: the goal, every tier's reward, and how progress is counted. */
  private tooltip(def: AchievementDef, p: AchievementProgress): string {
    const lines: string[] = [];
    if (def.kind === 'grind') {
      lines.push(`${def.goal} ${fmt(def.targets[0])} times in total.`);
      lines.push(`Progress: ${fmt(p.count)} so far.`);
      lines.push(`Reward — ${def.perk.name}: ${def.perk.describe(1)}.`);
    } else {
      lines.push(`${def.goal}. Only your longest run counts, and a miss resets the current run.`);
      lines.push(`Longest run: ${p.best} · current run: ${p.run}.`);
      def.targets.forEach((target, i) => {
        const mark = p.tier > i ? '✓' : '•';
        lines.push(`${mark} ${RARITIES[i]} (${target}): ${def.perk.name} — ${def.perk.describe(i + 1)}`);
      });
      lines.push('Each tier upgrades the same perk.');
    }
    lines.push('Auto-players count; offline progress does not.');
    lines.push('The perk is permanent and survives prestige and ascension.');
    return lines.join('\n');
  }
}
