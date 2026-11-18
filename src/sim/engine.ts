import { effective } from './damage'
import { dist, pointAt, buildPath } from './geometry'
import { BLOCK_RADIUS } from './explorer'
import {
  FIGHT_SECONDS, type BossDef, type Deck, type Layout, type MapDef, type SimResult,
} from './types'

const DT = 0.1
const EPS = 1e-6 // float tolerance so cooldowns that are multiples of DT fire on time

interface Fighter {
  name: string
  s: number // path distance where it stands
  hp: number
  maxHp: number
  damage: number
  dmgType: 'physical' | 'magic' | 'true'
  interval: number
  nextAttack: number
  respawn: number
  deadUntil: number // <=0 alive
}

/**
 * Deterministic expected-value simulation of one boss fight.
 * Assumptions (flagged, will be replaced with real rules):
 *  - shooters hit the boss whenever it is in range (creep distraction not modeled yet)
 *  - spells are cast on cooldown at the boss' current position (perfect aim)
 *  - boss stops while any living fighter is within BLOCK_RADIUS, attacks the nearest
 *  - stun freezes boss movement and attacks
 */
export function simulate(map: MapDef, boss: BossDef, deck: Deck, layout: Layout): SimResult {
  const path = buildPath(map.path)
  const damageBy: Record<string, number> = {}
  const add = (k: string, v: number) => { damageBy[k] = (damageBy[k] ?? 0) + v }

  const fighters: Fighter[] = []
  const nextShot: Record<string, number> = {}
  for (const spot of map.spots) {
    const card = deck.towers.find((t) => t.id === layout.spots[spot.id])
    if (!card) continue
    if (card.kind === 'barracks') {
      const s = layout.rally[spot.id] ?? 0
      for (let i = 0; i < card.units; i++) {
        fighters.push({
          name: card.name, s, hp: card.unitHp, maxHp: card.unitHp, damage: card.unitDamage,
          dmgType: card.unitDmgType, interval: card.unitAttackInterval, nextAttack: 0,
          respawn: card.respawn, deadUntil: 0,
        })
      }
    } else {
      nextShot[spot.id] = 0
    }
  }
  const h = deck.hero
  fighters.push({
    name: h.name, s: layout.heroS, hp: h.hp, maxHp: h.hp, damage: h.damage, dmgType: h.dmgType,
    interval: h.attackInterval, nextAttack: 0, respawn: h.respawn, deadUntil: 0,
  })

  const spellNext = deck.spells.map((sp) => sp.firstCast)
  let heroAbilityNext = 0
  let bossS = 0, bossHp = boss.hp, stunUntil = 0, bossNextAttack = 0
  const timeline: SimResult['timeline'] = []
  let t = 0

  const hit = (src: string, amount: number, type: 'physical' | 'magic' | 'true') => {
    const d = Math.min(bossHp, effective(boss, amount, type))
    bossHp -= d
    add(src, d)
  }

  for (let tick = 0; (t = tick * DT) < FIGHT_SECONDS && bossHp > 0; tick++) {
    const bp = pointAt(path, bossS)

    // spells
    deck.spells.forEach((sp, i) => {
      if (t + EPS >= spellNext[i]) {
        spellNext[i] = Math.max(spellNext[i] + sp.cooldown, t)
        hit(sp.name, sp.damage, sp.dmgType)
        if (sp.stun > 0) stunUntil = Math.max(stunUntil, t + sp.stun)
      }
    })
    // hero ability
    if (h.ability && t + EPS >= heroAbilityNext) {
      const hero = fighters[fighters.length - 1]
      if (hero.deadUntil <= 0 && dist(pointAt(path, hero.s), bp) <= h.ability.radius) {
        heroAbilityNext = Math.max(heroAbilityNext + h.ability.cooldown, t)
        hit(h.name + ' ability', h.ability.damage, h.ability.dmgType)
        if (h.ability.stun > 0) stunUntil = Math.max(stunUntil, t + h.ability.stun)
      }
    }
    // shooters
    for (const spot of map.spots) {
      const card = deck.towers.find((c) => c.id === layout.spots[spot.id])
      if (!card || card.kind !== 'shooter') continue
      if (dist(bp, spot) <= card.range && t + EPS >= nextShot[spot.id]) {
        nextShot[spot.id] = Math.max(nextShot[spot.id] + card.cooldown, t)
        hit(card.name, card.damage, card.dmgType)
      }
    }
    // revive
    for (const f of fighters) {
      if (f.deadUntil > 0 && t + EPS >= f.deadUntil) { f.deadUntil = 0; f.hp = f.maxHp }
    }
    // blockers
    const stunned = t < stunUntil
    const engaged = fighters
      .filter((f) => f.deadUntil <= 0 && Math.abs(f.s - bossS) <= BLOCK_RADIUS)
      .sort((a, b) => Math.abs(a.s - bossS) - Math.abs(b.s - bossS))
    for (const f of engaged) {
      if (t + EPS >= f.nextAttack) {
        f.nextAttack = Math.max(f.nextAttack + f.interval, t)
        hit(f.name, f.damage, f.dmgType)
      }
    }
    if (!stunned) {
      if (engaged.length > 0) {
        if (t + EPS >= bossNextAttack) {
          bossNextAttack = Math.max(bossNextAttack + boss.attackInterval, t)
          const target = engaged[0]
          target.hp -= boss.damage
          if (target.hp <= 0) target.deadUntil = t + target.respawn
        }
      } else {
        bossS += boss.speed * DT
      }
    }
    if (Math.abs(t - Math.round(t)) < DT / 2) timeline.push({ t: Math.round(t), s: bossS, hp: bossHp })
    if (bossS >= path.length) {
      return { killTime: null, reachedEnd: true, endTime: t, bossHpLeft: bossHp, damageBy, timeline }
    }
  }
  const killed = bossHp <= 0
  return {
    killTime: killed ? t - DT : null, reachedEnd: false, endTime: t,
    bossHpLeft: Math.max(0, bossHp), damageBy, timeline,
  }
}
