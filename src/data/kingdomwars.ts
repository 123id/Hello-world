// Kingdom Wars boss map + creep tables.
// Transcribed from krb-deck screenshots (map view + "Who enters" tables). Route lengths were
// checked against krb-deck's own tile counts: Route 1 = 35, Route 2 = 18, Flying = 21.
import { BOSS_DEFAULT } from '../sim/library'
import type { BossDef, CreepSpawn, MapDef, Pt, RouteDef } from '../sim/types'

/** ASSUMPTION (unverified): 1 map tile = 80 range/AoE units (so AoE 80 = 1 tile, range 160 = 2 tiles). */
export const TILE = 80

type Tp = [number, number]
const pts = (list: Tp[]): Pt[] => list.map(([x, y]) => ({ x: x * TILE, y: y * TILE }))

// Map is 9 x 13 tiles. Routes run along tile edges, so waypoints are whole tiles.
const R1: Tp[] = [[8, 7], [7, 7], [7, 5], [6, 5], [6, 3], [8, 3], [8, 1], [4, 1], [4, 2], [3, 2], [3, 4], [4, 4], [4, 8], [5, 8], [5, 9], [6, 9], [6, 11], [5, 11], [5, 12], [0, 12]]
const R2: Tp[] = [[1, 1], [1, 6], [2, 6], [2, 8], [1, 8], [1, 10], [3, 10], [3, 12], [0, 12]]
const FLY: Tp[] = [[8, 3], [6, 3], [6, 4], [5, 4], [5, 6], [3, 6], [3, 8], [5, 8], [5, 12], [0, 12]]
const R3: Tp[] = [[8, 9], [6, 9], [6, 11], [5, 11], [5, 12], [0, 12]]

export const ROUTES: RouteDef[] = [
  { id: 'r1', name: 'Route 1 (boss route)', color: '#e5484d', points: pts(R1), tiles: 35, verified: true },
  { id: 'r2', name: 'Route 2', color: '#7c6cf0', points: pts(R2), tiles: 18, verified: true },
  { id: 'fly', name: 'Flying', color: '#f5a524', points: pts(FLY), tiles: 21, verified: true },
  { id: 'r3', name: 'Route 3 (inferred)', color: '#2bb5a0', points: pts(R3), tiles: 11, verified: false },
]

// Tower spots, in tiles (centre of each stump).
const SPOTS: Record<string, Tp> = {
  '1': [7.17, 4.15], '2': [2.0, 4.16], '3': [0.87, 7.11], '4': [3.0, 8.23], '5': [6.19, 12.26],
  '6': [6.98, 2.14], '7': [4.08, 3.16], '8': [1.78, 11.19], '9': [4.0, 11.19], '10': [6.05, 8.23],
}

export const MAP_KW: MapDef = {
  id: 'kingdom-wars', name: 'Kingdom Wars', width: 9 * TILE, height: 13 * TILE,
  path: pts(R1), // the boss walks Route 1
  spots: Object.entries(SPOTS).map(([id, [x, y]]) => ({ id, x: x * TILE, y: y * TILE })),
  routes: ROUTES,
  bossRouteId: 'r1',
}

/**
 * Boss = the library's "Gul'Thak LVL 5" (library is authoritative; krb-deck's "115 484+" is ignored).
 * Speed = 1 tile/s (krb-deck: Route 1 is 35 tiles, boss ~35 s). Armor / resist unknown -> 0.
 * Attack interval is ASSUMED (not in library).
 */
export const BOSS_KW: BossDef = {
  name: BOSS_DEFAULT.name.replace(/ LVL \d+/, ''), hp: BOSS_DEFAULT.health, armor: 0, magicResist: 0, speed: TILE * 1.0,
  damage: (BOSS_DEFAULT.damageMin + BOSS_DEFAULT.damageMax) / 2, attackInterval: 1.5,
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
