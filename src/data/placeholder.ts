// PLACEHOLDER DATA — invented numbers so the UI/sim run. Replace with real library.
import type { BossDef, HeroCard, MapDef, SpellCard, TowerCard } from '../sim/types'

export const MAP: MapDef = {
  id: 'placeholder', name: 'Placeholder map', width: 800, height: 450,
  path: [{ x: 20, y: 380 }, { x: 250, y: 380 }, { x: 250, y: 220 }, { x: 560, y: 220 }, { x: 560, y: 80 }, { x: 780, y: 80 }],
  spots: [
    { id: 'A', x: 150, y: 320 }, { id: 'B', x: 340, y: 300 }, { id: 'C', x: 300, y: 160 },
    { id: 'D', x: 480, y: 160 }, { id: 'E', x: 500, y: 290 }, { id: 'F', x: 640, y: 140 },
  ],
}

export const BOSS: BossDef = {
  name: 'Placeholder Boss', hp: 20000, armor: 0.3, magicResist: 0.2,
  speed: 14, damage: 400, attackInterval: 1.5,
}

export const TOWERS: TowerCard[] = [
  { kind: 'shooter', id: 'archer', name: 'Archer Tower', range: 130, damage: 90, dmgType: 'physical', cooldown: 0.6, cost: 900 },
  { kind: 'shooter', id: 'mage', name: 'Mage Tower', range: 120, damage: 180, dmgType: 'magic', cooldown: 1.2, cost: 1000 },
  { kind: 'shooter', id: 'longbow', name: 'Twilight Longbow', range: 150, damage: 140, dmgType: 'physical', cooldown: 0.9, cost: 1100, prioritizesBoss: true },
  { kind: 'barracks', id: 'barracks', name: 'Barracks', range: 110, units: 3, unitHp: 900, unitDamage: 40, unitDmgType: 'physical', unitAttackInterval: 1, respawn: 8, cost: 800 },
]

export const HEROES: HeroCard[] = [
  { id: 'malik', name: 'Malik (placeholder)', hp: 2500, damage: 80, dmgType: 'physical', attackInterval: 1, respawn: 15,
    ability: { cooldown: 12, damage: 300, dmgType: 'physical', stun: 2, radius: 60 } },
]

export const SPELLS: SpellCard[] = [
  { id: 'fire', name: 'Fireball', cooldown: 15, damage: 800, dmgType: 'magic', radius: 60, stun: 0, firstCast: 3 },
  { id: 'freeze', name: 'Freeze', cooldown: 20, damage: 100, dmgType: 'magic', radius: 80, stun: 4, firstCast: 3 },
  { id: 'rain', name: 'Rain of Fire', cooldown: 25, damage: 1500, dmgType: 'magic', radius: 80, stun: 0, firstCast: 5 },
]
