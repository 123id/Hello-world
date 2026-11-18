// Shared UI state helpers: deck saves, spot builds, auto-placement, number formatting.
import { MAP_KW } from '../data/kingdomwars'
import { RALLY_RANGE, type Placement } from '../sim/engine'
import { buildPath, dist, pointAt } from '../sim/geometry'
import { LIBRARY, type Tier, type TowerDef } from '../sim/library'
import type { CardKind } from '../data/icons'
import type { Pt } from '../sim/types'

export const MAP = MAP_KW
export const PATH = buildPath(MAP.path)
export const fmt = (n: number) => Math.round(n).toLocaleString()

export interface Spot { towerId: string | null; tier: Tier; skills: string[]; rally?: Pt }
export type Spots = Record<string, Spot>
export type Placing = null | 'hero' | { rally: string }

export const emptySpots = (): Spots => Object.fromEntries(MAP.spots.map((s) => [s.id, { towerId: null, tier: 3 as Tier, skills: [] as string[] }]))

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
    if (best && best.score > 0) { used.add(best.id); spots[best.id] = { towerId: t.id, tier: 3, skills: [] } }
  }
  return spots
}

// ---- cards ---------------------------------------------------------------------------
export type Listed = { id: string; name: string; selectable: boolean; issues: string[] }
export const listOf = (k: CardKind): Listed[] => (k === 'heroes' ? LIBRARY.heroes : k === 'spells' ? LIBRARY.spells : LIBRARY.towers)
export const usable = (k: CardKind, id: string) => !!listOf(k).find((c) => c.id === id && c.selectable)

// ---- deck slots (saved in this browser) -----------------------------------------------
export interface DeckSave { heroId: string; spellIds: string[]; deckIds: string[] }
export const DEFAULT_DECK: DeckSave = {
  heroId: 'alric', spellIds: ['royal-edict', 'ultimate-strike', 'thunderbolt'],
  deckIds: ['genies-domains', 'witches-coven', 'crimson-manor', 'twilight-longbow'],
}
export const sanitize = (d: DeckSave | undefined): DeckSave => (
  d && usable('heroes', d.heroId) && d.spellIds?.length === 3 && d.spellIds.every((x) => usable('spells', x)) && d.deckIds?.length === 4 && d.deckIds.every((x) => usable('towers', x)) ? d : DEFAULT_DECK
)
const KEY = 'krb-decks-v2'
export const loadDecks = (): Record<number, DeckSave> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
export const saveDecks = (d: Record<number, DeckSave>) => { try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* private mode etc. */ } }

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

/** Same build with every tower at tier `t` (towers lacking data for that tier keep their own). */
export const withTier = (placements: Placement[], t: Tier): Placement[] => placements.map((p) => (p.tower.tiers[t] ? { ...p, tier: t } : p))

/** Damage per second credited to one card: hero/spell/tower names prefix the source labels the engine writes. */
export function sourceDps(by: Record<string, number>, name: string, secs: number): number {
  let sum = 0
  for (const [k, v] of Object.entries(by)) if (k === name || k.startsWith(name + ' (') || k.startsWith(name + ' ·')) sum += v
  return sum / Math.max(0.1, secs)
}
