// Generated SVG assets, inlined into the single-file build via Vite's ?raw imports.
import luckSvg from './icons/luck.svg?raw';
import payoutSvg from './icons/payout.svg?raw';
import speedSvg from './icons/speed.svg?raw';
import streakSvg from './icons/streak.svg?raw';
import cashbackSvg from './icons/cashback.svg?raw';
import dealerSvg from './icons/dealer.svg?raw';
import autobetSvg from './icons/autobet.svg?raw';
import weightSvg from './icons/weight.svg?raw';
import trophySvg from './icons/trophy.svg?raw';
import crownSvg from './icons/crown.svg?raw';
import spadeSvg from './icons/spade.svg?raw';
import heartSvg from './icons/heart.svg?raw';
import diamondSvg from './icons/diamond.svg?raw';
import clubSvg from './icons/club.svg?raw';
import coinSvg from './icons/coin.svg?raw';
import chipsSvg from './icons/chips.svg?raw';
import slotsSvg from './icons/slots.svg?raw';
import rouletteSvg from './icons/roulette.svg?raw';
import spotlight from './hero/spotlight.svg?raw';
import coin from './hero/coin.svg?raw';
import chips from './hero/chips.svg?raw';

export const ICONS: Record<string, string> = {
  luck: luckSvg,
  payout: payoutSvg,
  speed: speedSvg,
  streak: streakSvg,
  cashback: cashbackSvg,
  dealer: dealerSvg,
  autobet: autobetSvg,
  weight: weightSvg,
  trophy: trophySvg,
  crown: crownSvg,
  spade: spadeSvg,
  heart: heartSvg,
  diamond: diamondSvg,
  club: clubSvg,
  coin: coinSvg,
  chips: chipsSvg,
  slots: slotsSvg,
  roulette: rouletteSvg,
};

export const HERO = { spotlight, coin, chips };

/** Upgrade id -> icon name. */
export const UPGRADE_ICONS: Record<string, string> = {
  luck: 'luck',
  payout: 'payout',
  speed: 'speed',
  streak: 'streak',
  cashback: 'cashback',
  dealer: 'dealer',
  autobet: 'autobet',
};

export function iconSvg(name: string): string {
  return ICONS[name] ?? ICONS.coin;
}
