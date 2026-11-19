import { describe, expect, it } from 'vitest'
import { simulate, buildSpawns, type Build, type SimInput } from './engine'
import { LIBRARY, heroById, spellById, towerById } from './library'
import { collectMods, emptyMods } from './perks'
import { CREEP_SETS, MAP_KW, BOSS_KW, BOSS_ENTERS_SEC, TILE } from '../data/kingdomwars'
import { bestCoverage, classOfSource, classOfTower, classOfHero, clampRally, routeCoverage, MAP } from '../ui/state'
import { RALLY_RANGE } from './engine'
import type { BossDef, CreepSpawn, MapDef } from './types'

// A straight test map: route runs along y=0, one spot 100 units above the middle.
const line = (id: string) => ({ id, name: id, color: '#fff', tiles: 25, verified: true, points: [{ x: 0, y: 0 }, { x: 2000, y: 0 }] })
const TEST_MAP: MapDef = {
  id: 't', name: 't', width: 2000, height: 300, path: line('r1').points, bossRouteId: 'r1',
  routes: [line('r1'), line('r2'), line('r3'), line('fly')], spots: [{ id: '1', x: 1000, y: 100 }, { id: '2', x: 1000, y: -100 }],
}
// spot right next to where a stationary boss stands (route start)
const NEAR_MAP: MapDef = { ...TEST_MAP, spots: [{ id: '1', x: 0, y: 100 }, { id: '2', x: 0, y: -100 }] }
const still: BossDef = { name: 'Boss', hp: 1e9, armor: 0, magicResist: 0, speed: 0, damage: 5000, attackInterval: 1.5 }
const empty: Build = { hero: null, heroPos: { x: 0, y: 0 }, spells: [], placements: [] }
const base = (over: Partial<SimInput>): SimInput => ({ map: TEST_MAP, boss: still, bossEnters: 0, creeps: [], build: empty, mods: emptyMods(), ...over })
const creep = (over: Partial<CreepSpawn>): CreepSpawn => ({ name: 'c', count: 1, firstSec: 0, hp: 1000, flying: false, route: 'ground', speed: 0, damage: 1, interval: 1, ...over })

describe('library adapter', () => {
  it('only marks cards selectable when the data is complete', () => {
    const sel = LIBRARY.towers.filter((t) => t.selectable).map((t) => t.id)
    expect(sel).toContain('royal-archers')
    expect(sel).not.toContain('archer-tower') // tier 2/3 damage missing in library
    for (const t of LIBRARY.towers.filter((x) => x.selectable)) expect(t.tiers[3]).toBeDefined()
  })
  it('applies the anti-air and targeting rules', () => {
    expect(towerById('dwarven-artillery')!.hitsAir).toBe(false)
    expect(towerById('tesla-x104')!.hitsAir).toBe(true) // the user's exception
    expect(towerById('royal-archers')!.hitsAir).toBe(true)
    expect(towerById('twilight-longbow')!.targetsHighestHp).toBe(true)
  })
  it('files Wrath of Blackburn as a spell and fills Gerald\'s respawn from the game', () => {
    expect(heroById('wrath-of-blackburn')).toBeUndefined()
    const w = spellById('wrath-of-blackburn')!
    expect(w.kind).toBe('summon') // a summon spell, with its numbers read from its one skill
    expect(w.summon).toEqual({ units: 1, dmgAvg: 2187, interval: 1.9, duration: 13 })
    const g = heroById('gerald-lightseeker')!
    expect(g.respawn).toBe(15)
    expect(g.respawnAssumed).toBe(false)
  })
  it('fills perk values by name (Mana Wrath = +3% spell damage)', () => {
    const p = towerById('arcane-wizard')!.perks.find((x) => x.name === 'Mana Wrath')!
    expect(p.pct).toBe(3)
  })
})

describe('creep schedule', () => {
  it('matches krb-deck checkpoints for set A within a couple of creeps', () => {
    const sp = buildSpawns(CREEP_SETS.A)
    const by = (t: number) => sp.filter((s) => s.t <= t).length
    expect(Math.abs(by(22) - 15)).toBeLessThanOrEqual(2)
    expect(Math.abs(by(66) - 51)).toBeLessThanOrEqual(3)
  })
})

