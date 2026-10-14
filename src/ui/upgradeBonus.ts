import {
  AUTO_BET_FRACTIONS,
  CASHBACK_PER_LEVEL,
  DEALER_CHANCE_PER_LEVEL,
  SPEED_PER_LEVEL,
  STREAK_BONUS_PER_LEVEL,
  STREAK_CAP,
  PAYOUT_ENDLESS_EFFECT,
} from '../core/economy';

const pct = (x: number): string => `${Number((x * 100).toFixed(1))}%`;

/** What an upgrade does in total at `level`, in plain words (display only; mirrors the formulas in core/economy). */
export function bonusLabel(upgradeId: string, level: number): string {
  const l = level;
  switch (upgradeId) {
    case 'luck':
      return `${pct(0.03 * l)} chance to re-roll a loss`;
    case 'payout':
      return l > 20
        ? `×${(2.6 * PAYOUT_ENDLESS_EFFECT ** (l - 20)).toFixed(2)} on all winnings`
        : `+${pct(0.08 * l)} on all winnings`;
    case 'speed':
      return `${(1 + SPEED_PER_LEVEL * l).toFixed(1)}× plays per second`;
    case 'streak':
      return `+${pct(STREAK_BONUS_PER_LEVEL * l)} per win in a row (up to +${pct(STREAK_BONUS_PER_LEVEL * l * STREAK_CAP)})`;
    case 'cashback':
      return `${pct(CASHBACK_PER_LEVEL * l)} of a lost bet back`;
    case 'dealer':
      return `${pct(DEALER_CHANCE_PER_LEVEL * l)} chance of a bonus play`;
    case 'autobet':
      return `${pct(AUTO_BET_FRACTIONS[Math.min(l, AUTO_BET_FRACTIONS.length - 1)])} of the wallet per play`;
    case 'edge':
      return `${(55 + 1.8 * l).toFixed(1)}% chance of heads`;
    case 'zero':
      return `${pct(0.2 * l)} chance to re-spin a zero`;
    case 'sleeve':
      return `${pct(0.05 * l)} chance of an ace and a ten`;
    case 'insure':
      return `${pct(0.2 * l)} chance a bust refunds half`;
    case 'magnet':
      return l > 0 ? `${1 + 2 * l} pockets around 17` : 'Only pocket 17';
    case 'strategy':
      return l >= 2 ? 'Stands on 12 and 13 vs weak cards' : l === 1 ? 'Stands on 12 vs 4-6' : 'Always hits to 17';
    case 'bet_dozen':
    case 'bet_number':
      return l > 0 ? 'Bet active' : 'Bet not placed';
    default:
      return l > 0 ? `Level ${l} active` : 'Not active yet';
  }
}
