# Kingdom Rush Battles — Kingdom Wars boss simulator

Interactive tool in two steps, like the game.

**1 Deck — pure numbers.** Build a deck (1 hero, 3 spells, 4 towers) from the collection: drag a card onto a slot, or tap it and press *Use*
(on a full deck it asks which card to replace and shows the deck's DPS after each choice). The deck stays pinned while the collection scrolls.
Every card shows one DPS number = basic attack (damage per hit ÷ attack time) **plus all its skills** (`src/sim/dps.ts`):
- skills: damage ÷ cooldown; multi-hit skills × number of hits (switchable between "listed damage is per hit" and "per cast"); chance skills × chance;
  per-level cooldowns and damage-over-time values; summons = units × hit ÷ interval × (time alive ÷ cooldown). A skill whose numbers are missing
  in the library is listed with the reason (for example a summon with no lifetime) instead of being guessed
- tower level 1/2/3 for all towers (the switch in the pinned header) or per tower (its info page, which also shows the DPS at each level); tower skills start at level 3 and can be switched off one by one
- the deck's perks can be switched on or off
There is no map, boss position or creeps in this step. The header shows DPS (with the change after every swap), damage per minute, gold and an *ideal kill*
(boss HP ÷ DPS). Tap a deck card to see how its number is made.

**2 Battle — the simulation.** Tap a stump on the real map to build, place the hero and barracks rally points, and see the boss fight
(boss position, blocking, creeps) with kill time and DPS. Hold and drag towers between stumps; drag the hero and rally dots.

Icons: the gold coin is cropped from the game; the sword (melee), arrow (ranged), blast (magic) and dynamite (artillery) icons are drawn as SVG in `src/ui/icons.tsx`.

## Run / deploy
- `npm install && npm run dev` — local dev server
- `npm test` — simulation tests
- Cloudflare (Workers static assets): build command `npm run build`, deploy command `npx wrangler deploy`; `wrangler.jsonc` serves `./dist`
  (the Worker name in the dashboard must be `kr-boss-simulator`, or change `name` in `wrangler.jsonc`)

## Data
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
