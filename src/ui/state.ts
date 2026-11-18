// Shared UI state helpers: deck saves, spot builds, auto-placement, number formatting.
import { MAP_KW } from '../data/kingdomwars'
import { RALLY_RANGE, type Placement } from '../sim/engine'
import { buildPath, dist, pointAt } from '../sim/geometry'
import { LIBRARY, type Tier, type TowerDef } from '../sim/library'
import type { CardKind } from '../data/icons'
import type { Pt } from '../sim/types'
import type { DmgClass } from './icons'

export const MAP = MAP_KW
export const PATH = buildPath(MAP.path)
export const fmt = (n: number) => Math.round(n).toLocaleString()

export interface Spot { towerId: string | null; rally?: Pt }
export type Spots = Record<string, Spot>
export type Placing = null | 'hero' | { rally: string }

export const emptySpots = (): Spots => Object.fromEntries(MAP.spots.map((s) => [s.id, { towerId: null } as Spot]))

export const nearestOnRoute = (p: Pt): Pt => {
  let best = pointAt(PATH, 0), bd = Infinity
  for (let s = 0; s <= PATH.length; s += 4) { const q = pointAt(PATH, s); const d = dist(p, q); if (d < bd) { bd = d; best = q } }
  return best
}

/** Greedy layout: shooters on the spots that see the most of the boss route, barracks on spots next to the route. */
export function autoPlace(towers: TowerDef[]): Spots {
  const spots = emptySpots(), used = new Set<string>()
  const samples: Pt[] = []
  for (let s = 0; s <= PATH.length; s += 20) samples.push(pointAt(PATH, s))
  const order = [...towers].sort((a, b) => Number(a.kind === 'barracks') - Number(b.kind === 'barracks'))
  for (const t of order) {
    const td = t.tiers[3]
    if (!td) continue
    let best: { id: string; score: number } | null = null
    for (const sp of MAP.spots) {
      if (used.has(sp.id)) continue
      let score: number
      if (t.kind === 'barracks') { const d = Math.min(...samples.map((q) => dist(q, sp))); score = d <= RALLY_RANGE ? 1000 - d : -1 }
      else score = samples.filter((q) => dist(q, sp) <= (td.range ?? 0)).length
      if (!best || score > best.score) best = { id: sp.id, score }
    }
    if (best && best.score > 0) { used.add(best.id); spots[best.id] = { towerId: t.id } }
  }
  return spots
}

// ---- cards ---------------------------------------------------------------------------
export type Listed = { id: string; name: string; selectable: boolean; issues: string[] }
export const listOf = (k: CardKind): Listed[] => (k === 'heroes' ? LIBRARY.heroes : k === 'spells' ? LIBRARY.spells : LIBRARY.towers)

// ---- the deck being built (saved per slot in this browser) ---------------------------------
export interface DeckState {
  hero: string | null
  spells: (string | null)[] // 3 slots
  towers: (string | null)[] // 4 slots
  tier: Tier // every tower in the deck at this level
  skills: Record<string, string[]> // bought skills per tower id (they only work at level 3)
  perks: boolean // apply the deck's perks to the numbers
}
export const emptyDeck = (): DeckState => ({ hero: null, spells: [null, null, null], towers: [null, null, null, null], tier: 3, skills: {}, perks: true })
export const DEFAULT_DECK: DeckState = {
  hero: 'alric', spells: ['royal-edict', 'ultimate-strike', 'thunderbolt'],
  towers: ['genies-domains', 'witches-coven', 'crimson-manor', 'twilight-longbow'], tier: 3, skills: {}, perks: true,
}
const known = (k: CardKind, id: unknown): id is string => typeof id === 'string' && listOf(k).some((c) => c.id === id)
const slots = (k: CardKind, v: unknown, n: number): (string | null)[] => Array.from({ length: n }, (_, i) => { const id = Array.isArray(v) ? v[i] : null; return known(k, id) ? id : null })
/** Accepts whatever was saved and returns a valid deck (unknown cards become empty slots, no duplicates). */
export function sanitize(d: unknown): DeckState {
  const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
  const dedupe = (a: (string | null)[]) => a.map((x, i) => (x && a.indexOf(x) !== i ? null : x))
  return {
    hero: known('heroes', o.hero) ? o.hero : null, spells: dedupe(slots('spells', o.spells, 3)), towers: dedupe(slots('towers', o.towers, 4)),
    tier: o.tier === 1 || o.tier === 2 || o.tier === 3 ? o.tier : 3,
    skills: o.skills && typeof o.skills === 'object' ? (o.skills as Record<string, string[]>) : {}, perks: o.perks !== false,
  }
}
const KEY = 'krb-decks-v3'
export const loadDecks = (): Record<number, DeckState> => {
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>; return Object.fromEntries(Object.entries(raw).map(([k, v]) => [+k, sanitize(v)])) } catch { return {} }
}
export const saveDecks = (d: Record<number, DeckState>) => { try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* private mode etc. */ } }

// ---- build maths ----------------------------------------------------------------------
export function goldOf(placements: Placement[]): { gold: number; unknown: number } {
  let gold = 0, unknown = 0
  for (const pl of placements) {
    const c = pl.tower.tiers[pl.tier]?.cost
    if (c == null) unknown++; else gold += c
    for (const sid of pl.skills) { const k = pl.tower.skills.find((s) => s.id === sid)?.cost; if (k == null) unknown++; else gold += k }
  }
  return { gold, unknown }
}

/** Damage per second credited to one card: hero/spell/tower names prefix the source labels the engine writes. */
export function sourceDps(by: Record<string, number>, name: string, secs: number): number {
  let sum = 0
  for (const [k, v] of Object.entries(by)) if (k === name || k.startsWith(name + ' (') || k.startsWith(name + ' ·')) sum += v
  return sum / Math.max(0.1, secs)
}

// ---- damage classes (icons: sword / arrow / blast / dynamite) -------------------------------
export const classOfTower = (t: TowerDef): DmgClass => (t.kind === 'barracks' ? ((t.tiers[3]?.range ?? 0) > 0 ? 'ranged' : 'melee') : t.cls === 'magic' ? 'magic' : t.cls === 'artillery' ? 'artillery' : 'ranged')
export const classOfHero = (h: { ranged: boolean }): DmgClass => (h.ranged ? 'ranged' : 'melee')

/** Source labels the engine writes look like "Name", "Name (spot 7)" or "Name · Skill": map the name part to a class. */
export function classOfSource(label: string, byName: Record<string, DmgClass>): DmgClass | null {
  const name = label.split(' (')[0].split(' · ')[0]
  return byName[name] ?? null
}

/** Keep a rally point inside the ring around its tower. */
export function clampRally(spot: Pt, p: Pt): Pt {
  const d = dist(p, spot)
  return d <= RALLY_RANGE ? p : { x: spot.x + ((p.x - spot.x) * RALLY_RANGE) / d, y: spot.y + ((p.y - spot.y) * RALLY_RANGE) / d }
}

/** Share of the boss route (by length) within `range` of a point. */
export function routeCoverage(pos: Pt, range: number): number {
  let inside = 0, total = 0
  for (let s = 0; s <= PATH.length; s += 10) { total++; if (dist(pointAt(PATH, s), pos) <= range) inside++ }
  return inside / Math.max(1, total)
}
export function bestCoverage(range: number): { spotId: string; frac: number } {
  let best = { spotId: MAP.spots[0].id, frac: -1 }
  for (const sp of MAP.spots) { const f = routeCoverage(sp, range); if (f > best.frac) best = { spotId: sp.id, frac: f } }
  return best
}
