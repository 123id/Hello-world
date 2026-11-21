// Facts read from the owner's screen recordings of the game's card info pages (Nov 2026), applied on top of the card library.
//
// Rule: the game shows each card at the player's OWN card level, and the calculator wants level 9. So:
//  * values that do not depend on card level (costs, attack speed, range, unit counts, durations) fill gaps in the library freely;
//  * values that do depend on card level (damage, health, armor) are only used where the library has nothing usable, and then
//    the card is flagged with the level they were read at (dataLevel), so the UI warns about it.
// Everything else on those pages that the library already had matched the video: costs, attack speeds, ranges and most cooldowns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>

const byId = (list: Raw[], id: string) => list.find((x) => x.id === id)
const skill = (card: Raw | undefined, id: string) => (card?.skills as Raw[] | undefined)?.find((s) => s.id === id)

export function applyVideoFacts(r: Raw): Raw {
  const towers = r.towers as Raw[], spells = r.spells as Raw[], heroes = r.heroes as Raw[]

  // ---- Mage Tower (video 1, card level 15): costs and Spell Barrage's cooldown, cost and number of targets ----
  const mage = byId(towers, 'mage-tower')
  if (mage) {
    const cost: Record<number, number> = { 1: 70, 2: 150, 3: 230 }
    for (const t of mage.tiers as Raw[]) t.totalCost = cost[t.tier] ?? t.totalCost
    const sb = skill(mage, 'spell-barrage')
    if (sb) { sb.cooldownSec = 16; sb.units = 8; sb.purchaseCost = 250 }
  }

  // ---- Archery Scouts (video 2, card level 14): a barracks tower with 2 soldiers; costs; Fire Shots lasts 6 s ----
  const scouts = byId(towers, 'archery-scouts')
  if (scouts) {
    scouts.barracks = true
    const cost: Record<number, number> = { 1: 70, 2: 160, 3: 270 }
    for (const t of scouts.tiers as Raw[]) { t.units = 2; t.totalCost = cost[t.tier] ?? t.totalCost }
    const fire = skill(scouts, 'fire-shots'); if (fire) fire.durationSec = 6
    const tp = skill(scouts, 'target-practice'); if (tp) tp.purchaseCost = 180
  }

  // ---- Denas Bastion (video 2, card level 10): the library's damage is missing its maximum (and its level 3 minimum looks wrong) ----
  const denas = byId(towers, 'denas-bastion')
  if (denas) {
    const v: Record<number, { hp: number; armor: number; min: number; max: number }> = {
      1: { hp: 2769, armor: 28, min: 387, max: 503 }, 2: { hp: 3451, armor: 41, min: 542, max: 658 }, 3: { hp: 4248, armor: 55, min: 658, max: 774 },
    }
    for (const t of denas.tiers as Raw[]) {
      const x = v[t.tier]; if (!x) continue
      t.unitHealth = x.hp; t.unitArmorPct = x.armor; t.damageMin = x.min; t.damageMax = x.max; t.units = 3; t.attackIntervalSec = 1.2
    }
    denas.dataLevel = 10
  }

  // ---- Wrath of Blackburn (video 2, card level 9, so it applies as is): the summoned soul's damage ----
  const wrath = byId(heroes, 'wrath-of-blackburn')
  const soul = skill(wrath, 'corrupted-soul')
  if (soul) { soul.unitDamageMin = 2019; soul.unitDamageMax = 2355 }

  // ---- Assassin's Guild (screenshots, card level 9, so every number applies as is). The page shows "1749 +189": the green part is the bonus
  // is what the next card level (10) would add, so it is never used: only the base number counts, as everywhere else in the library. ----
  const assassins = byId(towers, 'assassins')
  if (assassins) {
    const v: Record<number, { hp: number; min: number; max: number }> = {
      1: { hp: 1749, min: 505, max: 673 }, 2: { hp: 2167, min: 909, max: 1077 }, 3: { hp: 2648, min: 1279, max: 1346 },
    }
    for (const t of assassins.tiers as Raw[]) {
      const x = v[t.tier]; if (!x) continue
      t.unitHealth = x.hp; t.unitArmorPct = 0; t.damageMin = x.min; t.damageMax = x.max; t.attackIntervalSec = 0.6; t.units = 2
    }
    assassins.rarity = 'Epic'
    assassins.completeness = 'full-L9 in-game (Sneak Attack page not captured)'
    const dodge = skill(assassins, 'dodge'); if (dodge) dodge.dodgePctByLevel = [30, 45, 60]
    const pick = skill(assassins, 'pickpocket'); if (pick) { pick.chancePct = 30; pick.extraGold = 10; pick.purchaseCost = 120 }
    assassins.perks = [{ name: 'Invader Fragility', stat: 'health', target: 'enemies', pct: -2 }]
  }

  // ---- Polymorph (video 2): it lasts 6 s over an area of 80 ----
  const poly = byId(spells, 'polymorph')
  if (poly) { poly.durationSec = 6; poly.aoe = 80 }

  return r
}
