// Deterministic, expected-value, tick-based simulation of one Kingdom Wars boss fight.
//
// Rules we implement (project rules from the user, then clearly-marked assumptions):
//  * towers target the enemy closest to the exit; Twilight Longbow targets the highest max-HP enemy
//  * artillery can't hit flying (Tesla can); everything ranged can
//  * a barracks unit / hero blocks ONE ground enemy at a time (ASSUMED capacity); flying enemies are never blocked
//  * boss and creeps stop while blocked and fight their blocker; the boss one-shots most blockers
//  * spells are cast on cooldown at the boss (perfect aim) once it is on the field
//  * damage uses the average of min/max; no crits, no armor (boss armor/resist unknown -> 0)
import { buildPath, dist, pointAt, type PathInfo } from './geometry'
import type { HeroDef, SkillDef, SpellDef, Tier, TierDef, TowerDef } from './library'
import type { Mods } from './perks'
import { FIGHT_SECONDS, type BossDef, type CreepSpawn, type MapDef, type Pt, type SimResult } from './types'

export const DT = 0.1
const EPS = 1e-6
export const BLOCK_RADIUS = 30 // a fighter this close to an enemy can block it
export const SPAWN_UNTIL = 215 // creeps of a type spawn evenly from first appearance until here (fit to krb-deck: 14/15 @0:22, 51/51 @1:06)
export const RALLY_RANGE = 160 // how far from its tower a barracks rally point may be (ASSUMED)
export const UNIT_RESPAWN = 10 // barracks unit respawn (ASSUMED; not in library)
export const HERO_REACH = 200 // hero skills fire when the boss is this close (ASSUMED)
export const HERO_RANGED_RANGE = 140 // ranged hero attack range (ASSUMED)

export interface Placement { spotId: string; tower: TowerDef; tier: Tier; skills: string[]; rally?: Pt }
export interface Build { hero: HeroDef | null; heroPos: Pt; spells: SpellDef[]; placements: Placement[] }
export interface SimInput { map: MapDef; boss: BossDef; bossEnters: number; creeps: CreepSpawn[]; build: Build; mods: Mods }

interface Route { id: string; info: PathInfo }
interface Enemy {
  id: number; name: string; boss: boolean; route: Route; s: number; pos: Pt; hp: number; maxHp: number
  speed: number; flying: boolean; damage: number; interval: number; nextAttack: number
  engaged: Fighter | null; slowUntil: number; slowPct: number; stunUntil: number; alive: boolean
}
interface Fighter {
  name: string; pos: Pt; hp: number; maxHp: number; armor: number; dmg: number; interval: number
  nextAttack: number; respawn: number; deadUntil: number; range: number; engaged: Enemy | null
}
interface SkillRT { def: SkillDef; label: string; cd: number; dmg: number; next: number; dotUntil: number; dotTarget: Enemy | null }
interface TowerRT {
  label: string; pos: Pt; hitsAir: boolean; highestHp: boolean; range: number; dmg: number; interval: number
  aoe: number; next: number; skills: SkillRT[]
  buffUntil: number; buffDmg: number; buffRange: number; buffSrc: string // Royal Edict style buff
}
interface Zone { pos: Pt; r: number; until: number; dps: number; slow: number; label: string }

const mean = (a: number, b: number) => (a + b) / 2
/** Next ready time after firing at `t`: keep the cadence if we fired on schedule, restart the cooldown if we were idle. */
const advance = (next: number, iv: number, t: number) => (t - next > DT + EPS ? t + iv : next + iv)

/** % damage a tower gets from deck perks ("+4% damage to all towers", magic towers, artillery towers). It applies to the basic attack and to the tower's skills. */
export const towerDamagePct = (t: TowerDef, mods: Mods): number => mods.towerDamage.all + (t.cls === 'magic' ? mods.towerDamage.magic : 0) + (t.cls === 'artillery' ? mods.towerDamage.artillery : 0)

/** Shooter numbers after deck perks: damage per shot, seconds between shots, range. */
export function shooterStats(t: TowerDef, td: TierDef, mods: Mods): { dmg: number; interval: number; range: number } {
  const dmgPct = towerDamagePct(t, mods)
  const spdPct = t.cls === 'artillery' ? mods.towerSpeed.artillery : 0
  const rngPct = t.cls === 'magic' ? mods.towerRange.magic : 0
  return { dmg: mean(td.dmgMin, td.dmgMax) * (1 + dmgPct / 100), interval: td.interval / (1 + spdPct / 100), range: (td.range ?? 0) * (1 + rngPct / 100) }
}

