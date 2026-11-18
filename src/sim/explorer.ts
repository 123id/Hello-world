// Path explorer: sustained damage per second on the boss if it stood at one point of its route
// (ignores creeps and spells; shooters + their supported skills + barracks units blocking there).
import { dist, pointAt, type PathInfo } from './geometry'
import { BLOCK_RADIUS, RALLY_RANGE, shooterStats, type Placement } from './engine'
import type { Mods } from './perks'
import type { MapDef } from './types'

export function dpsAt(s: number, map: MapDef, path: PathInfo, placements: Placement[], mods: Mods): { dps: number; shooters: number; blocked: boolean } {
  const bp = pointAt(path, s)
  let dps = 0, shooters = 0, blocked = false
  for (const pl of placements) {
    const spot = map.spots.find((x) => x.id === pl.spotId)
    const td = pl.tower.tiers[pl.tier]
    if (!spot || !td) continue
    if (pl.tower.kind === 'shooter') {
      const st = shooterStats(pl.tower, td, mods)
      if (dist(bp, spot) > st.range) continue
      shooters++
      dps += (td.aoe ? st.dmg : st.dmg) / st.interval
      for (const sk of pl.tower.skills) {
        if (!pl.skills.includes(sk.id) || !sk.supported) continue
        if (sk.kind === 'periodic' && sk.cooldown) dps += (sk.dmgAvg ?? 0) / sk.cooldown
        if (sk.kind === 'dot') dps += sk.dps ?? 0
      }
    } else {
      let rp = pl.rally ?? spot
      const d = dist(rp, spot)
      if (d > RALLY_RANGE) rp = { x: spot.x + ((rp.x - spot.x) * RALLY_RANGE) / d, y: spot.y + ((rp.y - spot.y) * RALLY_RANGE) / d }
      if (dist(rp, bp) <= BLOCK_RADIUS) {
        blocked = true
        dps += ((td.units ?? 0) * (td.dmgMin + td.dmgMax) / 2) / td.interval
      }
    }
  }
  return { dps, shooters, blocked }
}
