import { describe, expect, it } from 'vitest'
import { deckDps, heroDps, skillDps, spellDps, towerDps } from './dps'
import { emptyMods } from './perks'
import { heroById, spellById, towerById } from './library'

const m = emptyMods()
const T = (id: string) => towerById(id)!

describe('pure DPS = damage per hit ÷ attack time', () => {
  it('a shooter tower: Royal Archers level 3', () => {
    const t3 = T('royal-archers').tiers[3]!
    const r = towerDps(T('royal-archers'), 3, [], m)
    expect(r.dps).toBeCloseTo(((t3.dmgMin + t3.dmgMax) / 2) / t3.interval, 6)
    expect(r.parts).toHaveLength(1)
  })
  it('level changes the number', () => {
    const a = towerDps(T('royal-archers'), 1, [], m).dps!, b = towerDps(T('royal-archers'), 3, [], m).dps!
    expect(b).toBeGreaterThan(a)
  })
  it('a barracks counts every soldier', () => {
    const t3 = T('rocket-gunners').tiers[3]!
    expect(towerDps(T('rocket-gunners'), 3, [], m).dps).toBeCloseTo((t3.units! * (t3.dmgMin + t3.dmgMax) / 2) / t3.interval, 6)
  })
  it('a level with no library damage gives null, not zero', () => {
    const r = towerDps(T('archer-tower'), 3, [], m)
    expect(r.dps).toBeNull()
    expect(r.notes.join()).toMatch(/level 3/)
  })
  it('skills only count at level 3 and only when bought; the number is damage per cast ÷ cooldown', () => {
    const t = towerById('tesla-x104')!
    const sk = t.skills.find((s) => s.supported)
    if (!sk) return // nothing simulatable on Tesla in this library snapshot
    const base = towerDps(t, 3, [], m).dps!
    const withSkill = towerDps(t, 3, [sk.id], m).dps!
    expect(withSkill).toBeGreaterThan(base)
    expect(towerDps(t, 2, [sk.id], m).dps).toBeCloseTo(towerDps(t, 2, [], m).dps!, 6)
  })
  it('skillDps: periodic and dot formulas', () => {
    const periodic = skillDps({ id: 'p', name: 'P', kind: 'periodic', supported: true, cost: null, cooldown: 10, dmgAvg: 1000 })
    expect(periodic.part!.dps).toBe(100)
    const dot = skillDps({ id: 'd', name: 'D', kind: 'dot', supported: true, cost: null, cooldown: 20, dps: 300, duration: 5 })
    expect(dot.part!.dps).toBe(75) // 300 dps for 5 of every 20 seconds
    const always = skillDps({ id: 'a', name: 'A', kind: 'dot', supported: true, cost: null, dps: 200, duration: 3 })
    expect(always.part!.dps).toBe(200)
    expect(skillDps({ id: 'x', name: 'X', kind: 'other', supported: false, why: 'summon not simulated yet', cost: null }).part).toBeNull()
  })
})

describe('heroes and spells', () => {
  it('hero attack + supported skills', () => {
    const h = heroById('king-malik')!
    const r = heroDps(h, m)
    expect(r.parts[0].dps).toBeCloseTo(((h.dmgMin + h.dmgMax) / 2) / h.interval, 6)
    expect(r.dps).toBeGreaterThan(r.parts[0].dps - 1e-9)
    // opponent-only skills (The Thunder) are not mentioned as missing
    expect(r.notes.join()).not.toMatch(/Thunder/)
  })
  it('a hero missing numbers gives null', () => { expect(heroDps(heroById('ashbite')!, m).dps).toBeNull() })
  it('strike and zone spells', () => {
    const rain = spellById('rain-of-fire')!
    expect(spellDps(rain, m).dps).toBeCloseTo((((rain.dmgMin + rain.dmgMax) / 2) * rain.hits) / rain.cooldown, 6)
    const vines = spellById('cursed-vines')!
    expect(spellDps(vines, m).dps).toBeCloseTo(vines.dpsAvg * Math.min(1, vines.duration / vines.cooldown), 6)
  })
  it('Royal Edict adds a share of the best towers\' DPS', () => {
    const e = spellById('royal-edict')!
    const d = spellDps(e, m, [1000, 500, 100, 50, 10]).dps!
    expect(d).toBeCloseTo((1000 + 500 + 100 + 50) * 0.38 * (12 / 37), 6)
  })
  it('utility spells have no DPS', () => { expect(spellDps(spellById('polymorph')!, m).dps).toBeNull() })
})

describe('whole deck', () => {
  const deck = (over = {}) => ({ hero: heroById('alric')!, spells: [spellById('ultimate-strike')!, spellById('thunderbolt')!, null], towers: [T('royal-archers'), T('twilight-longbow'), null, null], tier: 3 as const, skills: {}, perks: false, ...over })
  it('total is the sum of the cards, per-minute is ×60, empty slots count as nothing', () => {
    const r = deckDps(deck(), 255449)
    const cards = [r.hero, ...r.spells, ...r.towers].reduce((a, c) => a + (c?.dps ?? 0), 0)
    expect(r.total).toBeCloseTo(cards, 6)
    expect(r.perMin).toBeCloseTo(r.total * 60, 6)
    expect(r.idealKill).toBeCloseTo(255449 / r.total, 6)
    expect(r.spells[2]).toBeNull()
  })
  it('gold adds the level cost of each tower', () => {
    const r = deckDps(deck(), 255449)
    expect(r.gold).toBe(T('royal-archers').tiers[3]!.cost! + (T('twilight-longbow').tiers[3]!.cost ?? 0))
  })
  it('an empty deck is zero with no kill time', () => {
    const r = deckDps({ hero: null, spells: [null, null, null], towers: [null, null, null, null], tier: 3, skills: {}, perks: true }, 255449)
    expect(r.total).toBe(0); expect(r.idealKill).toBeNull(); expect(r.gold).toBe(0)
  })
  it('perks change the numbers only when switched on', () => {
    // Rain of Fire carries "Cannon Force: +3% damage to artillery towers"
    const d = { hero: null, spells: [spellById('rain-of-fire')!, null, null], towers: [T('dwarven-artillery'), null, null, null], tier: 3 as const, skills: {} }
    const on = deckDps({ ...d, perks: true }, 255449), off = deckDps({ ...d, perks: false }, 255449)
    expect(on.towers[0]!.dps! / off.towers[0]!.dps!).toBeCloseTo(1.03, 6)
    expect(on.spells[0]!.dps).toBeCloseTo(off.spells[0]!.dps!, 6) // the spell itself is unchanged
  })
})
