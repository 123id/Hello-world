// Shared simulation types. Library card types live in ./library.
export interface Pt { x: number; y: number }

export interface RouteDef {
  id: string
  name: string
  color: string
  points: Pt[]
  tiles: number // length in tiles
  verified: boolean // length confirmed against krb-deck's route list
}

export interface MapDef {
  id: string
  name: string
  width: number
  height: number
  image?: string
  path: Pt[] // the boss route
  spots: { id: string; x: number; y: number }[]
  routes: RouteDef[]
  bossRouteId: string
}

export interface BossDef {
  name: string
  hp: number
  armor: number // 0..1 fraction of physical damage removed (unknown -> 0)
  magicResist: number
  speed: number // map units / second
  damage: number // per hit vs blockers
  attackInterval: number // seconds (assumed)
}

export interface CreepSpawn {
  name: string
  count: number
  firstSec: number // first spawn time
  hp: number
  flying: boolean
  route: 'ground' | 'fly'
  speed: number // map units / s  (ASSUMED)
  damage: number // per hit vs blockers (ASSUMED)
  interval: number // (ASSUMED)
}

export interface SimResult {
  killTime: number | null // seconds into the wave, null = boss not killed
  crossedAt: number | null // boss reached the exit
  endTime: number
  bossHpLeft: number
  bossDamageBy: Record<string, number>
  creepsKilled: number
  creepsSpawned: number
  timeline: { t: number; bossHp: number; bossS: number | null; dps: number }[] // once per second; dps = damage to boss that second
  notes: string[] // things the sim did not model for this build
}

export const FIGHT_SECONDS = 180
