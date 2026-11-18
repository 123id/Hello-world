// "Pure number" DPS for deck building: damage per hit ÷ attack time, skill damage ÷ cooldown.
// No map, no boss position, no creeps, no blocking. (The position-dependent fight is the simulator in engine.ts.)
import { shooterStats } from './engine'
import type { HeroDef, SkillDef, SpellDef, Tier, TowerDef } from './library'
import { collectMods, emptyMods, type Mods } from './perks'

export interface DpsPart { label: string; dps: number; detail: string }
/** `dps` is null when the library lacks the numbers; `notes` says what is missing or not included. */
export interface CardDps { dps: number | null; parts: DpsPart[]; notes: string[] }

const avg = (a: number, b: number) => (a + b) / 2
const n0 = (v: number) => Math.round(v).toLocaleString()
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString()
const sum = (parts: DpsPart[]) => parts.reduce((a, p) => a + p.dps, 0)
const noData = (notes: string[]): CardDps => ({ dps: null, parts: [], notes })

/** One skill's DPS, or null (with a reason) when the library can't say. */
export function skillDps(s: SkillDef, cdPct = 0, dmgPct = 0): { part: DpsPart | null; why?: string } {
  if (!s.supported) return { part: null, why: s.why?.startsWith('scope') ? 'opponent-only or not used on the boss' : (s.why ?? 'no numbers in the library') }
  const cd = (s.cooldown ?? 0) * Math.max(0.1, 1 + cdPct / 100)
  if (s.kind === 'periodic' && s.dmgAvg && cd > 0) {
    const dmg = s.dmgAvg * (1 + dmgPct / 100)
    return { part: { label: s.name, dps: dmg / cd, detail: `${n0(dmg)} per cast ÷ ${n1(cd)} s cooldown` } }
  }
  if (s.kind === 'dot' && s.dps && s.duration) {
    if (cd > 0) return { part: { label: s.name, dps: s.dps * Math.min(1, s.duration / cd), detail: `${n0(s.dps)} dps for ${s.duration} s, every ${n1(cd)} s` } }
    return { part: { label: s.name, dps: s.dps, detail: `${n0(s.dps)} dps, applied on every attack (always on)` } }
  }
  return { part: null, why: 'no cooldown or damage in the library' }
}

export function towerDps(t: TowerDef, tier: Tier, bought: string[], mods: Mods): CardDps {
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
    parts.push({ label: 'Soldiers', dps: (units * dmg) / iv, detail: `${units} units × ${n0(dmg)} per hit ÷ ${n1(iv)} s` })
  }
  if (tier === 3) {
    const cdPct = mods.skillCooldown.all + (t.cls === 'artillery' ? mods.skillCooldown.artillery : 0) + (t.cls === 'magic' ? mods.skillCooldown.magic : 0) + (t.kind === 'barracks' ? mods.skillCooldown.barracks : 0)
    const dmgPct = t.cls === 'magic' ? mods.skillDamage.magic : 0
    for (const s of t.skills.filter((x) => bought.includes(x.id))) {
      const r = skillDps(s, cdPct, dmgPct)
      if (r.part) parts.push(r.part); else notes.push(`${s.name}: not counted (${r.why})`)
    }
  }
  return { dps: sum(parts), parts, notes }
}

export function heroDps(h: HeroDef, mods: Mods): CardDps {
  if (!h.selectable) return noData([`no numbers in the library: ${h.issues.join('; ')}`])
  const pct = mods.heroDamage.all + (h.ranged ? mods.heroDamage.ranged : mods.heroDamage.melee) + mods.unitDamage.all + (h.ranged ? 0 : mods.unitDamage.melee)
  const dmg = avg(h.dmgMin, h.dmgMax) * (1 + pct / 100)
  const parts: DpsPart[] = [{ label: 'Attack', dps: dmg / h.interval, detail: `${n0(dmg)} per hit ÷ ${n1(h.interval)} s` }]
  const notes: string[] = []
  for (const s of h.skills) {
    if (!s.supported && s.why?.startsWith('scope')) continue // opponent-only skills are never counted
    const r = skillDps(s)
    if (r.part) parts.push(r.part); else notes.push(`${s.name}: not counted (${r.why})`)
  }
  return { dps: sum(parts), parts, notes }
}

