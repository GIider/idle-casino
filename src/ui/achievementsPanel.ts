import type { Game } from '../core/game';
import type { AchievementDef } from '../core/achievements';
import { allUpgrades } from '../core/economy';
import { fmt } from './format';

/** Snapshot of one achievement's progress for the casino-wide achievements page. */
export interface AchievementStatus {
  def: AchievementDef;
  unlocked: boolean;
  /** Unlocked but not yet hovered by the player. */
  isNew: boolean;
  /** 0..1 progress toward the goal (1 once unlocked). */
  fraction: number;
  /** "123 / 1,000", "best 4 / 7", "3 / 5 owned" or "Complete". */
  label: string;
  /** The unlock requirement; kept visible once unlocked. */
  goal: string;
  /** The perk's effect. */
  effect: string;
}

export function achievementStatus(game: Game, def: AchievementDef): AchievementStatus {
  const p = game.state.achievements[def.id] ?? { count: 0, run: 0, best: 0, unlocked: false, seen: true };
  const effect = def.perk.describe();
  const unlocked = p.unlocked;
  if (def.kind === 'collect') {
    const upgrades = allUpgrades(game.def(def.table));
    const levels = game.table(def.table).levels;
    const owned = upgrades.filter((u) => (levels[u.id] ?? 0) >= 1).length;
    return {
      def, unlocked, isNew: unlocked && !p.seen, effect,
      fraction: unlocked ? 1 : owned / Math.max(1, upgrades.length),
      label: unlocked ? 'Complete' : `${owned} / ${upgrades.length} owned`,
      goal: 'Own every upgrade',
    };
  }
  const value = def.kind === 'grind' ? p.count : p.best;
  return {
    def, unlocked, isNew: unlocked && !p.seen, effect,
    fraction: unlocked ? 1 : Math.min(1, Math.max(0, value / def.target)),
    label: unlocked ? 'Complete' : def.kind === 'grind' ? `${fmt(value)} / ${fmt(def.target)}` : `best ${value} / ${def.target}`,
    goal: def.kind === 'grind' ? `${def.goal} ${fmt(def.target)} times` : `${def.goal}: ${def.target}`,
  };
}