function skillRT(def: SkillDef, label: string, cdPct: number, dmgPct: number): SkillRT {
  return {
    def, label, cd: (def.cooldown ?? 0) * Math.max(0.1, 1 + cdPct / 100), dmg: (def.dmgAvg ?? 0) * (1 + dmgPct / 100),
    next: 0, dotUntil: 0, dotTarget: null,
  }
}

export function buildSpawns(creeps: CreepSpawn[], until = SPAWN_UNTIL): { t: number; c: CreepSpawn }[] {
  const out: { t: number; c: CreepSpawn }[] = []
  for (const c of creeps) {
    const iv = c.count > 1 && until > c.firstSec ? (until - c.firstSec) / (c.count - 1) : 0
    for (let i = 0; i < c.count; i++) {
      const t = c.firstSec + i * iv
      if (t <= FIGHT_SECONDS) out.push({ t, c })
    }
  }
  return out.sort((a, b) => a.t - b.t || a.c.name.localeCompare(b.c.name))
}

export function simulate(inp: SimInput): SimResult {
  const { map, boss, build, mods } = inp
  const routes: Record<string, Route> = {}
  for (const r of map.routes) routes[r.id] = { id: r.id, info: buildPath(r.points) }
  const bossRoute = routes[map.bossRouteId]
  const notes: string[] = []
  const bossBy: Record<string, number> = {}

  // ---- towers & barracks units -------------------------------------------------
  const towers: TowerRT[] = []
  const fighters: Fighter[] = []
  for (const pl of build.placements) {
    const spot = map.spots.find((s) => s.id === pl.spotId)
    const td = pl.tower.tiers[pl.tier]
    if (!spot || !td) continue
    const t = pl.tower
    const label = `${t.name} (spot ${pl.spotId})`
    const skillsOn = t.skills.filter((s) => pl.skills.includes(s.id))
    for (const s of skillsOn) if (!s.supported) notes.push(`${t.name}: skill "${s.name}" is not simulated (${s.why})`)
    const cdPct = mods.skillCooldown.all + (t.cls === 'artillery' ? mods.skillCooldown.artillery : 0) + (t.cls === 'magic' ? mods.skillCooldown.magic : 0) + (t.kind === 'barracks' ? mods.skillCooldown.barracks : 0)
    const sdPct = towerDamagePct(t, mods) + (t.cls === 'magic' ? mods.skillDamage.magic : 0)
    const skills = skillsOn.filter((s) => s.supported).map((s) => skillRT(s, `${t.name} · ${s.name}`, cdPct, sdPct))
    if (t.kind === 'shooter') {
      const st = shooterStats(t, td, mods)
      towers.push({ label, pos: spot, hitsAir: t.hitsAir, highestHp: t.targetsHighestHp, range: st.range, dmg: st.dmg, interval: st.interval, aoe: td.aoe ?? 0, next: 0, skills, buffUntil: 0, buffDmg: 0, buffRange: 0, buffSrc: '' })
    } else {
      // barracks: units stand at the rally point (clamped into range of the tower)
      let rp = pl.rally ?? spot
      const d = dist(rp, spot)
      if (d > RALLY_RANGE) rp = { x: spot.x + ((rp.x - spot.x) * RALLY_RANGE) / d, y: spot.y + ((rp.y - spot.y) * RALLY_RANGE) / d }
      const ranged = (td.range ?? 0) > 0
      const dmgPct = mods.unitDamage.all + (ranged ? 0 : mods.unitDamage.melee)
      for (let i = 0; i < (td.units ?? 0); i++) {
        fighters.push({
          name: label, pos: rp, hp: (td.unitHp ?? 0) * (1 + mods.unitHp / 100), maxHp: (td.unitHp ?? 0) * (1 + mods.unitHp / 100),
          armor: (td.unitArmor ?? 0) / 100, dmg: mean(td.dmgMin, td.dmgMax) * (1 + dmgPct / 100),
          interval: td.interval / (1 + mods.towerSpeed.barracks / 100), nextAttack: 0, respawn: UNIT_RESPAWN,
          deadUntil: 0, range: ranged ? (td.range ?? 0) : 0, engaged: null,
        })
      }
      // barracks skills that are supported (rare) are handled as tower skills fired from the rally point
      if (skills.length) towers.push({ label, pos: rp, hitsAir: true, highestHp: false, range: 1, dmg: 0, interval: 1e9, aoe: 0, next: 1e9, skills, buffUntil: 0, buffDmg: 0, buffRange: 0, buffSrc: '' })
    }
  }

  // ---- hero ----------------------------------------------------------------------
  let hero: Fighter | null = null
  const heroSkills: SkillRT[] = []
  if (build.hero) {
    const h = build.hero
    const hp = h.hp * (1 + mods.heroHp / 100)
    const dmgPct = mods.heroDamage.all + (h.ranged ? mods.heroDamage.ranged : mods.heroDamage.melee) + mods.unitDamage.all + (h.ranged ? 0 : mods.unitDamage.melee)
    hero = {
      name: h.name, pos: build.heroPos, hp, maxHp: hp, armor: h.armor / 100, dmg: mean(h.dmgMin, h.dmgMax) * (1 + dmgPct / 100),
      interval: h.interval, nextAttack: 0, respawn: h.respawn * Math.max(0.1, 1 + mods.heroRespawn / 100), deadUntil: 0,
      range: h.ranged ? HERO_RANGED_RANGE : 0, engaged: null,
    }
    fighters.push(hero)
    for (const s of h.skills) {
      if (s.supported) heroSkills.push(skillRT(s, `${h.name} · ${s.name}`, 0, 0))
      else if (s.why && !s.why.startsWith('scope')) notes.push(`${h.name}: skill "${s.name}" is not simulated (${s.why})`)
    }
    if (h.respawnAssumed) notes.push(`${h.name}: respawn time missing in library, assumed ${h.respawn}s`)
  }

  // ---- spells --------------------------------------------------------------------
  const spellNext = build.spells.map(() => 0)
  const zones: Zone[] = []

  // ---- enemies -------------------------------------------------------------------
  const spawns = buildSpawns(inp.creeps)
  let spawnIdx = 0, rr = 0, nextId = 1, creepsSpawned = 0, creepsKilled = 0
  const enemies: Enemy[] = []
  let bossE: Enemy | null = null
  let killTime: number | null = null, crossedAt: number | null = null
  let bossDmgSecond = 0
  const timeline: SimResult['timeline'] = []

  const mkEnemy = (name: string, route: Route, hp: number, speed: number, flying: boolean, damage: number, interval: number, isBoss: boolean): Enemy => ({
    id: nextId++, name, boss: isBoss, route, s: 0, pos: pointAt(route.info, 0), hp, maxHp: hp, speed, flying, damage, interval,
    nextAttack: 0, engaged: null, slowUntil: 0, slowPct: 0, stunUntil: 0, alive: true,
  })

  const hit = (e: Enemy, amount: number, src: string, t: number) => {
    if (!e.alive || amount <= 0) return
    const d = Math.min(e.hp, amount)
    e.hp -= d
    if (e.boss) { bossBy[src] = (bossBy[src] ?? 0) + d; bossDmgSecond += d }
    if (e.hp <= 0) {
      e.alive = false
      if (e.engaged) { e.engaged.engaged = null; e.engaged = null }
      if (e.boss) killTime = t
      else creepsKilled++
    }
  }
  const area = (c: Pt, r: number, amount: number, src: string, t: number, air: boolean) => {
    for (const e of enemies) if (e.alive && (air || !e.flying) && dist(e.pos, c) <= r) hit(e, amount, src, t)
  }
  const remaining = (e: Enemy) => e.route.info.length - e.s
  const pick = (p: Pt, range: number, air: boolean, highestHp: boolean): Enemy | null => {
    let best: Enemy | null = null
    for (const e of enemies) {
      if (!e.alive || (e.flying && !air) || dist(e.pos, p) > range) continue
      if (!best) { best = e; continue }
      if (highestHp ? e.maxHp > best.maxHp : remaining(e) < remaining(best)) best = e
    }
    return best
  }

  /** Royal Edict: cast where it buffs the most boss-hitting tower DPS (perfect placement). Returns false if no tower would benefit yet. */
  const castBuff = (sp: SpellDef, t: number): boolean => {
    const live = towers.filter((tw) => tw.interval < 1e8)
    let best: { list: TowerRT[]; value: number } | null = null
    for (const c of live) {
      const scored = live.filter((tw) => dist(tw.pos, c.pos) <= sp.aoe)
        .map((tw) => ({ tw, v: dist(tw.pos, bossE!.pos) <= tw.range * (1 + sp.buffRangePct / 100) ? tw.dmg / tw.interval : 0 }))
        .sort((a, b) => b.v - a.v).slice(0, sp.buffTowers)
      const value = scored.reduce((a, x) => a + x.v, 0)
      if (!best || value > best.value) best = { list: scored.filter((x) => x.v > 0).map((x) => x.tw), value }
    }
    if (!best || best.value <= 0) return false
    for (const tw of best.list) { tw.buffUntil = t + sp.duration; tw.buffDmg = sp.buffDmgPct / 100; tw.buffRange = sp.buffRangePct / 100; tw.buffSrc = sp.name }
    return true
  }

  let tick = 0
  for (; ; tick++) {
    const t = tick * DT
    if (t >= FIGHT_SECONDS) break

    // spawns
    while (spawnIdx < spawns.length && spawns[spawnIdx].t <= t + EPS) {
      const c = spawns[spawnIdx++].c
      let route: Route
      if (c.route === 'fly') route = routes.fly
      else { const ground = map.routes.filter((r) => r.id !== 'fly'); route = routes[ground[rr % ground.length].id]; rr++ }
      if (!route) continue
      enemies.push(mkEnemy(c.name, route, c.hp, c.speed, c.flying, c.damage, c.interval, false))
      creepsSpawned++
    }
    if (!bossE && t + EPS >= inp.bossEnters) {
      bossE = mkEnemy(boss.name, bossRoute, boss.hp, boss.speed, false, boss.damage, boss.attackInterval, true)
      enemies.push(bossE)
    }
    for (const e of enemies) if (e.alive) e.pos = pointAt(e.route.info, e.s)

    // zones (damage-over-time spells): dps and slow on everything inside
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i]
      if (t >= z.until) { zones.splice(i, 1); continue }
      for (const e of enemies) {
        if (!e.alive || dist(e.pos, z.pos) > z.r) continue
        hit(e, z.dps * DT, z.label, t)
        if (z.slow > 0) { e.slowUntil = t + DT * 1.5; e.slowPct = Math.max(e.slowPct, z.slow) }
      }
    }

    // spells: cast at the boss once it is on the field
    if (bossE && bossE.alive) {
      build.spells.forEach((sp, i) => {
        if (t + EPS < spellNext[i]) return
        if (sp.kind === 'buff') { if (castBuff(sp, t)) spellNext[i] = advance(spellNext[i], sp.cooldown, t); return }
        spellNext[i] = advance(spellNext[i], sp.cooldown, t)
        const mult = 1 + mods.spellDamage / 100
        if (sp.kind === 'strike') area(bossE!.pos, sp.aoe, mean(sp.dmgMin, sp.dmgMax) * sp.hits * mult, sp.name, t, true)
        else if (sp.kind === 'zone') zones.push({ pos: bossE!.pos, r: sp.aoe, until: t + sp.duration, dps: sp.dpsAvg * mult, slow: sp.slowPct / 100, label: sp.name })
      })
    }

    // hero skills
    if (hero && hero.deadUntil <= 0 && bossE && bossE.alive && dist(hero.pos, bossE.pos) <= HERO_REACH) {
      for (const s of heroSkills) {
        if (s.def.kind === 'periodic' && t + EPS >= s.next) {
          s.next = advance(s.next, s.cd, t)
          if (s.def.aoe) area(bossE.pos, s.def.aoe, s.dmg, s.label, t, true)
          else hit(bossE, s.dmg, s.label, t)
        } else if (s.def.kind === 'dot' && t + EPS >= s.next) {
          s.next = advance(s.next, s.def.cooldown ?? 0, t)
          zones.push({ pos: bossE.pos, r: s.def.aoe ?? 1, until: t + (s.def.duration ?? 0), dps: s.def.dps ?? 0, slow: 0, label: s.label })
        }
      }
    }

    // towers
    for (const tw of towers) {
      const buffed = t < tw.buffUntil
      const target = tw.interval < 1e8 ? pick(tw.pos, tw.range * (1 + (buffed ? tw.buffRange : 0)), tw.hitsAir, tw.highestHp) : null
      if (target && t + EPS >= tw.next) {
        tw.next = advance(tw.next, tw.interval, t)
        const extra = buffed ? tw.dmg * tw.buffDmg : 0 // the buff's share is credited to the spell
        if (tw.aoe > 0) { area(target.pos, tw.aoe, tw.dmg, tw.label, t, tw.hitsAir); if (extra) area(target.pos, tw.aoe, extra, tw.buffSrc, t, tw.hitsAir) }
        else { hit(target, tw.dmg, tw.label, t); if (extra) hit(target, extra, tw.buffSrc, t) }
        for (const s of tw.skills) if (s.def.kind === 'dot' && !s.def.cooldown) { s.dotTarget = target; s.dotUntil = t + (s.def.duration ?? 0) }
      }
      for (const s of tw.skills) {
        const tgt = target ?? (tw.interval >= 1e8 ? pick(tw.pos, 400, true, false) : null)
        if (s.def.kind === 'periodic' && tgt && t + EPS >= s.next) {
          s.next = advance(s.next, s.cd, t)
          if (s.def.aoe) area(tgt.pos, s.def.aoe, s.dmg, s.label, t, tw.hitsAir)
          else hit(tgt, s.dmg, s.label, t)
        } else if (s.def.kind === 'dot') {
          if (s.def.cooldown && tgt && t + EPS >= s.next) { s.next = advance(s.next, s.cd, t); s.dotTarget = tgt; s.dotUntil = t + (s.def.duration ?? 0) }
          if (s.dotTarget && s.dotTarget.alive && t < s.dotUntil) hit(s.dotTarget, (s.def.dps ?? 0) * DT, s.label, t)
        }
      }
    }

    // fighters: revive, claim blockers, attack
    for (const f of fighters) if (f.deadUntil > 0 && t + EPS >= f.deadUntil) { f.deadUntil = 0; f.hp = f.maxHp; f.engaged = null }
    const ground = enemies.filter((e) => e.alive && !e.flying).sort((a, b) => remaining(a) - remaining(b))
    for (const e of ground) {
      if (e.engaged && (e.engaged.deadUntil > 0 || dist(e.engaged.pos, e.pos) > BLOCK_RADIUS * 1.5)) { e.engaged.engaged = null; e.engaged = null }
      if (e.engaged) continue
      let best: Fighter | null = null, bd = BLOCK_RADIUS
      for (const f of fighters) {
        if (f.deadUntil > 0 || f.engaged) continue
        const d = dist(f.pos, e.pos)
        if (d <= bd) { best = f; bd = d }
      }
      if (best) { best.engaged = e; e.engaged = best }
    }
    for (const f of fighters) {
      if (f.deadUntil > 0 || t + EPS < f.nextAttack) continue
      const tgt = f.range > 0 ? pick(f.pos, f.range, true, false) : f.engaged
      if (tgt && tgt.alive) { f.nextAttack = advance(f.nextAttack, f.interval, t); hit(tgt, f.dmg, f.name, t) }
    }

    // enemies: fight their blocker or walk
    for (const e of enemies) {
      if (!e.alive) continue
      if (t < e.stunUntil) continue
      const f = e.engaged
      if (f && f.deadUntil <= 0) {
        if (t + EPS >= e.nextAttack) {
          e.nextAttack = advance(e.nextAttack, e.interval, t)
          f.hp -= e.damage * (1 - f.armor)
          if (f.hp <= 0) { f.deadUntil = t + f.respawn; f.engaged = null; e.engaged = null }
        }
      } else {
        const slow = t < e.slowUntil ? 1 - e.slowPct : 1
        e.s += e.speed * slow * DT
        if (e.s >= e.route.info.length) {
          if (e.boss) { crossedAt = t; e.alive = false } else e.alive = false
        }
      }
    }
    for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) { if (enemies[i].engaged) { enemies[i].engaged!.engaged = null }; enemies.splice(i, 1) }

    if (Math.abs(t - Math.round(t)) < DT / 2 && Math.round(t) !== (timeline.at(-1)?.t ?? -1)) {
      timeline.push({ t: Math.round(t), bossHp: bossE ? Math.max(0, bossE.hp) : boss.hp, bossS: bossE && bossE.alive ? bossE.s : null, dps: bossDmgSecond })
      bossDmgSecond = 0
    }
    if (killTime !== null || crossedAt !== null) break
  }

  const bossHpLeft = bossE ? Math.max(0, bossE.hp) : boss.hp
  return {
    killTime, crossedAt, endTime: tick * DT, bossHpLeft, bossDamageBy: bossBy, creepsKilled, creepsSpawned,
    timeline, notes: [...new Set(notes)],
  }
}
