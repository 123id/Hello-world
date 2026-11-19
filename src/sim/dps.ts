// "Pure number" DPS for deck building: damage per hit ÷ attack time, plus every skill's damage ÷ its cooldown.
// No map, no boss position, no creeps, no blocking. (The position-dependent fight is the simulator in engine.ts.)
import { shooterStats } from './engine'
import type { HeroDef, SkillDef, SpellDef, Tier, TowerDef } from './library'
import { collectMods, emptyMods, type Mods } from './perks'

export interface DpsPart { label: string; dps: number; detail: string; skillId?: string }
/**
 * `dps` is null when the library lacks the numbers; `parts` are the pieces that add up to it;
 * `notes` say what is left out; `counted` lists the skills inside the number.
 */
export interface CardDps { dps: number | null; parts: DpsPart[]; notes: string[]; counted: string[] }

/** Options that change how skills are counted. */
export interface SkillCtx {
  tier: Tier // tower level (picks per-level cooldowns, damage-over-time values)
  cdPct?: number // % change to cooldowns from perks
  dmgPct?: number // % change to skill damage from perks
  perHit: boolean // true: the listed damage of a multi-hit skill is per hit (so × hits); false: it is per cast
}

const avg = (a: number, b: number) => (a + b) / 2
const n0 = (v: number) => Math.round(v).toLocaleString()
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString()
const sum = (parts: DpsPart[]) => parts.reduce((a, p) => a + p.dps, 0)
const noData = (notes: string[]): CardDps => ({ dps: null, parts: [], notes, counted: [] })
const pick = (v: number | number[], tier: Tier) => (Array.isArray(v) ? v[tier - 1] : v)

export interface SkillResult { part: DpsPart | null; why?: string; whileActive?: number }

/** One skill's DPS with the arithmetic spelled out, or null with the reason the library can't say. */
export function skillDps(s: SkillDef, c: SkillCtx): SkillResult {
  const k = s.calc
  if (!k) return { part: null, why: s.calcWhy?.startsWith('scope') ? 'opponent-only or not used on the boss' : (s.calcWhy ?? 'no damage numbers in the library') }
  const cdPct = c.cdPct ?? 0, dmgPct = c.dmgPct ?? 0
  const cooldown = (v: number | number[]) => pick(v, c.tier) * Math.max(0.1, 1 + cdPct / 100)

  if (k.type === 'cast') {
    const cd = cooldown(k.cooldown), dmg = k.dmgAvg * (1 + dmgPct / 100)
    const hits = (c.perHit ? k.strikes : 1) * k.targets
    const perCast = dmg * hits * k.chance
    const how = hits > 1 ? `${hits} hits × ${n0(dmg)} = ${n0(dmg * hits)} per cast` : `${n0(dmg)} per cast`
    const chance = k.chance < 1 ? ` × ${Math.round(k.chance * 100)}% chance` : ''
    const units = k.targets > 1 ? ` (${k.targets} affected units, all on the boss)` : ''
    return { part: { label: s.name, skillId: s.id, dps: perCast / cd, detail: `${how}${chance} ÷ ${n1(cd)} s cooldown${units}` } }
  }
  if (k.type === 'dot') {
    const dps = pick(k.dps, c.tier) * (1 + dmgPct / 100), dur = pick(k.duration, c.tier)
    if (k.cooldown) {
      const cd = cooldown(k.cooldown)
      return { part: { label: s.name, skillId: s.id, dps: dps * Math.min(1, dur / cd), detail: `${n0(dps)} dps for ${dur} s, every ${n1(cd)} s` } }
    }
    return { part: { label: s.name, skillId: s.id, dps, detail: `${n0(dps)} dps, applied by every attack (always on)` } }
  }
  // summon
  const cd = cooldown(k.cooldown), each = (k.units * k.dmgAvg) / k.interval
  if (k.duration === null) {
    return { part: null, whileActive: each, why: `its lifetime isn't in the library. While summoned: ${k.units} × ${n0(k.dmgAvg)} per hit ÷ ${n1(k.interval)} s = ${n0(each)} DPS` }
  }
  return { part: { label: s.name, skillId: s.id, dps: each * Math.min(1, k.duration / cd), detail: `${k.units} × ${n0(k.dmgAvg)} per hit ÷ ${n1(k.interval)} s = ${n0(each)} while alive; alive ${k.duration} s of every ${n1(cd)} s` } }
}