describe('simulate', () => {
  const archers = towerById('royal-archers')!
  const t3 = archers.tiers[3]!

  it('undefended boss crosses the line ~35 s after it enters', () => {
    const r = simulate({ ...base({ map: MAP_KW, boss: BOSS_KW, bossEnters: BOSS_ENTERS_SEC }) })
    expect(r.killTime).toBeNull()
    expect(r.crossedAt).toBeGreaterThan(BOSS_ENTERS_SEC + 34)
    expect(r.crossedAt).toBeLessThan(BOSS_ENTERS_SEC + 36)
    expect(35 * TILE).toBe(2800)
  })

  it('a lone tower deals dmg/interval to a stationary boss', () => {
    const build: Build = { ...empty, placements: [{ spotId: '1', tower: archers, tier: 3, skills: [] }] }
    const r = simulate(base({ map: NEAR_MAP, build }))
    const expected = (180 / t3.interval) * ((t3.dmgMin + t3.dmgMax) / 2)
    const got = r.bossDamageBy['Royal Archers (spot 1)']
    expect(got).toBeGreaterThan(expected * 0.99)
    expect(got).toBeLessThan(expected * 1.01)
  })

  it('deck perks scale damage', () => {
    const build: Build = { ...empty, placements: [{ spotId: '1', tower: archers, tier: 3, skills: [] }] }
    const mods = emptyMods(); mods.towerDamage.all = 10
    const a = simulate(base({ map: NEAR_MAP, build })).bossDamageBy['Royal Archers (spot 1)']
    const b = simulate(base({ map: NEAR_MAP, build, mods })).bossDamageBy['Royal Archers (spot 1)']
    expect(b / a).toBeCloseTo(1.1, 2)
  })

  it('towers shoot the creep closest to the exit, not the boss', () => {
    // a slow, very tanky creep walks ahead of the boss; the boss enters 5 s later and stands still behind it
    const build: Build = { ...empty, placements: [{ spotId: '1', tower: archers, tier: 3, skills: [] }] }
    const tank = creep({ hp: 1e9, speed: 1 }) // stays inside the tower's range for the whole fight
    const r = simulate(base({ map: NEAR_MAP, creeps: [tank], build, bossEnters: 5 }))
    expect(r.bossDamageBy['Royal Archers (spot 1)'] ?? 0).toBe(0)
  })

  it('Twilight Longbow prefers the highest-HP enemy (the boss)', () => {
    const lb = towerById('twilight-longbow')!
    expect(lb.selectable, lb.issues.join('; ')).toBe(true)
    const nearMap = NEAR_MAP
    const build: Build = { ...empty, placements: [{ spotId: '1', tower: lb, tier: 3, skills: [] }] }
    // same tanky creep ahead of the boss as above, but the Longbow ignores it and shoots the boss (higher max HP)
    const r = simulate(base({ map: nearMap, creeps: [creep({ hp: 1e8, speed: 1 })], build, bossEnters: 5 }))
    expect(r.bossDamageBy['Twilight Longbow (spot 1)'] ?? 0).toBeGreaterThan(0)
  })

  it('artillery cannot hit flying enemies; archers can', () => {
    const art = towerById('dwarven-artillery')!
    const nearMap = NEAR_MAP
    const fly = creep({ hp: 1000, flying: true, route: 'fly', count: 1 })
    const far: BossDef = { ...still, hp: 1e9 }
    const runWith = (tower: typeof art) => simulate(base({ map: nearMap, boss: far, bossEnters: 500, creeps: [fly], build: { ...empty, placements: [{ spotId: '1', tower, tier: 3, skills: [] }] } }))
    expect(art.selectable).toBe(true)
    expect(runWith(art).creepsKilled).toBe(0)
    expect(runWith(archers).creepsKilled).toBe(1)
  })

  it('barracks units block the boss and delay it', () => {
    const rax = LIBRARY.towers.find((t) => t.kind === 'barracks' && t.selectable)
    expect(rax).toBeDefined()
    const moving: BossDef = { ...still, speed: 80, hp: 1e9 }
    const none = simulate(base({ boss: moving }))
    const build: Build = { ...empty, placements: [{ spotId: '1', tower: rax!, tier: 3, skills: [], rally: { x: 1000, y: 0 } }] }
    const withRax = simulate(base({ boss: moving, build }))
    expect(withRax.crossedAt!).toBeGreaterThan(none.crossedAt! + 1)
  })

  it('spells fire on cooldown once the boss is on the field', () => {
    const rain = spellById('rain-of-fire')!
    expect(rain.selectable).toBe(true)
    const r = simulate(base({ bossEnters: 10, build: { ...empty, spells: [rain] } }))
    const per = ((rain.dmgMin + rain.dmgMax) / 2) * rain.hits
    // casts at 10, 68, 126 within 180 s (cooldown restarts from the late first cast)
    expect(r.bossDamageBy['Rain of Fire']).toBeCloseTo(per * 3, 0)
  })

  it('Royal Edict buffs tower damage and range and is credited with the extra', () => {
    const edict = spellById('royal-edict')!
    expect(edict.selectable, edict.issues.join('; ')).toBe(true)
    const placements = [{ spotId: '1', tower: archers, tier: 3 as const, skills: [] as string[] }]
    const without = simulate(base({ map: NEAR_MAP, build: { ...empty, placements } }))
    const withEdict = simulate(base({ map: NEAR_MAP, build: { ...empty, placements, spells: [edict] } }))
    const sum = (r: typeof without) => Object.values(r.bossDamageBy).reduce((a, b) => a + b, 0)
    expect(sum(withEdict)).toBeGreaterThan(sum(without) * 1.1)
    expect(withEdict.bossDamageBy['Royal Edict']).toBeGreaterThan(0)
    // only the buff adds damage: tower's own share stays the same
    expect(withEdict.bossDamageBy['Royal Archers (spot 1)']).toBeCloseTo(without.bossDamageBy['Royal Archers (spot 1)'], -2)
  })

  it('a hero with an area skill damages the boss', () => {
    const h = heroById('king-malik')!
    expect(h.selectable).toBe(true)
    const build: Build = { ...empty, hero: h, heroPos: { x: 100, y: 0 } }
    const r = simulate(base({ build, mods: collectMods([h.perks]) }))
    const heroDmg = Object.entries(r.bossDamageBy).filter(([k]) => k.startsWith('King Malik')).reduce((a, [, v]) => a + v, 0)
    expect(heroDmg).toBeGreaterThan(0)
  })
})

