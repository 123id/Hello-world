// Adapter: raw card library (src/data/library.json) -> simulator cards.
// Rule: never invent numbers. A card is "selectable" only if the library has what the engine needs;
// everything else is listed with the reason it is excluded. Defaults we had to assume are marked.
import rawJson from '../data/library.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>

/**
 * Facts read from the owner's screen recording of the game's Mage Tower page (2026-11). Only things that do not depend on
 * the card's level are applied: tower costs per level and the Spell Barrage skill's cooldown, cost and number of targets.
 * (The damage numbers on that page are for a level 15 card, so they are NOT applied; the library's level 7 damage stays.)
 */
function patchRaw(r: Raw): Raw {
  const mage = (r.towers as Raw[]).find((t) => t.id === 'mage-tower')
  if (mage) {
    const cost: Record<number, number> = { 1: 70, 2: 150, 3: 230 }
    for (const t of mage.tiers as Raw[]) t.totalCost = cost[t.tier] ?? t.totalCost
    const sb = (mage.skills as Raw[]).find((x) => x.id === 'spell-barrage')
    if (sb) { sb.cooldownSec = 16; sb.units = 8; sb.purchaseCost = 250 }
  }
  return r
}
const raw = patchRaw(structuredClone(rawJson) as Raw)
export type Tier = 1 | 2 | 3
export const TIERS: Tier[] = [1, 2, 3]

export interface TierDef {
  cost: number | null // cumulative gold to reach this tier
  dmgMin: number; dmgMax: number // shooter: per shot. barracks: per unit hit.
  interval: number
  range: number | null
  aoe: number | null
  units: number | null; unitHp: number | null; unitArmor: number | null
}

/** How to turn a skill into damage per second (used by the deck builder; the fight simulator uses the simpler fields below). */
export type SkillCalc =
  | { type: 'cast'; cooldown: number | number[]; dmgAvg: number; strikes: number; targets: number; chance: number } // `number[]` = one value per tower level. `targets` = affected units: with only the boss in range, every one of them hits the boss
  | { type: 'dot'; dps: number | number[]; duration: number | number[]; cooldown?: number } // no cooldown = applied by the tower's attacks, always on
  | { type: 'summon'; units: number; dmgAvg: number; interval: number; cooldown: number; duration: number | null }

export interface SkillDef {
  id: string; name: string
  kind: 'periodic' | 'dot' | 'other'
  supported: boolean
  why?: string // why it is not simulated
  cost: number | null // gold to buy
  cooldown?: number; dmgAvg?: number; aoe?: number; dps?: number; duration?: number
  calc: SkillCalc | null // null: the library has no usable damage numbers (see calcWhy)
  calcWhy?: string
  dmgMin?: number | null; dmgMax?: number | null; units?: number | null // as the game's skill page lists them
}

export interface PerkDef { name: string; stat: string | null; target: string | null; pct: number | null; inferred?: boolean }

export type TowerClass = 'ranged' | 'magic' | 'artillery'

export interface TowerDef {
  id: string; name: string; rarity: string | null; dataLevel: number | null
  kind: 'shooter' | 'barracks'
  cls: TowerClass // GUESSED for perks / anti-air rules (see TOWER_CLASS)
  hitsAir: boolean
  targetsHighestHp: boolean // Twilight Longbow "Enemy Focus"
  tiers: Partial<Record<Tier, TierDef>>
  skills: SkillDef[]
  perks: PerkDef[]
  issues: string[]
  selectable: boolean
}

export interface HeroDef {
  id: string; name: string; rarity: string | null; dataLevel: number | null // the card level the library's numbers were read at (the calculator wants 9)
  hp: number; armor: number
  dmgMin: number; dmgMax: number; interval: number
  respawn: number; respawnAssumed: boolean
  ranged: boolean
  skills: SkillDef[]; perks: PerkDef[]
  issues: string[]; selectable: boolean
}

export interface SpellDef {
  id: string; name: string; rarity: string | null; dataLevel: number | null
  kind: 'strike' | 'zone' | 'buff' | 'summon' | 'other'
  cooldown: number
  aoe: number
  hits: number; dmgMin: number; dmgMax: number // strike
  dpsAvg: number; duration: number; slowPct: number // zone (duration also used by buff)
  buffDmgPct: number; buffRangePct: number; buffTowers: number // buff (Royal Edict)
  summon: { units: number; dmgAvg: number; interval: number; duration: number } | null // summon spells (Reinforcements, Fallen Order)
  perks: PerkDef[]
  issues: string[]; selectable: boolean
}