function skillParts(skills: SkillDef[], ctx: SkillCtx): { parts: DpsPart[]; notes: string[]; counted: string[] } {
  const parts: DpsPart[] = [], notes: string[] = []
  for (const s of skills) {
    const r = skillDps(s, ctx)
    if (r.part) parts.push(r.part)
    else if (!s.calcWhy?.startsWith('scope')) notes.push(`${s.name}: not counted, ${r.why}`)
  }
  return { parts, notes, counted: parts.map((p) => p.skillId!) }
}

/** How perks change a tower's skills (cooldowns and damage). */
export function towerSkillCtx(t: TowerDef, tier: Tier, mods: Mods, perHit: boolean): SkillCtx {
  const cdPct = mods.skillCooldown.all + (t.cls === 'artillery' ? mods.skillCooldown.artillery : 0) + (t.cls === 'magic' ? mods.skillCooldown.magic : 0) + (t.kind === 'barracks' ? mods.skillCooldown.barracks : 0)
  return { tier, cdPct, dmgPct: t.cls === 'magic' ? mods.skillDamage.magic : 0, perHit }
}

export function towerDps(t: TowerDef, tier: Tier, off: string[], mods: Mods, perHit = true): CardDps {
  const td = t.tiers[tier]
  if (!td) return noData([`no level ${tier} damage numbers in the library`])
  const parts: DpsPart[] = [], notes: string[] = []
  if (t.kind === 'shooter') {
    const st = shooterStats(t, td, mods)
    parts.push({ label: 'Attack', dps: st.dmg / st.interval, detail: `${n0(st.dmg)} per hit ÷ ${n1(st.interval)} s` })
  } else {
    const ranged = (td.range ?? 0) > 0
    const dmg = avg(td.dmgMin, td.dmgMax) * (1 + (mods.unitDamage.all + (ranged ? 0 : mods.unitDamage.melee)) / 100)
    const iv = td.interval / (1 + mods.towerSpeed.barracks / 100), units = td.units ?? 0
    parts.push({ label: 'Soldiers', dps: (units * dmg) / iv, detail: `${units} soldiers × ${n0(dmg)} per hit ÷ ${n1(iv)} s` })
  }
  let counted: string[] = []
  if (tier === 3) {
    const r = skillParts(t.skills.filter((x) => !off.includes(x.id)), towerSkillCtx(t, tier, mods, perHit))
    parts.push(...r.parts); notes.push(...r.notes); counted = r.counted
  } else if (t.skills.some((x) => x.calc)) notes.push('Skills unlock at tower level 3.')
  return { dps: sum(parts), parts, notes, counted }
}

export function heroDps(h: HeroDef, mods: Mods, perHit = true): CardDps {
  if (!h.selectable) return noData([`no numbers in the library: ${h.issues.join('; ')}`])
  const pct = mods.heroDamage.all + (h.ranged ? mods.heroDamage.ranged : mods.heroDamage.melee) + mods.unitDamage.all + (h.ranged ? 0 : mods.unitDamage.melee)
  const dmg = avg(h.dmgMin, h.dmgMax) * (1 + pct / 100)
  const parts: DpsPart[] = [{ label: 'Attack', dps: dmg / h.interval, detail: `${n0(dmg)} per hit ÷ ${n1(h.interval)} s` }]
  const r = skillParts(h.skills, { tier: 3, perHit })
  parts.push(...r.parts)
  return { dps: sum(parts), parts, notes: r.notes, counted: r.counted }
}

