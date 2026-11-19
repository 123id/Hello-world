import { describe, expect, it } from 'vitest'
import { deckDps, heroDps, skillDps, spellDps, towerDps, towerLevels } from './dps'
import { emptyMods } from './perks'
import { heroById, spellById, towerById, type SkillDef } from './library'

const m = emptyMods()
const T = (id: string) => towerById(id)!
const skill = (calc: SkillDef['calc'], over: Partial<SkillDef> = {}): SkillDef => ({ id: 's', name: 'S', kind: 'other', supported: false, cost: null, calc, ...over })
const ctx = { tier: 3 as const, perHit: true }

describe('basic attack = damage per hit ÷ attack time', () => {
  it('a shooter tower: Royal Archers level 3', () => {
    const t3 = T('royal-archers').tiers[3]!
    const r = towerDps(T('royal-archers'), 3, [], m)
    expect(r.parts[0].dps).toBeCloseTo(((t3.dmgMin + t3.dmgMax) / 2) / t3.interval, 6)
    expect(r.parts[0].detail).toMatch(/per hit ÷ 0\.5 s/)
  })
  it('a barracks counts every soldier', () => {
    const t3 = T('rocket-gunners').tiers[3]!
    expect(towerDps(T('rocket-gunners'), 3, ['phosphoric-coating', 'sting-missiles', 'aerial-maneuvre'], m).parts[0].dps).toBeCloseTo((t3.units! * (t3.dmgMin + t3.dmgMax) / 2) / t3.interval, 6)
  })
  it('a level with no library damage gives null, not zero', () => {
    const r = towerDps(T('archer-tower'), 3, [], m)
    expect(r.dps).toBeNull(); expect(r.notes.join()).toMatch(/level 3/)
  })
  it('levels compare side by side, and skills only start at level 3', () => {
    const lv = towerLevels(T('genies-domains'), [], m)
    expect(lv[0].dps!).toBeLessThan(lv[1].dps!); expect(lv[1].dps!).toBeLessThan(lv[2].dps!)
    expect(towerDps(T('genies-domains'), 2, [], m).counted).toEqual([])
    expect(towerDps(T('genies-domains'), 3, [], m).counted).toContain('wish-of-embers')
  })
})