// Tower classes: the library only records damage type for a few towers, so these are our best guess.
// They drive (a) "artillery can't hit flying, except Tesla" and (b) perks aimed at magic / artillery towers.
export const TOWER_CLASS: Record<string, TowerClass> = {
  'dwarven-artillery': 'artillery', 'tesla-x104': 'artillery', 'dwaarp': 'artillery',
  'battle-mecha': 'artillery', 'genies-domains': 'artillery',
  'mage-tower': 'magic', 'sorcerer-mage': 'magic', 'archmage': 'magic', 'arcane-wizard': 'magic',
  'blazing-gem': 'magic', 'necromancer': 'magic', 'witches-coven': 'magic', 'glacial-druid': 'magic',
  'holy-sanctuary': 'magic', 'cursed-altar': 'magic',
}
const AIR_EXCEPTIONS = new Set(['tesla-x104'])

// Cards the raw library files under the wrong kind (confirmed from the game's deck screen).
// Wrath of Blackburn sits in a spell slot and has a single summon skill, so it is a spell.
const MISFILED_SPELLS = new Set(['wrath-of-blackburn'])
// Values the library lacks but the game shows (hero info page: Gerald Lightseeker respawn 15).
const RESPAWN_FIXES: Record<string, number> = { 'gerald-lightseeker': 15 }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const avg = (a: number, b: number) => (a + b) / 2

function perksOf(card: Raw): PerkDef[] {
  return ((card.perks ?? []) as Raw[]).filter((p) => p.name).map((p) => ({
    name: p.name as string, stat: p.stat ?? null, target: p.target ?? null, pct: num(p.pct),
  }))
}

/** Perks the library lists without values often have the same name as one that does: reuse that definition. */
function fillPerks(all: PerkDef[][]): void {
  const known = new Map<string, PerkDef>()
  for (const list of all) for (const p of list) if (p.pct !== null && p.stat) known.set(p.name, p)
  // "Mana Wrath" is read off the Arcane Wizard tooltip: +3% to all spells' damage.
  known.set('Mana Wrath', { name: 'Mana Wrath', stat: 'spellDamage', target: 'all', pct: 3, inferred: true })
  for (const list of all) for (const p of list) {
    if (p.pct === null || !p.stat) {
      const k = known.get(p.name)
      if (k) { p.stat = k.stat; p.target = k.target; p.pct = k.pct; p.inferred = true }
    }
  }
}

function calcOf(s: Raw): { calc: SkillCalc | null; calcWhy?: string } {
  if (s.scope !== 'boss') return { calc: null, calcWhy: `scope: ${s.scope}` }
  const dmin = num(s.damageMin), dmax = num(s.damageMax)
  const cdTier = Array.isArray(s.cooldownByTierSec) && s.cooldownByTierSec.length === 3 ? (s.cooldownByTierSec as number[]) : null
  const cd = cdTier ?? num(s.cooldownSec)

  if (s.kind === 'summon') {
    const units = num(s.units), umin = num(s.unitDamageMin), umax = num(s.unitDamageMax), iv = num(s.unitAttackIntervalSec), c = num(s.cooldownSec)
    const miss = [units === null && 'unit count', umin === null && 'unit damage', iv === null && 'unit attack speed', c === null && 'cooldown'].filter(Boolean)
    if (miss.length) return { calc: null, calcWhy: `the library has no ${miss.join(', ')} for this summon` }
    return { calc: { type: 'summon', units: units!, dmgAvg: avg(umin!, umax ?? umin!), interval: iv!, cooldown: c!, duration: num(s.durationSec) } }
  }
  if (s.kind === 'dot') {
    if (Array.isArray(s.byTier) && s.byTier.length === 3 && (s.byTier as Raw[]).every((t) => num(t.dpsMin) !== null && num(t.dpsMax) !== null && num(t.durationSec) !== null)) {
      const t = s.byTier as Raw[]
      return { calc: { type: 'dot', dps: t.map((x) => avg(x.dpsMin, x.dpsMax)), duration: t.map((x) => x.durationSec as number), cooldown: num(s.cooldownSec) ?? undefined } }
    }
    if (num(s.dpsMin) !== null && num(s.dpsMax) !== null && num(s.durationSec)) {
      return { calc: { type: 'dot', dps: avg(s.dpsMin, s.dpsMax), duration: s.durationSec, cooldown: num(s.cooldownSec) ?? undefined } }
    }
    return { calc: null, calcWhy: 'the library has no damage per second or duration for this damage-over-time skill' }
  }
  if (dmin !== null && dmax !== null) {
    if (!cd) return { calc: null, calcWhy: 'damage is listed but the library has no cooldown (it may trigger by chance)' }
    const targets = s.kind === 'periodicDamage' && !s.strikes ? num(s.units) ?? 1 : 1 // owner: "if only one enemy is in range, all of them hit the boss"
    return { calc: { type: 'cast', cooldown: cd, dmgAvg: avg(dmin, dmax), strikes: num(s.strikes) ?? 1, targets, chance: (num(s.chancePct) ?? 100) / 100 } }
  }
  return { calc: null, calcWhy: `a ${s.kind ?? 'unknown'} skill with no damage number` }
}

