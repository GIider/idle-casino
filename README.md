# Idle Casino

A single-player browser idle game. Play tables by hand, buy upgrades that tilt the odds, hire auto-players, and prestige tables to raise their stakes.

## Tables
| Table | Unlock | Notes |
| --- | --- | --- |
| Coin Flip | free | slight player edge, the engine of the early game |
| Slots | 2,500 | weighted reels, three-of-a-kind jackpots |
| Roulette | 25,000 | bet on red, a dozen, or the number 17 |
| Blackjack | 250,000 | naturals pay 3:2, upgrades bend the deck |

## Mechanics
- **Luck**: a chance to re-roll a losing round. **Payout perks**: bigger winnings.
- **Auto-players**: play on their own; choose how much they bet (min / 5% of bankroll / max).
- **Prestige** (per table): reach the profit target, reset that table's upgrades, and permanently raise its minimum bet, maximum bet and maximum payout (plus +10% winnings per level). Bankroll is shared across tables.
- **Offline progress**: auto-players keep working while you're away (50% efficiency, capped at 8 hours).
- Saves live in `localStorage`; Export/Import copies a save code.

## Development
```
npm install
npm run dev       # dev server
npm test          # unit tests, balance checks, bot progression sim
npm run build     # type-check and build to dist/
npm run preview   # serve the production build
```

Game logic lives in `src/core` and `src/tables` (no DOM); the UI is in `src/ui`.