describe('skill maths', () => {
  it('a cast skill: damage ÷ cooldown', () => {
    const r = skillDps(skill({ type: 'cast', cooldown: 10, dmgAvg: 1000, strikes: 1, targets: 1, chance: 1 }), ctx)
    expect(r.part!.dps).toBe(100); expect(r.part!.detail).toBe('1,000 per cast ÷ 10 s cooldown')
  })
  it('a multi-hit skill multiplies by the number of hits when damage is per hit, not when it is per cast', () => {
    const k = skill({ type: 'cast', cooldown: 12, dmgAvg: 300, strikes: 8, targets: 1, chance: 1 })
    expect(skillDps(k, { tier: 3, perHit: true }).part!.dps).toBe((300 * 8) / 12)
    expect(skillDps(k, { tier: 3, perHit: true }).part!.detail).toBe('8 hits × 300 = 2,400 per cast ÷ 12 s cooldown')
    expect(skillDps(k, { tier: 3, perHit: false }).part!.dps).toBe(300 / 12)
  })
  it("Alleria Swiftwind's Multi Shot: 8 shots of 279–367 every 12 s", () => {
    const ms = heroById('alleria-swiftwind')!.skills.find((s) => s.name === 'Multi Shot')!
    expect(skillDps(ms, ctx).part!.dps).toBeCloseTo((8 * 323) / 12, 6)
  })
  it("affected units all hit a lone boss: Mage Tower's Spell Barrage = 8 hits of 810–971 every 16 s", () => {
    const sb = T('mage-tower').skills.find((s) => s.id === 'spell-barrage')!
    const r = skillDps(sb, ctx)
    expect(r.part!.dps).toBeCloseTo((8 * 890.5) / 16, 6)
    expect(r.part!.detail).toBe('8 hits × 891 = 7,124 per cast ÷ 16 s cooldown (8 affected units, all on the boss)')
    // the per-hit switch is about listed multi-hit damage, not about affected units
    expect(skillDps(sb, { tier: 3, perHit: false }).part!.dps).toBeCloseTo((8 * 890.5) / 16, 6)
  })
  it('other skills that list affected units are multiplied too', () => {
    const wasp = T('battle-mecha').skills.find((s) => s.id === 'wasp-missile')!
    expect(skillDps(wasp, ctx).part!.dps).toBeCloseTo((2 * ((1597 + 2202) / 2)) / 18, 6)
  })
  it('costs and the Spell Barrage cooldown confirmed from the game video are in the library', () => {
    expect([1, 2, 3].map((t) => T('mage-tower').tiers[t as 1 | 2 | 3]!.cost)).toEqual([70, 150, 230])
    expect(T('mage-tower').skills.find((s) => s.id === 'spell-barrage')!.cost).toBe(250)
  })
  it('a chance multiplies the damage', () => {
    expect(skillDps(skill({ type: 'cast', cooldown: 10, dmgAvg: 1000, strikes: 1, targets: 1, chance: 0.25 }), ctx).part!.dps).toBe(25)
  })
  it('perks shorten cooldowns and add damage', () => {
    const k = skill({ type: 'cast', cooldown: 10, dmgAvg: 1000, strikes: 1, targets: 1, chance: 1 })
    expect(skillDps(k, { ...ctx, cdPct: -20 }).part!.dps).toBeCloseTo(1000 / 8, 6)
    expect(skillDps(k, { ...ctx, dmgPct: 10 }).part!.dps).toBeCloseTo(110, 6)
  })
  it('a cooldown that depends on tower level: Snack Hour is 65 / 60 / 55 s', () => {
    const sh = T('sandworm-hollow').skills.find((s) => s.id === 'snack-hour')!
    expect(skillDps(sh, { tier: 1, perHit: true }).part!.dps).toBeCloseTo(12868 / 65, 6)
    expect(skillDps(sh, { tier: 3, perHit: true }).part!.dps).toBeCloseTo(12868 / 55, 6)
  })
  it('damage over time: uptime when it has a cooldown, always on when it does not', () => {
    expect(skillDps(skill({ type: 'dot', dps: 300, duration: 5, cooldown: 20 }), ctx).part!.dps).toBe(75)
    expect(skillDps(skill({ type: 'dot', dps: 200, duration: 3 }), ctx).part!.dps).toBe(200)
  })
  it('damage over time by level: Rainbow Magic', () => {
    const rm = T('witches-coven').skills.find((s) => s.id === 'rainbow-magic')!
    expect(skillDps(rm, { tier: 1, perHit: true }).part!.dps).toBeCloseTo((63 + 168) / 2, 6)
    expect(skillDps(rm, { tier: 3, perHit: true }).part!.dps).toBeCloseTo((132 + 204) / 2, 6)
  })
  it('summons: units × hit ÷ interval, scaled by how long they live of each cooldown', () => {
    // Ingvar's Ancestor's Call: 2 units of 482–662 every 1.4 s, alive 12 s of every 23 s
    const ac = heroById('ingvar-bearclaw')!.skills.find((s) => s.id === 'ancestors-call')!
    expect(skillDps(ac, ctx).part!.dps).toBeCloseTo(((2 * 572) / 1.4) * (12 / 23), 6)
  })
  it("a summon whose lifetime is missing is not counted, and says what it would do while alive", () => {
    const sw = heroById('alric')!.skills.find((s) => s.id === 'sand-warriors')!
    const r = skillDps(sw, ctx)
    expect(r.part).toBeNull(); expect(r.why).toMatch(/lifetime/)
    expect(r.why).toMatch(/3 × 956 per hit ÷ 1\.2 s = 2,390 DPS/)
  })
  it('opponent-only skills never appear as missing', () => {
    expect(heroDps(heroById('king-malik')!, m).notes.join()).not.toMatch(/Thunder/)
  })
  it('skills without a cooldown say why (they may trigger by chance)', () => {
    const r = skillDps(T('twilight-longbow').skills.find((s) => s.id === 'support-blades')!, ctx)
    expect(r.part).toBeNull()
  })
})