function skillsOf(card: Raw): SkillDef[] {
  return ((card.skills ?? []) as Raw[]).map((s): SkillDef => {
    const base = { id: String(s.id), name: String(s.name ?? s.id), cost: num(s.purchaseCost), ...calcOf(s), dmgMin: num(s.damageMin), dmgMax: num(s.damageMax), units: num(s.units) ?? num(s.affectedUnits) }
    if (s.scope !== 'boss') return { ...base, kind: 'other', supported: false, why: `scope: ${s.scope}` }
    const cd = num(s.cooldownSec), dmin = num(s.damageMin), dmax = num(s.damageMax)
    if (s.kind === 'periodicDamage' && cd && dmin !== null && dmax !== null) {
      return { ...base, kind: 'periodic', supported: true, cooldown: cd, dmgAvg: avg(dmin, dmax), aoe: num(s.aoe) ?? undefined }
    }
    if (s.kind === 'dot' && num(s.dpsMin) !== null && num(s.dpsMax) !== null && num(s.durationSec)) {
      return { ...base, kind: 'dot', supported: true, dps: avg(s.dpsMin, s.dpsMax), duration: s.durationSec, aoe: num(s.aoe) ?? undefined, cooldown: cd ?? undefined }
    }
    return { ...base, kind: 'other', supported: false, why: `${s.kind} not simulated yet` }
  })
}

function towerTier(t: Raw, barracks: boolean): TierDef | null {
  const dmin = num(t.damageMin), dmax = num(t.damageMax), iv = num(t.attackIntervalSec)
  if (dmin === null || dmax === null || iv === null) return null
  if (barracks && (!num(t.units) || !num(t.unitHealth))) return null
  if (!barracks && !num(t.range)) return null
  return {
    cost: num(t.totalCost), dmgMin: dmin, dmgMax: dmax, interval: iv, range: num(t.range),
    aoe: num(t.aoe), units: num(t.units), unitHp: num(t.unitHealth), unitArmor: num(t.unitArmorPct),
  }
}

function buildTowers(): TowerDef[] {
  return (raw.towers as Raw[]).map((c): TowerDef => {
    const barracks = !!c.barracks
    const issues: string[] = []
    const tiers: Partial<Record<Tier, TierDef>> = {}
    for (const t of c.tiers as Raw[]) {
      if (t.unitOneHealth || t.unitTwoHealth) { issues.push('two unit types per tier (not modeled)'); continue }
      const td = towerTier(t, barracks)
      if (td) tiers[t.tier as Tier] = td
    }
    if (!tiers[3]) issues.push('tier 3 stats incomplete in library')
    const cls = TOWER_CLASS[c.id] ?? 'ranged'
    return {
      id: c.id, name: c.name, rarity: c.rarity ?? null, dataLevel: num(c.dataLevel), kind: barracks ? 'barracks' : 'shooter', cls,
      hitsAir: cls !== 'artillery' || AIR_EXCEPTIONS.has(c.id),
      targetsHighestHp: c.id === 'twilight-longbow',
      tiers, skills: skillsOf(c), perks: perksOf(c), issues: [...new Set(issues)], selectable: issues.length === 0,
    }
  })
}

