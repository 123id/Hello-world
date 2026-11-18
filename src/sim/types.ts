// ---- Data schema. All card data is cards at level 9 (project assumption). ----
// Everything below is data-driven so real stats drop in without touching the engine.

export type DmgType = 'physical' | 'magic' | 'true'
export interface Pt { x: number; y: number }

export interface MapDef {
  id: string
  name: string
  width: number
  height: number
  image?: string // optional background image URL (put file in /public)
  path: Pt[] // boss walks this polyline start -> finish line
  spots: { id: string; x: number; y: number }[] // tower build spots
}

export interface BossDef {
  name: string
  hp: number
  armor: number // 0..1 fraction of physical damage removed
  magicResist: number // 0..1
  speed: number // map units / second
  damage: number // per hit vs blockers
  attackInterval: number // seconds
}

export interface ShooterTower {
  kind: 'shooter'
  id: string
  name: string
  range: number
  damage: number // per shot (assumed fully tier-3 + chosen skills)
  dmgType: DmgType
  cooldown: number // seconds between shots
  cost: number // total gold incl. upgrades (not used by the sim yet)
  prioritizesBoss?: boolean // e.g. Twilight Longbow; others target closest creep
}

export interface BarracksTower {
  kind: 'barracks'
  id: string
  name: string
  range: number // rally point must be within this of the tower
  units: number
  unitHp: number
  unitDamage: number
  unitDmgType: DmgType
  unitAttackInterval: number
  respawn: number // seconds to revive a dead unit
  cost: number
}

export type TowerCard = ShooterTower | BarracksTower

export interface HeroCard {
  id: string
  name: string
  hp: number
  damage: number
  dmgType: DmgType
  attackInterval: number
  respawn: number
  ability?: { cooldown: number; damage: number; dmgType: DmgType; stun: number; radius: number }
}

export interface SpellCard {
  id: string
  name: string
  cooldown: number
  damage: number
  dmgType: DmgType
  radius: number
  stun: number // seconds
  firstCast: number // earliest cast time in seconds
}

// ---- Layout (the player's choices on the map) ----
export interface Layout {
  spots: Record<string, string | null> // spotId -> tower card id
  rally: Record<string, number> // spotId -> path distance for barracks rally point
  heroS: number // path distance where the hero stands
}

export interface Deck {
  hero: HeroCard
  spells: SpellCard[] // up to 3
  towers: TowerCard[] // up to 4
}

export interface SimResult {
  killTime: number | null // seconds, null = boss not killed
  reachedEnd: boolean
  endTime: number
  bossHpLeft: number
  damageBy: Record<string, number>
  timeline: { t: number; s: number; hp: number }[] // sampled once per second
}

export const FIGHT_SECONDS = 180