/** `towerDpsList` = the DPS of each tower in the deck; a buff spell (Royal Edict) boosts the best few of them. */
export function spellDps(s: SpellDef, mods: Mods, towerDpsList: number[] = [], perHit = true): CardDps {
  const mult = 1 + mods.spellDamage / 100
  if (s.kind === 'strike') {
    const dmg = avg(s.dmgMin, s.dmgMax) * mult, hits = perHit ? s.hits : 1
    const d = (dmg * hits) / s.cooldown
    return { dps: d, parts: [{ label: 'Damage', dps: d, detail: `${hits > 1 ? `${hits} hits × ${n0(dmg)} = ${n0(dmg * hits)}` : `${n0(dmg)}`} per cast ÷ ${s.cooldown} s cooldown` }], notes: [], counted: [] }
  }
  if (s.kind === 'zone') {
    const d = s.dpsAvg * mult * Math.min(1, s.duration / s.cooldown)
    return { dps: d, parts: [{ label: 'Damage over time', dps: d, detail: `${n0(s.dpsAvg * mult)} dps for ${s.duration} s, every ${s.cooldown} s` }], notes: [], counted: [] }
  }
  if (s.kind === 'buff') {
    const best = [...towerDpsList].sort((a, b) => b - a).slice(0, s.buffTowers)
    const d = best.reduce((a, b) => a + b, 0) * (s.buffDmgPct / 100) * Math.min(1, s.duration / s.cooldown)
    return { dps: d, parts: [{ label: 'Tower damage buff', dps: d, detail: `+${s.buffDmgPct}% on your best ${s.buffTowers} towers for ${s.duration} s, every ${s.cooldown} s` }], notes: ['The +range part of the buff is not a damage number, so it is not counted.'], counted: [] }
  }
  if (s.kind === 'summon' && s.summon) {
    const m = s.summon, each = (m.units * m.dmgAvg * mult) / m.interval, d = each * Math.min(1, m.duration / s.cooldown)
    return { dps: d, parts: [{ label: 'Summoned units', dps: d, detail: `${m.units} × ${n0(m.dmgAvg * mult)} per hit ÷ ${n1(m.interval)} s = ${n0(each)} while alive; alive ${m.duration} s of every ${s.cooldown} s` }], notes: [], counted: [] }
  }
  return noData(s.issues.length ? s.issues : ['no damage numbers: a utility spell'])
}

/** A tower's DPS at each of its three levels (skills only count at level 3), for comparing levels side by side. */
export const towerLevels = (t: TowerDef, off: string[], mods: Mods, perHit = true) =>
  ([1, 2, 3] as Tier[]).map((tier) => ({ tier, dps: towerDps(t, tier, off, mods, perHit).dps }))

export interface DeckInput {
  hero: HeroDef | null; spells: (SpellDef | null)[]; towers: (TowerDef | null)[]
  tier: Tier // level of every tower ...
  tiers?: Record<string, Tier> // ... except the ones set individually (by tower id)
  skillsOff: Record<string, string[]> // skills of a tower that are switched off (everything is on by default)
  perks: boolean; perHit: boolean
}
export interface DeckDps {
  mods: Mods
  hero: CardDps | null; spells: (CardDps | null)[]; towers: (CardDps | null)[]
  total: number; perMin: number; gold: number; unknownCosts: number
  idealKill: number | null // boss HP ÷ DPS: every card hitting the boss the whole time
}

export const towerTierOf = (d: Pick<DeckInput, 'tier' | 'tiers'>, t: TowerDef): Tier => d.tiers?.[t.id] ?? d.tier

export function deckDps(d: DeckInput, bossHp: number): DeckDps {
  const present = [d.hero, ...d.spells, ...d.towers].filter((c): c is NonNullable<typeof c> => !!c)
  const mods = d.perks ? collectMods([present.flatMap((c) => c.perks)]) : emptyMods()
  const towers = d.towers.map((t) => (t ? towerDps(t, towerTierOf(d, t), d.skillsOff[t.id] ?? [], mods, d.perHit) : null))
  const hero = d.hero ? heroDps(d.hero, mods, d.perHit) : null
  const towerList = towers.map((t) => t?.dps ?? 0)
  const spells = d.spells.map((s) => (s ? spellDps(s, mods, towerList, d.perHit) : null))
  const total = [hero, ...spells, ...towers].reduce((a, c) => a + (c?.dps ?? 0), 0)

  let gold = 0, unknownCosts = 0
  d.towers.forEach((t, i) => {
    if (!t) return
    const tier = towerTierOf(d, t), c = t.tiers[tier]?.cost
    if (c == null) unknownCosts++; else gold += c
    for (const sid of towers[i]?.counted ?? []) { const k = t.skills.find((s) => s.id === sid)?.cost; if (k == null) unknownCosts++; else gold += k }
  })
  return { mods, hero, spells, towers, total, perMin: total * 60, gold, unknownCosts, idealKill: total > 0 ? bossHp / total : null }
}