function buildHeroes(): HeroDef[] {
  return (raw.heroes as Raw[]).filter((c) => !MISFILED_SPELLS.has(c.id)).map((c): HeroDef => {
    const issues: string[] = []
    const hp = num(c.health), dmin = num(c.damageMin), dmax = num(c.damageMax), iv = num(c.attackIntervalSec)
    if (hp === null) issues.push('health missing')
    if (dmin === null || dmax === null) issues.push('damage missing')
    if (iv === null) issues.push('attack speed missing')
    const resp = num(c.respawnSec) ?? RESPAWN_FIXES[c.id] ?? null
    return {
      id: c.id, name: c.name, rarity: c.rarity ?? null, dataLevel: num(c.dataLevel),
      hp: hp ?? 0, armor: num(c.armorPct) ?? 0, dmgMin: dmin ?? 0, dmgMax: dmax ?? 0, interval: iv ?? 1,
      respawn: resp ?? 15, respawnAssumed: resp === null, ranged: c.attackType === 'ranged' || c.attackType === 'flying',
      skills: skillsOf(c), perks: perksOf(c), issues, selectable: issues.length === 0,
    }
  })
}

function buildSpells(): SpellDef[] {
  return [...(raw.spells as Raw[]), ...(raw.heroes as Raw[]).filter((c) => MISFILED_SPELLS.has(c.id))].map((card): SpellDef => {
    // a spell the library filed as a hero keeps its numbers in its single skill
    const c: Raw = MISFILED_SPELLS.has(card.id) && card.skills?.[0] ? { ...card, ...card.skills[0], id: card.id, name: card.name, perks: card.perks, rarity: card.rarity } : card
    const cd = num(c.cooldownSec)
    const issues: string[] = []
    let kind: SpellDef['kind'] = 'other'
    const dmin = num(c.damageMin), dmax = num(c.damageMax), pmin = num(c.dpsMin), pmax = num(c.dpsMax), dur = num(c.durationSec)
    if (c.kind === 'spellDamage' && dmin !== null && dmax !== null && cd) kind = 'strike'
    else if (c.kind === 'spellDamage' && pmin !== null && pmax !== null && dur && cd) kind = 'zone'
    else if (c.kind === 'spellBuff' && num(c.buffDamagePct) !== null && dur && cd) kind = 'buff'
    else if ((c.kind === 'spellSummon' || c.kind === 'summon') && num(c.units) && num(c.unitDamageMin) !== null && num(c.unitAttackIntervalSec) && dur && cd) kind = 'summon'
    else issues.push(c.kind === 'spellDamage' ? 'damage or duration missing in library' : `${c.kind ?? (MISFILED_SPELLS.has(c.id) ? 'summon' : 'unknown')} spell not simulated yet`)
    return {
      id: c.id, name: c.name, rarity: c.rarity ?? null, dataLevel: num(c.dataLevel), kind, cooldown: cd ?? 0, aoe: num(c.aoe) ?? 80,
      hits: num(c.hits) ?? 1, dmgMin: dmin ?? 0, dmgMax: dmax ?? 0,
      buffDmgPct: num(c.buffDamagePct) ?? 0, buffRangePct: num(c.buffRangePct) ?? 0, buffTowers: num(c.affectedTowers) ?? 4,
      dpsAvg: pmin !== null && pmax !== null ? avg(pmin, pmax) : 0, duration: dur ?? 0, slowPct: num(c.slowPct) ?? 0,
      summon: kind === 'summon' ? { units: num(c.units)!, dmgAvg: avg(num(c.unitDamageMin)!, num(c.unitDamageMax) ?? num(c.unitDamageMin)!), interval: num(c.unitAttackIntervalSec)!, duration: dur! } : null,
      perks: perksOf(card), issues: kind === 'summon' ? [] : issues, selectable: issues.length === 0,
    }
  })
}

const towers = buildTowers()
const heroes = buildHeroes()
const spells = buildSpells()
fillPerks([...towers, ...heroes, ...spells].map((c) => c.perks))

export const LIBRARY = { towers, heroes, spells }
export const BOSS_DEFAULT = raw.bossDefault as { name: string; health: number; damageMin: number; damageMax: number }

export const towerById = (id: string) => towers.find((t) => t.id === id)
export const heroById = (id: string) => heroes.find((h) => h.id === id)
export const spellById = (id: string) => spells.find((s) => s.id === id)
