import { h } from './dom';

/** Plain-language meanings of the gambling terms used around the casino, keyed by lowercase term. */
export const GLOSSARY: Record<string, string> = {
  natural: 'A blackjack: an ace plus a ten-value card as your first two cards. Pays 3:2.',
  charlie: 'A hand of five or more cards that has not busted. It wins automatically.',
  bust: 'Going over 21. A busted hand loses immediately.',
  push: 'A tie with the dealer: your bet is returned, nothing won or lost.',
  double: 'Doubling down: double the bet on a hand in exchange for exactly one more card.',
  split: 'Splitting a pair into two separate hands, each played on its own.',
  surrender: 'Giving up a hand early and getting half of your bet back.',
  insurance: 'A side bet against the dealer having a natural; it refunds part of a lost bet.',
  insured: 'Hands where insurance paid out.',
  'hole card': "The dealer's face-down card.",
  'even money': 'Insurance paid 1:1 on a natural, so the hand returns a flat profit.',
  'perfect pairs': 'A side bet that pays when your first two cards are a pair.',
  mulligan: 'A do-over: the last card is redrawn.',
  'burn card': 'A card discarded unseen from the top of the deck before play.',
  shoe: 'The box of several decks cards are dealt from.',
  'basic strategy': 'The mathematically best play for each hand against each dealer card.',
  cascade: 'A win that triggers a free follow-up spin, which can chain.',
  'free spin': 'A spin that costs no stake but pays normally.',
  'free spins': 'Spins that cost no stake but pay normally.',
  scatter: 'A symbol that pays anywhere on the reels, not just on a line.',
  wild: 'A symbol that stands in for others to complete a line.',
  triple: 'All three reels showing the same symbol.',
  pair: 'Exactly two matching symbols on the reels.',
  jackpot: 'The top prize, paid on top of the normal line payout.',
  'hold & respin': 'Some symbols stay locked while the other reels spin again.',
  dozen: 'A roulette bet on 12 numbers (1–12, 13–24 or 25–36). Pays 3:1.',
  zero: 'The green pocket. Most bets lose when the ball lands there.',
  pocket: 'One of the numbered slots on the roulette wheel the ball can land in.',
  'let it ride': 'Leaving a win on the table to be flipped again, doubling it or losing it.',
  'pity flip': 'A free extra play awarded after a loss.',
  'house edge': "The built-in average advantage of the casino on each bet.",
  stake: 'The amount you wager on a round.',
  're-roll': 'Replaying a losing round once for another chance.',
};

const KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const PATTERN = new RegExp(`\\b(${KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:s|es)?\\b`, 'gi');

/** The definition for `label` (matched ignoring case and a plural s), or undefined. */
export function define(label: string): string | undefined {
  const k = label.trim().toLowerCase();
  return GLOSSARY[k] ?? GLOSSARY[k.replace(/s$/, '')] ?? GLOSSARY[k.replace(/es$/, '')];
}

/** `label` as a dotted-underlined span whose hover tooltip is its glossary entry (plain text if unknown). */
export function term(label: string, text = label): HTMLElement | string {
  const def = define(label);
  return def ? h('span', { class: 'term', title: def, text }) : text;
}

/** `text` with every glossary term wrapped in a tooltip span. */
export function annotate(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(term(m[1], m[0]));
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