describe('heroes and spells', () => {
  it('hero = attack + all skills that have numbers', () => {
    const h = heroById('alric')!, r = heroDps(h, m)
    expect(r.parts[0].dps).toBeCloseTo(((h.dmgMin + h.dmgMax) / 2) / h.interval, 6)
    const flurry = r.parts.find((p) => p.label === 'Spiked Flurry')!
    expect(flurry.dps).toBeCloseTo((3 * 2868) / 9, 6) // 3 strikes of 2,677–3,059 every 9 s
    expect(heroDps(h, m, false).parts.find((p) => p.label === 'Spiked Flurry')!.dps).toBeCloseTo(2868 / 9, 6)
  })
  it('a hero missing numbers gives null', () => { expect(heroDps(heroById('ashbite')!, m).dps).toBeNull() })
  it('strike spells multiply by their hits when damage is per hit', () => {
    const rain = spellById('rain-of-fire')!, avgHit = (rain.dmgMin + rain.dmgMax) / 2
    expect(spellDps(rain, m).dps).toBeCloseTo((avgHit * 3) / 58, 6)
    expect(spellDps(rain, m, [], false).dps).toBeCloseTo(avgHit / 58, 6)
  })
  it('zone and summon spells', () => {
    const vines = spellById('cursed-vines')!
    expect(spellDps(vines, m).dps).toBeCloseTo(vines.dpsAvg * Math.min(1, vines.duration / vines.cooldown), 6)
    // Reinforcements: 2 units × 306–367, 1 s, alive 15 of every 22 s
    expect(spellDps(spellById('reinforcements')!, m).dps).toBeCloseTo(((2 * 336.5) / 1) * (15 / 22), 6)
  })
  it("Royal Edict adds a share of the best towers' DPS", () => {
    expect(spellDps(spellById('royal-edict')!, m, [1000, 500, 100, 50, 10]).dps).toBeCloseTo((1000 + 500 + 100 + 50) * 0.38 * (12 / 37), 6)
  })
  it('Wrath of Blackburn (a summon spell): 1 unit of 2,019–2,355 every 1.9 s, alive 13 of every 21 s', () => {
    expect(spellDps(spellById('wrath-of-blackburn')!, m).dps).toBeCloseTo((2187 / 1.9) * (13 / 21), 6)
  })
  it('utility spells have no DPS', () => { expect(spellDps(spellById('polymorph')!, m).dps).toBeNull() })
})

describe('facts read from the game videos', () => {
  it('Archery Scouts is a barracks tower with 2 soldiers, so its DPS counts both', () => {
    const sc = T('archery-scouts'), t3 = sc.tiers[3]!
    expect(sc.kind).toBe('barracks'); expect(t3.units).toBe(2)
    expect([1, 2, 3].map((t) => sc.tiers[t as 1 | 2 | 3]!.cost)).toEqual([70, 160, 270])
    const soldiers = towerDps(sc, 3, ['critical-hit', 'fire-shots', 'target-practice'], m).parts[0]
    expect(soldiers.dps).toBeCloseTo((2 * ((t3.dmgMin + t3.dmgMax) / 2)) / t3.interval, 6)
    expect(soldiers.detail).toMatch(/^2 soldiers ×/)
  })
  it("Fire Shots now has its 6 s duration, so it counts (always on: applied by every attack)", () => {
    const fs = T('archery-scouts').skills.find((s) => s.id === 'fire-shots')!
    expect(fs.calc).toEqual({ type: 'dot', dps: 146, duration: 6, cooldown: undefined })
    expect(skillDps(fs, ctx).part!.dps).toBe(146)
  })
  it('Denas Bastion has a complete level 3 now and is flagged as read at card level 10', () => {
    const d = T('denas-bastion')
    expect(d.selectable, d.issues.join('; ')).toBe(true)
    expect(d.dataLevel).toBe(10)
    expect(d.tiers[3]).toMatchObject({ dmgMin: 658, dmgMax: 774, units: 3, interval: 1.2, unitHp: 4248, cost: 290 })
    expect(towerDps(d, 3, [], m).parts[0].dps).toBeCloseTo((3 * 716) / 1.2, 6)
  })
  it("Wrath of Blackburn's soul hits for 2,019–2,355 every 1.9 s (card level 9 in the video)", () => {
    expect(spellById('wrath-of-blackburn')!.summon).toEqual({ units: 1, dmgAvg: 2187, interval: 1.9, duration: 13 })
  })
  it('Polymorph lasts 6 s over 80 units, but is still a utility spell with no DPS', () => {
    const p = spellById('polymorph')!
    expect(p.duration).toBe(6); expect(p.aoe).toBe(80); expect(spellDps(p, m).dps).toBeNull()
  })
})

