// Kingdom Wars boss map + creep tables.
// Transcribed from krb-deck screenshots (map view + "Who enters" tables). Route lengths were
// (creep tables are still the ones from krb-deck for the previous boss map).
import type { BossDef, CreepSpawn, MapDef, Pt, RouteDef } from '../sim/types'

/** ASSUMPTION (unverified): 1 map tile = 80 range/AoE units (so AoE 80 = 1 tile, range 160 = 2 tiles). */
export const TILE = 80

type Tp = [number, number]
const pts = (list: Tp[]): Pt[] => list.map(([x, y]) => ({ x: x * TILE, y: y * TILE }))

// Map is 9 x 13 tiles (picture: public/map.webp, from the owner's screenshot with the route lines painted out).
// Routes run along tile edges, so waypoints are whole tiles; read off the screenshot's dashed lines (all four checked against the picture).
const ORANGE: Tp[] = [[5, 0.65], [5, 3], [3, 3], [3, 1], [1, 1], [1, 5], [3, 5], [3, 6], [4, 6], [4, 9], [2, 9], [2, 11], [3, 11], [3, 12], [6, 12], [6, 11], [8.6, 11]]
const CYAN: Tp[] = [[7, 0.65], [7, 3], [8, 3], [8, 6], [6, 6], [6, 8], [7, 8], [7, 11], [8.6, 11]]
const PURPLE: Tp[] = [[8.95, 2], [5, 2], [5, 6], [4, 6], [4, 9], [7, 9], [7, 11], [8.6, 11]]
const TEAL: Tp[] = [[0.5, 8], [2, 8], [2, 11], [3, 11], [3, 12], [6, 12], [6, 11], [8.6, 11]]
const FLY: Tp[] = [[7, 0.65], [8.6, 11]] // ASSUMED: flying enemies go straight from the top spawn to the exit

export const ROUTES: RouteDef[] = [
  { id: 'r1', name: 'Orange route (boss route, assumed)', color: '#ff9f2e', points: pts(ORANGE), tiles: 32, verified: false },
  { id: 'r2', name: 'Cyan route', color: '#33d1f0', points: pts(CYAN), tiles: 16, verified: false },
  { id: 'r3', name: 'Purple route', color: '#b07cff', points: pts(PURPLE), tiles: 18.5, verified: false },
  { id: 'r4', name: 'Teal route', color: '#5fe0b8', points: pts(TEAL), tiles: 13, verified: false },
  { id: 'fly', name: 'Flying (assumed)', color: '#f5d02e', points: pts(FLY), tiles: 11, verified: false },
]

// Tower stumps, in tiles (centre of each numbered stump in the screenshot, 92.4 px per tile).
const SPOTS: Record<string, Tp> = {
  '1': [4.02, 2.2], '2': [5.85, 10.17], '3': [6.03, 3.05], '4': [7.16, 7.12], '5': [5.03, 8.27],
  '6': [2.94, 7.14], '7': [2.12, 4.11], '8': [7.09, 12.19], '9': [6.92, 5.06], '10': [3.21, 10.15],
}

export const MAP_KW: MapDef = {
  id: 'kingdom-wars', name: 'Kingdom Wars', width: 9 * TILE, height: 13 * TILE,
  path: pts(ORANGE), // the boss walks the orange route (ASSUMED: it is the longest, like the old boss route)
  spots: Object.entries(SPOTS).map(([id, [x, y]]) => ({ id, x: x * TILE, y: y * TILE })),
  routes: ROUTES,
  bossRouteId: 'r1',
}

/**
 * Boss = Krum'Thak, level 5 (owner's screenshot): 230,133 health, 5,451–9,947 damage.
 * Speed = 1 tile/s (carried over from the old boss: its route was 35 tiles and took ~35 s). Armor / resist unknown -> 0.
 * Attack interval is ASSUMED (not shown anywhere).
 */
export const BOSS_KW: BossDef = {
  name: "Krum'Thak", hp: 230133, armor: 0, magicResist: 0, speed: TILE * 1.0,
  damage: (5451 + 9947) / 2, attackInterval: 1.5,
}
export const BOSS_ENTERS_SEC = 31.5

// ---- "Who enters" tables (krb-deck): count, first spawn, HP are real. -----------------------------------
// Speed / damage / attack interval / route are ASSUMED placeholders (the user said ignore for now);
// they only decide how fast creeps arrive and how long barracks units survive.
type Row = [name: string, count: number, firstSec: number, hp: number]
// speed in tiles/s, flying?, route
const ASSUMED: Record<string, { speed: number; flying?: boolean; route?: 'fly' }> = {
  Goblin: { speed: 1.0 }, 'Goblin Warrior': { speed: 0.8 }, 'Goblin Wizard': { speed: 0.8 }, Wulf: { speed: 1.6 },
  'Spider Hatchling': { speed: 1.2 }, 'Spider Matriarch': { speed: 0.7 }, 'Orc Shaman': { speed: 0.7 }, Orc: { speed: 0.7 },
  'Orc Champion': { speed: 0.6 }, Ogre: { speed: 0.5 },
  Gargoyle: { speed: 1.2, flying: true, route: 'fly' },
  'Goblin Copter': { speed: 1.2, flying: true }, // krb-deck's Flying route holds 38 enemies = the gargoyles only
}
const mk = (rows: Row[]): CreepSpawn[] => rows.map(([name, count, firstSec, hp]) => {
  const a = ASSUMED[name]
  return { name, count, firstSec, hp, flying: !!a.flying, route: a.route ?? 'ground', speed: a.speed * TILE, damage: Math.round(hp * 0.06), interval: 1.2 }
})

export const CREEP_SETS: Record<'A' | 'B', CreepSpawn[]> = {
  A: mk([['Goblin', 47, 8, 1050], ['Gargoyle', 38, 7, 2850], ['Goblin Copter', 34, 10.5, 5400], ['Wulf', 33, 1, 1500],
    ['Spider Hatchling', 19, 122, 390], ['Orc Shaman', 13, 50, 6300], ['Goblin Warrior', 12, 45, 3900], ['Goblin Wizard', 10, 16.5, 5400],
    ['Orc', 8, 64, 6900], ['Orc Champion', 7, 89, 18600], ['Spider Matriarch', 3, 185, 5250], ['Ogre', 2, 207.5, 33750]]),
  B: mk([['Goblin', 58, 0, 1050], ['Orc Shaman', 30, 50, 6300], ['Wulf', 29, 12, 1500], ['Gargoyle', 29, 16, 2850],
    ['Spider Hatchling', 22, 122, 390], ['Goblin Warrior', 17, 2.5, 3900], ['Orc', 14, 64, 6900], ['Goblin Wizard', 10, 16.5, 5400],
    ['Orc Champion', 8, 66, 18600], ['Ogre', 5, 95.5, 33750], ['Spider Matriarch', 3, 185, 5250]]),
}
