// Kingdom Wars boss map + creep tables.
// Transcribed from krb-deck screenshots (map view + "Who enters" tables). Route lengths were
// checked against krb-deck's own tile counts: Route 1 = 35, Route 2 = 18, Flying = 21.
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
}

/**
 * Boss. HP/damage are the library's "Gul'Thak LVL 5" values.
 * CONFLICT: krb-deck lists Gul'Thak health as "115 484+" — unresolved.
 * Speed = 1 tile/s (krb-deck: Route 1 is 35 tiles, boss ~35 s). Armor, resist, attack interval unknown.
 */
export const BOSS_KW: BossDef = {
  name: "Gul'Thak", hp: 255449, armor: 0, magicResist: 0, speed: TILE * 1.0,
  damage: (4428 + 5109) / 2, attackInterval: 1.5,
}
export const BOSS_ENTERS_SEC = 31.5

// "Who enters" tables. Only counts, first-spawn time and HP are known; the spawn schedule between
// first spawn and the last creep, plus each creep's route, speed and armor, are still missing.
export const CREEP_SETS: Record<'A' | 'B', CreepSpawn[]> = {
  A: [
    { name: 'Goblin', count: 47, firstSec: 8, hp: 1050 },
    { name: 'Gargoyle', count: 38, firstSec: 7, hp: 2850, flying: true },
    { name: 'Goblin Copter', count: 34, firstSec: 10.5, hp: 5400, flying: true },
    { name: 'Wulf', count: 33, firstSec: 1, hp: 1500 },
    { name: 'Spider Hatchling', count: 19, firstSec: 122, hp: 390 },
    { name: 'Orc Shaman', count: 13, firstSec: 50, hp: 6300 },
    { name: 'Goblin Warrior', count: 12, firstSec: 45, hp: 3900 },
    { name: 'Goblin Wizard', count: 10, firstSec: 16.5, hp: 5400 },
    { name: 'Orc', count: 8, firstSec: 64, hp: 6900 },
    { name: 'Orc Champion', count: 7, firstSec: 89, hp: 18600 },
    { name: 'Spider Matriarch', count: 3, firstSec: 185, hp: 5250 },
    { name: 'Ogre', count: 2, firstSec: 207.5, hp: 33750 },
  ],
  B: [
    { name: 'Goblin', count: 58, firstSec: 0, hp: 1050 },
    { name: 'Orc Shaman', count: 30, firstSec: 50, hp: 6300 },
    { name: 'Wulf', count: 29, firstSec: 12, hp: 1500 },
    { name: 'Gargoyle', count: 29, firstSec: 16, hp: 2850, flying: true },
    { name: 'Spider Hatchling', count: 22, firstSec: 122, hp: 390 },
    { name: 'Goblin Warrior', count: 17, firstSec: 2.5, hp: 3900 },
    { name: 'Orc', count: 14, firstSec: 64, hp: 6900 },
    { name: 'Goblin Wizard', count: 10, firstSec: 16.5, hp: 5400 },
    { name: 'Orc Champion', count: 8, firstSec: 66, hp: 18600 },
    { name: 'Ogre', count: 5, firstSec: 95.5, hp: 33750 },
    { name: 'Spider Matriarch', count: 3, firstSec: 185, hp: 5250 },
  ],
}
