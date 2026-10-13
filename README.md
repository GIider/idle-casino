# Idle Casino

A single-player browser idle game. Every table plays itself the moment it opens; you spend each table's winnings on speed, bigger bets and odds-tilting upgrades, and prestige tables to raise their stakes. Every table has its own currency, so no single table can fund the whole casino.

## Tables
| Table | Currency | Unlock (paid in the previous table's currency) | Notes |
| --- | --- | --- | --- |
| Coin Flip | 🪙 Pennies | free | slight player edge, the first rung of the ladder |
| Slots | 🎟️ Tokens | 1,500 Pennies | weighted reels, three-of-a-kind jackpots |
| Roulette | 🔶 Plaques | 7,500 Tokens | starts on red; buy the dozen and number 17 bets to spread each stake across them |
| Blackjack | ♠️ Markers | 37,500 Plaques | naturals pay 3:2, upgrades bend the deck |

## Mechanics
- **Wallets**: each table bets from, and wins into, its own currency. Upgrades are bought with that table's currency, and unlocking the next table costs the previous table's currency (a new table starts with a small starter wallet). A table that busts is comped chips of its own currency; other wallets are never touched. Every table has a small built-in winnings bonus so it can climb on its own before you buy anything.
- **Cross-table bonus**: every prestige level of a table gives the next table in the chain +4% winnings, so earlier tables stay worth playing and prestiging.
- **Luck**: a chance to re-roll a losing round. **Payout perks**: bigger winnings. **Hot Streak**: each win in a row adds winnings (up to 10 wins). **Cashback**: lost rounds refund part of the bet. **Second Dealer**: a play may trigger an immediate bonus play.
- **Auto-play**: there is no manual play. A table starts playing as soon as it is unlocked, at the minimum bet and 1 play/sec. *Faster Dealer* adds +0.5 plays/sec per level (20 levels) and *Bigger Bets* raises the wager to a growing share of the table's wallet (up to 50%, clamped to the table's min/max bet). Roulette bets (dozen, number 17) are one-time upgrades; every owned bet is placed each spin with the stake split evenly.
- **Prestige** (per table): reach the profit target, reset that table's upgrades and wallet (to a starter stack of 50 new minimum bets), and permanently raise its minimum bet, maximum bet and maximum payout (plus +10% winnings per level). Upgrade prices grow 8× per prestige level, in the table's own currency.
- **Ascension** (casino-wide): reach 500M Markers at Blackjack (×5 each time) on the *Casino* tab to reset every table, upgrade, prestige and wallet (table history too) for casino chips; the casino-value graph survives ascension. Every ascension also permanently multiplies winnings ×1.5 on all tables (compounding, no purchase needed). Chips buy permanent casino upgrades: the *Floor Manager* line (Floor Manager buys table upgrades for you every 10s; *Overtime Shifts* speeds it to 5s then 2s; *Purchasing Policy* adds per-upgrade switches; *Concierge* auto-prestiges), *House Edge* (more winnings), *Seed Capital* (starting cash and cheaper upgrades) and *Night Shift* (better offline earnings).
- **Achievements** (per table): grind goals ("flip heads 10k / 100k / 1M times") and streak goals ("heads in a row: 20 / 38 / 54"), each with Rare / Epic / Legendary tiers sized for automated play. Each grants a unique permanent perk for its table that levels with its tier and survives prestige and ascension. Blackjack also has card-count goals: win, or lose to the dealer, with exactly 2, 3, 4, 5 or 6 cards (bigger N-card wins, refunds on N-card losses). Each table also has a collection goal: own every upgrade (Rare), then max them all (Epic) for +5% winnings per tier. Offline progress doesn't count.
- **Offline progress**: tables keep playing while you're away (50% efficiency, capped at 8 hours).
- Saves live in `localStorage`; Export/Import copies a save code.

## Development
```
npm install
npm run dev       # dev server
npm test          # unit tests, balance checks, bot progression sim
npm run build     # type-check and build to dist/
npm run preview   # serve the production build
```

Each table has a canvas stage (`src/ui/stage`) that animates the real round outcome (`PlayResult.view`), and a history card (`src/ui/historyChart.ts`, data in `src/core/history.ts`) with a profit/loss chart (10% / 25% / 50% / All of its history) plus a game-specific view per table (`src/ui/historyViews.ts`: coin streaks, symbol frequencies, wheel heat, hand outcomes).

Game logic lives in `src/core` and `src/tables` (no DOM); the UI is in `src/ui`.

The *Casino* tab also shows a casino-value graph (all wallets summed in min-bet units, since currencies aren't comparable) (`src/ui/bankrollChart.ts`, series in `GameState.bankroll`) with log/linear scale and gold marks at each ascension. A *By game* view plots each table's cumulative net winnings from plays (kept across prestige and ascension; upgrade and unlock spending isn't attributed) with a bar of each table's share of the profit.

## Dev
Open the game with `?cardcounting=1` to show an *Unlock everything* button (unlocks every table, maxes all upgrades, fills wallets).