/** `towerDpsList` = the DPS of each tower in the deck; a buff spell (Royal Edict) boosts the best few of them. */
export function spellDps(s: SpellDef, mods: Mods, towerDpsList: number[] = []): CardDps {
  const mult = 1 + mods.spellDamage / 100
  if (s.kind === 'strike') {
    const dmg = avg(s.dmgMin, s.dmgMax) * mult
    return { dps: (dmg * s.hits) / s.cooldown, parts: [{ label: 'Damage', dps: (dmg * s.hits) / s.cooldown, detail: `${n0(dmg)} × ${s.hits} hit${s.hits === 1 ? '' : 's'} ÷ ${s.cooldown} s cooldown` }], notes: [] }
  }
  if (s.kind === 'zone') {
    const d = s.dpsAvg * mult * Math.min(1, s.duration / s.cooldown)
    return { dps: d, parts: [{ label: 'Damage over time', dps: d, detail: `${n0(s.dpsAvg * mult)} dps for ${s.duration} s, every ${s.cooldown} s` }], notes: [] }
  }
  if (s.kind === 'buff') {
    const best = [...towerDpsList].sort((a, b) => b - a).slice(0, s.buffTowers)
    const d = best.reduce((a, b) => a + b, 0) * (s.buffDmgPct / 100) * Math.min(1, s.duration / s.cooldown)
    return { dps: d, parts: [{ label: 'Tower damage buff', dps: d, detail: `+${s.buffDmgPct}% on your best ${s.buffTowers} towers for ${s.duration} s, every ${s.cooldown} s` }], notes: ['The +range part of the buff is not a damage number, so it is not counted.'] }
  }
  return noData(s.issues.length ? s.issues : ['no damage numbers: a utility or summon spell'])
}

export interface DeckInput {
  hero: HeroDef | null; spells: (SpellDef | null)[]; towers: (TowerDef | null)[]
  tier: Tier; skills: Record<string, string[]>; perks: boolean
}
export interface DeckDps {
  mods: Mods
  hero: CardDps | null; spells: (CardDps | null)[]; towers: (CardDps | null)[]
  total: number; perMin: number; gold: number; unknownCosts: number
  idealKill: number | null // boss HP ÷ DPS: every card hitting the boss the whole time
}

export function deckDps(d: DeckInput, bossHp: number): DeckDps {
  const present = [d.hero, ...d.spells, ...d.towers].filter((c): c is NonNullable<typeof c> => !!c)
  const mods = d.perks ? collectMods([present.flatMap((c) => c.perks)]) : emptyMods()
  const towers = d.towers.map((t) => (t ? towerDps(t, d.tier, d.skills[t.id] ?? [], mods) : null))
  const hero = d.hero ? heroDps(d.hero, mods) : null
  const towerList = towers.map((t) => t?.dps ?? 0)
  const spells = d.spells.map((s) => (s ? spellDps(s, mods, towerList) : null))
  const total = [hero, ...spells, ...towers].reduce((a, c) => a + (c?.dps ?? 0), 0)

  let gold = 0, unknownCosts = 0
  for (const t of d.towers) {
    if (!t) continue
    const c = t.tiers[d.tier]?.cost
    if (c == null) unknownCosts++; else gold += c
    if (d.tier === 3) for (const sid of d.skills[t.id] ?? []) { const k = t.skills.find((s) => s.id === sid)?.cost; if (k == null) unknownCosts++; else gold += k }
  }
  return { mods, hero, spells, towers, total, perMin: total * 60, gold, unknownCosts, idealKill: total > 0 ? bossHp / total : null }
}
