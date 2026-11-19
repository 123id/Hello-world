// Deck perks -> numeric modifiers. A perk applies whenever its card is in the deck (project assumption).
// Perks aimed at enemies, or without a known value, are collected in `ignored` so the UI can show them.
import type { PerkDef } from './library'

export interface Mods {
  towerDamage: { all: number; magic: number; artillery: number } // % damage
  towerSpeed: { artillery: number; barracks: number } // % attack speed
  towerRange: { magic: number } // % range
  skillCooldown: { all: number; artillery: number; barracks: number; magic: number } // % (negative = faster)
  skillDamage: { magic: number }
  spellDamage: number
  heroDamage: { all: number; ranged: number; melee: number }
  heroHp: number
  heroRespawn: number
  unitDamage: { all: number; melee: number }
  unitHp: number
  summonCooldown: number // % change to the cooldown of summon spells (negative = faster)
  enemyHealth: number // % change to enemies' health, which shortens or lengthens the kill
  ignored: { perk: string; why: string }[]
}

export const emptyMods = (): Mods => ({
  towerDamage: { all: 0, magic: 0, artillery: 0 }, towerSpeed: { artillery: 0, barracks: 0 },
  towerRange: { magic: 0 }, skillCooldown: { all: 0, artillery: 0, barracks: 0, magic: 0 },
  skillDamage: { magic: 0 }, spellDamage: 0, heroDamage: { all: 0, ranged: 0, melee: 0 },
  heroHp: 0, heroRespawn: 0, unitDamage: { all: 0, melee: 0 }, unitHp: 0, summonCooldown: 0, enemyHealth: 0, ignored: [],
})

/** Why a perk does not change a DPS number. */
function whyNotCounted(p: PerkDef): string {
  const stat = String(p.stat), target = String(p.target)
  if (target === 'enemies' && stat === 'damage') return 'it weakens enemies, so it does not change your damage'
  if (target === 'enemies' && stat === 'speed') return 'it slows enemies, so it does not change your damage'
  if (target === 'enemies' && stat === 'armorPhysical') return "it lowers enemies' armor, but the boss's armor is not known yet"
  if (stat === 'area') return 'a wider area does not add damage against a single boss'
  if (['speed', 'armor', 'health', 'respawnTime'].includes(stat)) return 'it helps your units survive or move, not their damage'
  return `${stat} on ${target} is not a damage number`
}

export function applyPerk(m: Mods, p: PerkDef): void {
  if (p.pct === null || !p.stat) { m.ignored.push({ perk: p.name, why: 'no value in library' }); return }
  const v = p.pct
  switch (`${p.stat}|${p.target}`) {
    case 'damage|allTowers': m.towerDamage.all += v; break
    case 'damage|magicTowers': m.towerDamage.magic += v; break
    case 'damage|artilleryTowers':
    case "artillery towers' damage|null": m.towerDamage.artillery += v; break
    case "spells' damage|null":
    case 'spellDamage|all': m.spellDamage += v; break
    case 'damage|hero': m.heroDamage.all += v; break
    case 'melee damage|hero': m.heroDamage.melee += v; break
    case 'damage|heroRanged': m.heroDamage.ranged += v; break
    case 'damage|allies': m.unitDamage.all += v; break
    case 'damage|alliesMelee': m.unitDamage.melee += v; break
    case 'attackSpeed|artilleryTowers': m.towerSpeed.artillery += v; break
    case 'attackSpeed|barracks': m.towerSpeed.barracks += v; break
    case 'range|magicTowers': m.towerRange.magic += v; break
    case 'skillCooldown|allTowers': m.skillCooldown.all += v; break
    case 'cooldown|summon spells':
    case 'skillCooldown|summonSpells': m.summonCooldown += v; break
    case 'health|enemies': m.enemyHealth += v; break
    case 'skillCooldown|artilleryTowers': m.skillCooldown.artillery += v; break
    case 'skillCooldown|barracks': m.skillCooldown.barracks += v; break
    case 'skillCooldown|magicTowers': m.skillCooldown.magic += v; break
    case 'skillDamage|magicTowers': m.skillDamage.magic += v; break
    case 'health|hero': m.heroHp += v; break
    case 'health|allies': m.unitHp += v; m.heroHp += v; break
    case 'respawnTime|hero': m.heroRespawn += v; break
    default:
      m.ignored.push({ perk: p.name, why: whyNotCounted(p) })
  }
}

export function collectMods(perkLists: PerkDef[][]): Mods {
  const m = emptyMods()
  for (const list of perkLists) for (const p of list) applyPerk(m, p)
  return m
}
