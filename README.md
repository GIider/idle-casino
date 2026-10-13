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
- **Auto-players**: play on their own. They bet the minimum until you buy *Bigger Stakes* upgrades, which raise their wager to a growing share of your bankroll (up to 50%, clamped to the table's min/max bet).
- **Prestige** (per table): reach the profit target, reset that table's upgrades, and permanently raise its minimum bet, maximum bet and maximum payout (plus +10% winnings per level). Upgrade prices grow 8× per prestige level. Bankroll is shared across tables.
- **Ascension** (casino-wide): reach a large bankroll (100M, ×5 each time) on the *Casino* tab to reset every table, upgrade, prestige and your bankroll (table history too) for casino chips; the bankroll graph survives ascension. Chips buy permanent casino upgrades: more winnings, luck, auto speed, cheaper upgrades/prestige, starting cash and better offline earnings.
- **Achievements** (per table): grind goals ("flip heads 1,000 times") and streak goals with Rare / Epic / Legendary tiers ("heads in a row: 6 / 10 / 15"). Each grants a unique permanent perk for its table that levels with its tier and survives prestige and ascension. Each table also has a collection goal: own every upgrade (Rare), then max them all (Epic) for +5% winnings per tier. Auto-play counts; offline progress doesn't.
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

Each table has a canvas stage (`src/ui/stage`) that animates the real round outcome (`PlayResult.view`), and a history card (`src/ui/historyChart.ts`, data in `src/core/history.ts`) with a profit/loss chart plus a game-specific view per table (`src/ui/historyViews.ts`: coin streaks, symbol frequencies, wheel heat, hand outcomes).

Game logic lives in `src/core` and `src/tables` (no DOM); the UI is in `src/ui`.

The *Casino* tab also shows a casino-wide bankroll graph (`src/ui/bankrollChart.ts`, series in `GameState.bankroll`) with log/linear scale and gold marks at each ascension. A *By game* view plots each table's cumulative net winnings from plays (kept across prestige and ascension; upgrade and unlock spending isn't attributed) with a bar of each table's share of the profit.