describe('whole deck', () => {
  const base = () => ({ hero: heroById('alric')!, spells: [spellById('ultimate-strike')!, spellById('thunderbolt')!, null], towers: [T('royal-archers'), T('twilight-longbow'), null, null], tier: 3 as const, skillsOff: {}, perks: false, perHit: true })
  it('total is the sum of the cards, per-minute is ×60, empty slots count as nothing', () => {
    const r = deckDps(base(), 255449)
    const cards = [r.hero, ...r.spells, ...r.towers].reduce((a, c) => a + (c?.dps ?? 0), 0)
    expect(r.total).toBeCloseTo(cards, 6); expect(r.perMin).toBeCloseTo(r.total * 60, 6); expect(r.idealKill).toBeCloseTo(255449 / r.total, 6)
  })
  it('a tower can have its own level, and the deck total follows', () => {
    const d = { ...base(), towers: [T('genies-domains'), T('witches-coven'), null, null] } // both have a known cost at every level
    const all3 = deckDps(d, 1), one1 = deckDps({ ...d, tiers: { 'genies-domains': 1 } }, 1)
    expect(one1.towers[0]!.dps!).toBeLessThan(all3.towers[0]!.dps!)
    expect(one1.towers[1]!.dps).toBeCloseTo(all3.towers[1]!.dps!, 6)
    expect(one1.gold).toBeLessThan(all3.gold)
  })
  it('switching a skill off removes its DPS and its gold', () => {
    const d = { ...base(), towers: [T('genies-domains'), null, null, null] }
    const on = deckDps(d, 1), off = deckDps({ ...d, skillsOff: { 'genies-domains': ['wish-of-embers'] } }, 1)
    expect(on.total - off.total).toBeCloseTo(269.5, 6)
    expect(on.gold - off.gold).toBe(150)
  })
  it('gold = tower level costs + the cost of the skills that are counted', () => {
    const d = { ...base(), hero: null, spells: [null, null, null], towers: [T('genies-domains'), null, null, null] }
    expect(deckDps(d, 1).gold).toBe(300 + 150)
  })
  it('an empty deck is zero with no kill time', () => {
    const r = deckDps({ hero: null, spells: [null, null, null], towers: [null, null, null, null], tier: 3, skillsOff: {}, perks: true, perHit: true }, 255449)
    expect(r.total).toBe(0); expect(r.idealKill).toBeNull(); expect(r.gold).toBe(0)
  })
  it('perks change the numbers only when switched on', () => {
    const d = { hero: null, spells: [spellById('rain-of-fire')!, null, null], towers: [T('dwarven-artillery'), null, null, null], tier: 3 as const, skillsOff: {}, perHit: true }
    const on = deckDps({ ...d, perks: true }, 1), off = deckDps({ ...d, perks: false }, 1)
    expect(on.towers[0]!.parts[0].dps / off.towers[0]!.parts[0].dps).toBeCloseTo(1.03, 6)
  })
  it('the per-hit switch changes multi-hit spells and skills in the deck total', () => {
    const d = { ...base(), perks: false }
    expect(deckDps({ ...d, perHit: true }, 1).total).toBeGreaterThan(deckDps({ ...d, perHit: false }, 1).total)
  })
})
