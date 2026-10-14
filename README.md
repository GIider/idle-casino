# Idle Casino

**Play now:** https://giider.github.io/idle-casino/  
**Download the single-file build:** https://github.com/GIider/idle-casino/releases/tag/latest (`idle-casino.html`, runs offline)

Every push to `main` runs the tests, builds a self-contained HTML file and publishes it as the `latest` release and to GitHub Pages.

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
- **Lucky Charm**: a chance to re-roll a losing round. **High Roller Perks**: bigger winnings. **Hot Streak**: each win in a row adds winnings (up to 10 wins). **Cashback**: lost rounds refund part of the bet. **Second Dealer**: a play may trigger an immediate bonus play.
- **Auto-play**: there is no manual play. A table starts playing as soon as it is unlocked, at the minimum bet and 1 play/sec. *Faster Dealer* adds +0.5 plays/sec per level (20 levels) and *Bigger Bets* raises the wager to a growing share of the table's wallet (up to 50%, clamped to the table's min/max bet). Roulette bets (dozen, number 17) are one-time upgrades; every owned bet is placed each spin with the stake split evenly.
- **Prestige** (per table): reach the profit target, reset that table's upgrades and wallet (to a starter stack of 50 new minimum bets), and permanently raise its minimum bet (×3 per level), maximum bet and maximum payout (×5 per level), plus +30% winnings per level. The profit target grows per level by ×12 at Coin Flip, ×10 at Slots, ×9 at Roulette and ×8 at Blackjack, and upgrade prices grow ×3 (in the table's own currency).
- **Ascension** (casino-wide): reach 500M Markers at Blackjack (×5 each time; your best wallet since the last ascension counts, so spending or prestiging never sets you back) on the *Casino* tab to reset every table, upgrade, prestige and wallet (table history too) for casino chips (1, plus 3 more per 10× above the threshold). Every ascension also permanently multiplies winnings ×1.5 on all tables (compounding, no purchase needed). Chips buy permanent casino upgrades: the *Floor Manager* (buys table upgrades for you every 10s, core upgrades first), *Overtime Shifts* (speeds it to 5s then 2s), *Concierge* (auto-prestiges) and *Bulk Orders* (a "Buy cheapest" button on every table).
- **Achievements** (per table): grind goals ("flip heads 10,000 times") and streak goals ("heads in a row: 24"), each a single unlock sized so it lands before the game's shop is complete (the simulator asserts every unlock falls inside that window). Each grants a permanent perk that changes a rule of its table; perks survive prestige and ascension. Offline progress doesn't count.
  - **Coin Flip**: *Let It Ride* (re-flip wins for double or nothing), *Heat Wave* (longer Hot Streak, softer losses), *Edge Landing* (rim landings pay 5×), *Pity Flip* (tails can earn a free play), *Raised Ceiling* (higher max payout) and *Double Luck* (a second Lucky Charm re-roll).
  - **Slots**: *Cascade* (triples chain free spins), *Hold & Respin*, *Free Spins*, *Wild Diamond* (💎 completes low lines) and *Scatter Sevens*.
  - **Roulette**: *Green Machine* (zero wins), *House Chip* (free chip on 17), *Black Bleed*, *Dozen Creep* and *Double Spin*.
  - **Blackjack**: rich shoe, burn card and surrender, plus card-count goals (win, or lose to the dealer, with 2-6 cards) that unlock a free double down, free split, Charlie, hole-card peek, perfect pairs, even money, dealer mulligan, card sharp, second hand and dealer tilt.
  - **Collection** (own every upgrade, then max them all) gives each table a unique capstone: *Gold Coin*, *Jackpot Seed*, *Biased Wheel* and *Card Counter*.
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

Each table has a canvas stage (`src/ui/stage`) that animates the real round outcome (`PlayResult.view`), and a history card (`src/ui/historyChart.ts`, data in `src/core/history.ts`) with an income-per-second chart (last ~3 min / ~10 min / All) plus a game-specific view per table (`src/ui/historyViews.ts`: coin streaks, symbol frequencies, wheel heat, hand outcomes).

Game logic lives in `src/core` and `src/tables` (no DOM); the UI is in `src/ui`.


## Dev
Open the game with `?cardcounting=1` to show an *Unlock everything* button (unlocks every table, maxes all upgrades, fills wallets).

Open it with `?perf=1` to show a profiling overlay (`src/ui/perf.ts`): fps plus, per measured step (`game.tick`, `app.update`, each table's stage canvas, panel and history refresh), calls/s, average and max ms, and total ms per second. The header's *Quality* button cycles auto / high / low graphics; low drops decorative effects.

## Balance simulator

`src/sim/bots.ts` plays the real `Game` with a set of bot strategies (greedy, value-aware, random, expensive-first,
junk-first, slow-to-prestige, lazy, hoarder, never-prestige). Targets: greedy and optimal-ish bots ascend within 60 minutes,
every other strategy within 90.

- `npx vitest run tests/sim/balance.test.ts` – time to first ascension per bot, with the target assertions.
- `SIM_REPORT=1 npx vitest run tests/sim/upgrades.test.ts` / `perks.test.ts` / `achievements.test.ts` – minutes each upgrade and
  achievement perk saves (tuning reports; they print, they don't assert). `achievements.test.ts` asserts that every achievement unlocks within the game.
- `npm run dev`, then open `/sim.html` – charts each bot's progress, wallets and events.
