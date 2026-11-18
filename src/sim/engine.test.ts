import { describe, expect, it } from 'vitest'
import { simulate } from './engine'
import { BOSS, HEROES, MAP, TOWERS } from '../data/placeholder'
import type { Deck, Layout } from './types'

const deck = (towers: string[]): Deck => ({
  hero: { ...HEROES[0], ability: undefined }, spells: [], towers: TOWERS.filter((t) => towers.includes(t.id)),
})
const empty: Layout = { spots: {}, rally: {}, heroS: 5000 }

describe('simulate', () => {
  it('boss walks to the end with no defense', () => {
    const r = simulate(MAP, BOSS, deck([]), empty)
    expect(r.reachedEnd).toBe(true)
    expect(r.killTime).toBeNull()
  })
  it('a lone stationary tank-less boss takes expected archer damage', () => {
    const weak = { ...BOSS, hp: 1e9, armor: 0, speed: 0 }
    const layout: Layout = { spots: { A: 'archer' }, rally: {}, heroS: 5000 }
    const r = simulate(MAP, weak, deck(['archer']), layout)
    // boss stays at s=0 (20,380): spot A (150,320) dist ~143 > range 130 -> no damage
    expect(r.damageBy['Archer Tower'] ?? 0).toBe(0)
    const near = { ...weak, speed: 0 }
    const layout2: Layout = { spots: { A: 'archer' }, rally: {}, heroS: 5000 }
    const moved = simulate({ ...MAP, path: [{ x: 150, y: 380 }, { x: 780, y: 380 }] }, near, deck(['archer']), layout2)
    // 180s / 0.6s cooldown ~= 300 shots * 90 dmg
    expect(moved.damageBy['Archer Tower']).toBeGreaterThan(26000)
    expect(moved.damageBy['Archer Tower']).toBeLessThan(27500)
  })
  it('barracks block the boss and delay it', () => {
    const layout: Layout = { spots: { A: 'barracks' }, rally: { A: 200 }, heroS: 5000 }
    const withB = simulate(MAP, { ...BOSS, hp: 1e9 }, deck(['barracks']), layout)
    const without = simulate(MAP, { ...BOSS, hp: 1e9 }, deck([]), empty)
    expect(withB.endTime).toBeGreaterThan(without.endTime)
  })
})
