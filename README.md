# Kingdom Rush Battles — Kingdom Wars boss simulator

Interactive tool in two steps, like the game.

**1 Collection (deck) — pure numbers.** Modelled on the game's own Collection > Cards screen (from a screen recording of it): one scrolling page with the deck
at the top (5 deck slots and a gear; hero + 3 spells on the first row, 4 towers on the second), then Heroes, Towers and Spells sections ("Found n/n", a sort button),
and a fixed tab row (Deck / Heroes / Towers / Spells) that scrolls to each section. A compact deck strip floats under the tabs once the deck has scrolled away, so
you can still drag cards into it.
- Tap a card: a small popup (**Info / Use**, or **Info / Unequip** for a card in the deck). *Use* fills the first empty slot; for a hero it swaps the hero; on a full deck
  it opens **Select a card to replace**, where each card shows how your deck's DPS would change. Hold and drag also works (collection → deck, deck → deck, deck → a list to remove).
- **Info** is a full page like the game's: title and rarity, a card badge, hexagon tabs (stats + one per skill), a light stat panel, and Unequip / Use. The level badge cycles
  LVL1/2/3 (and sets that tower's level when it is in the deck). Added to the game's page: the card's DPS with every part and its arithmetic, and the DPS at all three levels.
- Every card shows one DPS number = basic attack (damage per hit ÷ attack time) **plus all its skills** (`src/sim/dps.ts`): damage ÷ cooldown; multi-hit skills × hits;
  *affected units count as separate hits on the boss* (with only the boss in range they all land on it); chance skills × chance; per-level cooldowns and damage-over-time
  values; summons = units × hit ÷ interval × (time alive ÷ cooldown). A skill with missing numbers is listed with the reason instead of being guessed.
- **Perks** (`src/sim/perks.ts`): every perk of every card in the deck is applied to the numbers (the library's 70 perks), and the *Deck bonuses* section lists each one with what it adds, found by leaving it out. Perks that only help survival or movement, weaken enemies' damage or speed, or have no value in the library are listed with the reason. Tower-damage perks add to each tower's basic attack and to its skills (owner-confirmed); hero-damage perks add to the hero's basic attack only (owner-confirmed).
- **Polymorph** does not affect the boss (owner), so it adds no damage; it can still be put in the deck.
- Tower level 1/2/3 for all towers (the Tower level panel) or per tower (its info page); tower skills start at level 3 and can be counted or not one by one.
- `src/data/videoFacts.ts` holds facts read from screen recordings of the game's info pages. Level-independent values (costs, attack speed, range, unit counts, durations) fill library gaps; level-dependent ones (damage, health, armor) are used only where the library has nothing usable, and the card is then flagged with the level they were read at.
- Cards marked ! have missing numbers or numbers read at another card level (the library's Mage Tower damage is from level 7; the game shows your own card level).
There is no map, boss position or creeps in this step. The header shows DPS (with the change after every swap), damage per minute, gold and an *ideal kill* (boss HP ÷ DPS).

**2 Battle — the simulation.** Tap a stump on the real map to build, place the hero and barracks rally points, and see the boss fight
(boss position, blocking, creeps) with kill time and DPS. Hold and drag towers between stumps; drag the hero and rally dots.

Icons: card pictures were cropped from the game's screens and screen recordings (the large popup picture is the cleanest source); a card with no stats in the library still shows its picture but no DPS or stat boxes. The gold coin, the tab icons and the bottom-bar icons are cropped from the game's screens; the sword (melee), arrow (ranged), blast (magic) and dynamite (artillery) icons are drawn as SVG in `src/ui/icons.tsx`.

## Run / deploy
- `npm install && npm run dev` — local dev server
- `npm test` — simulation tests
- Cloudflare (Workers static assets): build command `npm run build`, deploy command `npx wrangler deploy`; `wrangler.jsonc` serves `./dist`
  (the Worker name in the dashboard must be `kr-boss-simulator`, or change `name` in `wrangler.jsonc`)

## Data
- Card level: every card is level 9 in Kingdom Wars (confirmed by the owner), so the calculator always wants level-9 numbers; numbers read at another card level are flagged with a ! badge.
- Cards: `data/raw/cards-full.json` (kept out of git) is scrubbed into `src/data/library.json` by `npm run library` /
  `node scripts/build-library.mjs`. The library is authoritative (including boss HP 255,449).
- Map + creep tables: `src/data/kingdomwars.ts` (transcribed from krb-deck screenshots; route lengths checked against its tile counts).
- Map picture: `public/map.webp` is the supplied map screenshot with the route lines, arrows and monster sprites painted out (OpenCV inpainting); tower spots and routes are drawn on top.
- Icons: cropped from in-game screenshots into `public/icons/` (+ `manifest.json`). Kingdom Rush Battles artwork belongs to Ironhide Game Studio; it is used here for an unofficial fan tool.

## What is assumed (not in the data)
Creep speed/damage/route split · creep spawn spacing (evenly from first appearance until 215 s, fitted to krb-deck counts) ·
1 tile = 80 range units · each unit/hero blocks one ground enemy · barracks unit respawn 10 s · hero skill reach 200 ·
hero skill damage is per cast (confirmed by the owner) · all purchases happen at t=0 (gold is shown, not enforced) · damage = average of min/max, no crits, no armor.
Cards with incomplete library data are listed in the UI as "not simulatable yet"; skills the engine can't model are flagged per build.
