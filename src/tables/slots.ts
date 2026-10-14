import type { TableDef } from '../core/types';
import { pickWeighted } from '../core/rng';
import { CASCADE_SPINS, FREE_SPINS, HOLD_CHANCE, JACKPOT_SEED, SCATTER_PAY, WILD_REACH } from '../core/achievements';

export const SYMBOLS = ['🍒', '🍋', '🔔', '🍀', '7️⃣', '💎'];
/** Payout multiplier for three of a kind. */
const TRIPLE_PAYOUT = [5, 8, 15, 30, 80, 200];
const BASE_WEIGHTS = [40, 30, 15, 10, 4, 1];

export function slotWeights(cherries: number): number[] {
  return [BASE_WEIGHTS[0] + 1.5 * cherries, ...BASE_WEIGHTS.slice(1)];
}

export const slots: TableDef = {
  id: 'slots',
  name: 'Slots',
  icon: '🎰',
  blurb: 'Three reels, rare symbols, big numbers. Two cherries return your stake.',
  currency: { name: 'Tokens', icon: '🎟️' },
  stakeCost: 0.3,
  unlockCost: 1500,
  baseMinBet: 5,
  baseMaxBet: 100,
  baseMaxPayout: 5000,
  baseWinBonus: 0.27,
  upgrades: [
    {
      id: 'loaded',
      name: 'Cherry Picker',
      description: 'Stacks the reels with cherries, making pairs and triples more likely',
      baseCost: 40,
      growth: 1.8,
      maxLevel: 10,
    },
  ],
  play(rng, levels) {
    const weights = slotWeights(levels.loaded ?? 0);
    const spin = () => [0, 1, 2].map(() => pickWeighted(rng, weights));
    const wild = levels.perk_diamondMine ? WILD_REACH : -1;
    const jackpot = levels.perk_collect_slots ? JACKPOT_SEED : 0;
    const isTriple = (r: number[]) => r[0] === r[1] && r[1] === r[2];

    /** Payout multiple of one set of reels, wild diamonds included. */
    const line = (r: number[]): number => {
      let triple = isTriple(r) ? r[0] : -1;
      if (triple < 0 && wild >= 0) {
        // Wild Diamond: 💎 completes a line of a symbol it is allowed to stand in for.
        const rest = r.filter((x) => x !== 5);
        if (rest.length > 0 && rest.length < 3 && rest.every((x) => x === rest[0]) && rest[0] <= wild) triple = rest[0];
      }
      if (triple >= 0) return TRIPLE_PAYOUT[triple] + (triple === 5 && isTriple(r) ? jackpot : 0);
      return r.filter((x) => x === 0).length === 2 ? 1 : 0;
    };

    let reels = spin();
    // Hold & Respin: now and then the cherries stay and everything else spins again.
    const hold = levels.perk_cherrySeason ? HOLD_CHANCE : 0;
    if (hold > 0 && reels.some((r) => r === 0) && !isTriple(reels) && rng() < hold) {
      const next = spin();
      reels = reels.map((r, k) => (r === 0 ? r : next[k]));
    }
    let mult = line(reels);
    const notes: string[] = [];
    let cascaded = false;
    let freed = false;
    // Cascade: a three of a kind chains into free spins until one misses.
    const cascade = levels.perk_tripleCrown ? CASCADE_SPINS : 0;
    if (cascade > 0 && isTriple(reels)) {
      for (let i = 0; i < cascade; i++) {
        const extra = spin();
        mult += line(extra);
        if (!isTriple(extra)) break;
        notes.push('cascade');
        cascaded = true;
      }
    }
    // Free Spins: a 2x+ win earns spins that pay in full.
    const free = levels.perk_hotStreak ? FREE_SPINS : 0;
    if (free > 0 && mult >= 2) {
      for (let i = 0; i < free; i++) mult += line(spin());
      freed = true;
      notes.push(`${free} free spin${free > 1 ? 's' : ''}`);
    }
    // Scatter Sevens: every seven anywhere pays.
    const scatter = levels.perk_sevenHeaven ? SCATTER_PAY : 0;
    const sevens = reels.filter((r) => r === 4).length;
    if (scatter > 0 && sevens > 0) {
      mult += scatter * sevens;
      notes.push(`${sevens}× scatter`);
    }
    const detail = reels.map((r) => SYMBOLS[r]).join(' ') + (notes.length ? ` (${notes.join(', ')})` : '');
    return { mult, detail, view: { kind: 'slots', reels, cascade: cascaded, freeSpins: freed, scatter: scatter > 0 && sevens > 0 } };
  },
};
