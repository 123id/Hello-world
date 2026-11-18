// Adapter: raw card library (src/data/library.json) -> simulator cards.
// Rule: never invent numbers. A card is "selectable" only if the library has what the engine needs;
// everything else is listed with the reason it is excluded. Defaults we had to assume are marked.
import raw from '../data/library.json'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>
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

export interface SkillDef {
  id: string; name: string
  kind: 'periodic' | 'dot' | 'other'
  supported: boolean
  why?: string // why it is not simulated
  cost: number | null // gold to buy
  cooldown?: number; dmgAvg?: number; aoe?: number; dps?: number; duration?: number
}

export interface PerkDef { name: string; stat: string | null; target: string | null; pct: number | null; inferred?: boolean }

export type TowerClass = 'ranged' | 'magic' | 'artillery'

export interface TowerDef {
  id: string; name: string; rarity: string | null
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
  id: string; name: string; rarity: string | null
  hp: number; armor: number
  dmgMin: number; dmgMax: number; interval: number
  respawn: number; respawnAssumed: boolean
  ranged: boolean
  skills: SkillDef[]; perks: PerkDef[]
  issues: string[]; selectable: boolean
}

export interface SpellDef {
  id: string; name: string; rarity: string | null
  kind: 'strike' | 'zone' | 'buff' | 'other'
  cooldown: number
  aoe: number
  hits: number; dmgMin: number; dmgMax: number // strike
  dpsAvg: number; duration: number; slowPct: number // zone (duration also used by buff)
  buffDmgPct: number; buffRangePct: number; buffTowers: number // buff (Royal Edict)
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

function skillsOf(card: Raw): SkillDef[] {
  return ((card.skills ?? []) as Raw[]).map((s): SkillDef => {
    const base = { id: String(s.id), name: String(s.name ?? s.id), cost: num(s.purchaseCost) }
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
      id: c.id, name: c.name, rarity: c.rarity ?? null, kind: barracks ? 'barracks' : 'shooter', cls,
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
      id: c.id, name: c.name, rarity: c.rarity ?? null,
      hp: hp ?? 0, armor: num(c.armorPct) ?? 0, dmgMin: dmin ?? 0, dmgMax: dmax ?? 0, interval: iv ?? 1,
      respawn: resp ?? 15, respawnAssumed: resp === null, ranged: c.attackType === 'ranged' || c.attackType === 'flying',
      skills: skillsOf(c), perks: perksOf(c), issues, selectable: issues.length === 0,
    }
  })
}

function buildSpells(): SpellDef[] {
  return [...(raw.spells as Raw[]), ...(raw.heroes as Raw[]).filter((c) => MISFILED_SPELLS.has(c.id))].map((c): SpellDef => {
    const cd = num(c.cooldownSec)
    const issues: string[] = []
    let kind: SpellDef['kind'] = 'other'
    const dmin = num(c.damageMin), dmax = num(c.damageMax), pmin = num(c.dpsMin), pmax = num(c.dpsMax), dur = num(c.durationSec)
    if (c.kind === 'spellDamage' && dmin !== null && dmax !== null && cd) kind = 'strike'
    else if (c.kind === 'spellDamage' && pmin !== null && pmax !== null && dur && cd) kind = 'zone'
    else if (c.kind === 'spellBuff' && num(c.buffDamagePct) !== null && dur && cd) kind = 'buff'
    else issues.push(c.kind === 'spellDamage' ? 'damage or duration missing in library' : `${c.kind ?? (MISFILED_SPELLS.has(c.id) ? 'summon' : 'unknown')} spell not simulated yet`)
    return {
      id: c.id, name: c.name, rarity: c.rarity ?? null, kind, cooldown: cd ?? 0, aoe: num(c.aoe) ?? 80,
      hits: num(c.hits) ?? 1, dmgMin: dmin ?? 0, dmgMax: dmax ?? 0,
      buffDmgPct: num(c.buffDamagePct) ?? 0, buffRangePct: num(c.buffRangePct) ?? 0, buffTowers: num(c.affectedTowers) ?? 4,
      dpsAvg: pmin !== null && pmax !== null ? avg(pmin, pmax) : 0, duration: dur ?? 0, slowPct: num(c.slowPct) ?? 0,
      perks: perksOf(c), issues, selectable: issues.length === 0,
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
