import { effective } from './damage'
import { dist, pointAt, type PathInfo } from './geometry'
import type { BossDef, Layout, MapDef, TowerCard } from './types'

export const BLOCK_RADIUS = 25 // how close a blocker must be to stop the boss (map units)

/** Sustained boss DPS from towers when the boss stands at path distance s. */
export function dpsAt(
  s: number, map: MapDef, path: PathInfo, boss: BossDef,
  layout: Layout, cards: Record<string, TowerCard>,
): { dps: number; shooters: number; blocked: boolean } {
  const bp = pointAt(path, s)
  let dps = 0, shooters = 0, blocked = false
  for (const spot of map.spots) {
    const card = cards[layout.spots[spot.id] ?? '']
    if (!card) continue
    if (card.kind === 'shooter') {
      if (dist(bp, spot) <= card.range) {
        dps += effective(boss, card.damage, card.dmgType) / card.cooldown
        shooters++
      }
    } else {
      const rs = layout.rally[spot.id] ?? 0
      if (Math.abs(rs - s) <= BLOCK_RADIUS) {
        blocked = true
        dps += card.units * effective(boss, card.unitDamage, card.unitDmgType) / card.unitAttackInterval
      }
    }
  }
  return { dps, shooters, blocked }
}