describe('damage classes and coverage (UI helpers)', () => {
  it('maps cards to sword / arrow / blast / dynamite', () => {
    expect(classOfTower(towerById('royal-archers')!)).toBe('ranged')
    expect(classOfTower(towerById('mage-tower')!)).toBe('magic')
    expect(classOfTower(towerById('dwarven-artillery')!)).toBe('artillery')
    expect(classOfTower(towerById('tesla-x104')!)).toBe('artillery')
    expect(classOfTower(towerById('rocket-gunners')!)).toBe('ranged') // barracks whose units shoot
    expect(classOfTower(towerById('crimson-manor')!)).toBe('melee')    // barracks with melee units
    expect(classOfHero(heroById('king-malik')!)).toBe('melee')
    expect(classOfHero(heroById('vesper')!)).toBe('ranged')
  })
  it('finds the class of a damage-source label', () => {
    const by = { 'Royal Archers': 'ranged', Alric: 'melee' } as const
    expect(classOfSource('Royal Archers (spot 7)', by)).toBe('ranged')
    expect(classOfSource('Alric · Spiked Flurry', by)).toBe('melee')
    expect(classOfSource('Nobody', by)).toBeNull()
  })
  it('coverage is a share of the route and the best spot is at least as good as any other', () => {
    const best = bestCoverage(160)
    expect(best.frac).toBeGreaterThan(0)
    expect(best.frac).toBeLessThanOrEqual(1)
    for (const sp of MAP.spots) expect(routeCoverage(sp, 160)).toBeLessThanOrEqual(best.frac + 1e-9)
    expect(routeCoverage(MAP.spots[0], 100000)).toBe(1)
  })
  it('rally points are clamped to the ring around their tower', () => {
    const sp = MAP.spots[0]
    const far = clampRally(sp, { x: sp.x + 5000, y: sp.y })
    expect(Math.hypot(far.x - sp.x, far.y - sp.y)).toBeCloseTo(RALLY_RANGE, 5)
    const near = { x: sp.x + 10, y: sp.y }
    expect(clampRally(sp, near)).toEqual(near)
  })
})
