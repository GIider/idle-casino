import type { AchievementProgress, TableId } from '../core/types';
import type { Game } from '../core/game';
import { achievementsFor, type AchievementDef } from '../core/achievements';
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

/** Lists a table's achievements with progress toward each goal and the perk it grants. */
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
    const earned = this.rows.filter((r) => this.game.state.achievements[r.def.id]?.unlocked).length;
    setText(this.summary, `${earned}/${this.rows.length}`);
    for (const row of this.rows) {
      const s = achievementStatus(this.game, row.def);
      setText(row.title, `${s.unlocked ? '🏆' : '🔒'} ${row.def.perk.name}`);
      setText(row.progress, s.label);
      row.fill.style.transform = `scaleX(${s.fraction})`;
      setText(row.goal, s.goal ? `▸ ${s.goal}` : '');
      setText(row.gain, `✦ ${s.effect}`);
      toggleClass(row.root, 'earned', s.unlocked);
      row.root.title = this.tooltip(row.def, this.game.state.achievements[row.def.id]);
    }
  }

  /** Full explanation shown on hover: the goal, the reward, and how progress is counted. */
  private tooltip(def: AchievementDef, p: AchievementProgress | undefined): string {
    const lines: string[] = [];
    if (def.kind === 'collect') {
      const levels = this.game.table(this.table).levels;
      const upgrades = allUpgrades(this.game.def(this.table));
      const owned = upgrades.filter((u) => (levels[u.id] ?? 0) >= 1).length;
      const maxed = upgrades.filter((u) => (levels[u.id] ?? 0) >= u.maxLevel).length;
      lines.push('Own at least one level of every upgrade on this table, then max them all.');
      lines.push(`Current: ${owned}/${upgrades.length} owned, ${maxed}/${upgrades.length} maxed.`);
    } else if (def.kind === 'grind') {
      lines.push(`${def.goal}, counted in total across all your plays.`);
      lines.push(`Progress: ${fmt(p?.count ?? 0)} of ${fmt(def.target)}.`);
    } else {
      lines.push(`${def.goal}. Only your longest run counts, and a miss resets the current run.`);
      lines.push(`Longest run: ${p?.best ?? 0} of ${def.target} · current run: ${p?.run ?? 0}.`);
    }
    lines.push(`Reward: ${def.perk.describe()}`);
    lines.push('Automatic table play counts; offline progress does not.');
    lines.push('The perk is permanent and survives prestige and ascension.');
    return lines.join('\n');
  }
}

/** Snapshot of one achievement's progress, shared by the casino-wide achievements page. */
export interface AchievementStatus {
  def: AchievementDef;
  unlocked: boolean;
  /** 0..1 progress toward the goal (1 once unlocked). */
  fraction: number;
  /** "123 / 1,000", "best 4 / 7", "3 / 5 maxed" or "Complete". */
  label: string;
  /** The unlock requirement; kept visible once unlocked. */
  goal: string;
  /** The perk's effect. */
  effect: string;
}

export function achievementStatus(game: Game, def: AchievementDef): AchievementStatus {
  const p = game.state.achievements[def.id] ?? { count: 0, run: 0, best: 0, unlocked: false };
  const effect = def.perk.describe();
  const unlocked = p.unlocked;
  if (def.kind === 'collect') {
    const upgrades = allUpgrades(game.def(def.table));
    const levels = game.table(def.table).levels;
    const owned = upgrades.filter((u) => (levels[u.id] ?? 0) >= 1).length;
    const maxed = upgrades.filter((u) => (levels[u.id] ?? 0) >= u.maxLevel).length;
    const allOwned = owned === upgrades.length;
    const have = allOwned ? maxed : owned;
    return {
      def, unlocked, effect,
      fraction: unlocked ? 1 : have / Math.max(1, upgrades.length),
      label: unlocked ? 'Complete' : `${have} / ${upgrades.length} ${allOwned ? 'maxed' : 'owned'}`,
      goal: !unlocked && allOwned ? 'Max every upgrade' : 'Own every upgrade, then max them all',
    };
  }
  const value = def.kind === 'grind' ? p.count : p.best;
  return {
    def, unlocked, effect,
    fraction: unlocked ? 1 : Math.min(1, Math.max(0, value / def.target)),
    label: unlocked ? 'Complete' : def.kind === 'grind' ? `${fmt(value)} / ${fmt(def.target)}` : `best ${value} / ${def.target}`,
    goal: def.kind === 'grind' ? `${def.goal} ${fmt(def.target)} times` : `${def.goal}: ${def.target}`,
  };
}
