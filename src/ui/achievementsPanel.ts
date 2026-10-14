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
  goal: HTMLElement;
  gain: HTMLElement;
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
      const goal = h('div', { class: 'goal' });
      const gain = h('div', { class: 'gain' });
      const fill = h('div', { class: 'bar-fill' });
      const root = h(
        'div',
        { class: 'achievement' },
        h('div', {}, title, ' ', progress),
        h('div', { class: 'bar' }, fill),
        goal,
        gain,
      );
      this.root.append(root);
      this.rows.push({ def, root, title, progress, goal, gain, fill });
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
      const rarity = p.tier > 0 ? ` · ${RARITIES[p.tier - 1]}` : '';

      setText(row.title, `${p.tier > 0 ? '🏆' : '🔒'} ${def.perk.name}${rarity}`);
      setText(
        row.progress,
        done ? 'Complete' : def.kind === 'grind' ? `${fmt(value)} / ${fmt(next)}` : `best ${value} / ${next}`,
      );
      row.fill.style.transform = `scaleX(${done ? 1 : Math.min(1, (value - prev) / (next - prev))})`;
      const effect = p.tier > 0 ? def.perk.describe(p.tier) : def.perk.describe(1);
      const goal = def.kind === 'grind' ? `${def.goal} ${fmt(next)} times` : `${def.goal}: ${next}`;
      setText(row.goal, done ? '' : `▸ ${goal}`);
      toggleClass(row.goal, 'hidden', done);
      setText(row.gain, `✦ ${effect}`);
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
    setText(row.title, `${p.tier > 0 ? '🏆' : '🔒'} ${def.perk.name}${rarity}`);
    setText(row.progress, done ? 'Complete' : `${have} / ${upgrades.length} ${p.tier === 0 ? 'owned' : 'maxed'}`);
    row.fill.style.transform = `scaleX(${done ? 1 : have / upgrades.length})`;
    const goal = p.tier === 0 ? 'Own every upgrade' : 'Max every upgrade';
    const effect = def.perk.describe(nextTier);
    setText(row.goal, done ? '' : `▸ ${goal}`);
    toggleClass(row.goal, 'hidden', done);
    setText(row.gain, `✦ ${effect}`);
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
    const grind = def.kind === 'grind';
    if (grind) {
      lines.push(`${def.goal}, counted in total across all your plays.`);
      lines.push(`Progress: ${fmt(p.count)} so far.`);
    } else {
      lines.push(`${def.goal}. Only your longest run counts, and a miss resets the current run.`);
      lines.push(`Longest run: ${p.best} · current run: ${p.run}.`);
    }
    def.targets.forEach((target, i) => {
      const mark = p.tier > i ? '✓' : '•';
      lines.push(`${mark} ${RARITIES[i]} (${grind ? fmt(target) : target}): ${def.perk.describe(i + 1)}`);
    });
    lines.push('Each tier upgrades the same perk.');
    lines.push('Automatic table play counts; offline progress does not.');
    lines.push('The perk is permanent and survives prestige and ascension.');
    return lines.join('\n');
  }
}

/** Snapshot of one achievement's progress, shared by the casino-wide achievements page. */
export interface AchievementStatus {
  def: AchievementDef;
  tier: number;
  top: number;
  done: boolean;
  /** 0..1 progress toward the next tier (1 when complete). */
  fraction: number;
  /** "123 / 1,000", "best 4 / 7", "3 / 5 owned" or "Complete". */
  label: string;
  /** What to do next; empty when complete. */
  goal: string;
  /** Perk text for the current tier (or the first tier while locked). */
  effect: string;
  /** Perk text for the next tier; empty when complete. */
  nextEffect: string;
}

export function achievementStatus(game: Game, def: AchievementDef): AchievementStatus {
  const p = game.state.achievements[def.id] ?? { count: 0, run: 0, best: 0, tier: 0 };
  const top = maxTier(def);
  const done = p.tier >= top;
  const effect = def.perk.describe(Math.max(1, p.tier));
  const nextEffect = done ? '' : def.perk.describe(p.tier + 1);
  if (def.kind === 'collect') {
    const upgrades = allUpgrades(game.def(def.table));
    const levels = game.table(def.table).levels;
    const have =
      p.tier === 0
        ? upgrades.filter((u) => (levels[u.id] ?? 0) >= 1).length
        : upgrades.filter((u) => (levels[u.id] ?? 0) >= u.maxLevel).length;
    return {
      def, tier: p.tier, top, done,
      fraction: done ? 1 : have / Math.max(1, upgrades.length),
      label: done ? 'Complete' : `${have} / ${upgrades.length} ${p.tier === 0 ? 'owned' : 'maxed'}`,
      goal: done ? '' : p.tier === 0 ? 'Own every upgrade' : 'Max every upgrade',
      effect, nextEffect,
    };
  }
  const value = def.kind === 'grind' ? p.count : p.best;
  const next = def.targets[Math.min(p.tier, top - 1)];
  const prev = p.tier > 0 ? def.targets[p.tier - 1] : 0;
  return {
    def, tier: p.tier, top, done,
    fraction: done ? 1 : Math.min(1, Math.max(0, (value - prev) / (next - prev))),
    label: done ? 'Complete' : def.kind === 'grind' ? `${fmt(value)} / ${fmt(next)}` : `best ${value} / ${next}`,
    goal: done ? '' : def.kind === 'grind' ? `${def.goal} ${fmt(next)} times` : `${def.goal}: ${next}`,
    effect, nextEffect,
  };
}
