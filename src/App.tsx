import { useMemo, useState } from 'react'
import { BOSS_ENTERS_SEC, BOSS_KW as BOSS, CREEP_SETS } from './data/kingdomwars'
import type { CardKind } from './data/icons'
import { simulate, type Build, type Placement } from './sim/engine'
import { dpsAt } from './sim/explorer'
import { heroById, spellById, towerById, type Tier, type TowerDef } from './sim/library'
import { collectMods } from './sim/perks'
import { pointAt } from './sim/geometry'
import type { Pt } from './sim/types'
import { BattleStep } from './ui/BattleStep'
import { Picker } from './ui/common'
import { DeckStep, type Pill, type TierRow } from './ui/DeckStep'
import { Results } from './ui/Results'
import {
  DEFAULT_DECK, MAP, PATH, autoPlace, emptySpots, fmt, goldOf, loadDecks, nearestOnRoute, sanitize, saveDecks, sourceDps, withTier,
  type DeckSave, type Placing, type Spot, type Spots,
} from './ui/state'

const killSecs = (r: { killTime: number | null }) => (r.killTime !== null ? r.killTime - BOSS_ENTERS_SEC : null)

export function App() {
  const [decks, setDecks] = useState<Record<number, DeckSave>>(loadDecks)
  const [slot, setSlot] = useState(1)
  const first = sanitize(decks[1])
  const [heroId, setHeroId] = useState(first.heroId)
  const [spellIds, setSpellIds] = useState(first.spellIds)
  const [deckIds, setDeckIds] = useState(first.deckIds)
  const [spots, setSpots] = useState<Spots>(() => autoPlace(first.deckIds.map((id) => towerById(id)).filter((t): t is TowerDef => !!t)))
  const [heroPos, setHeroPos] = useState<Pt>(() => pointAt(PATH, 1500))
  const [creepSet, setCreepSet] = useState<'A' | 'B'>('A')
  const [step, setStep] = useState<'deck' | 'battle'>('deck')
  const [picking, setPicking] = useState<{ kind: CardKind; index: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [placing, setPlacing] = useState<Placing>(null)
  const [scrub, setScrub] = useState(0)
  const [routes, setRoutes] = useState<'off' | 'boss' | 'all'>('boss')
  const [exploreS, setExploreS] = useState(1000)

  const hero = heroById(heroId) ?? null
  const spells = spellIds.map((id) => spellById(id)).filter((s): s is NonNullable<typeof s> => !!s)
  const deckTowers = deckIds.map((id) => towerById(id)).filter((t): t is TowerDef => !!t)

  const applyDeck = (d: DeckSave, n: number, keepSpots = false) => {
    setHeroId(d.heroId); setSpellIds(d.spellIds); setDeckIds(d.deckIds)
    setDecks((all) => { const next = { ...all, [n]: d }; saveDecks(next); return next })
    if (!keepSpots) setSpots(autoPlace(d.deckIds.map((id) => towerById(id)).filter((t): t is TowerDef => !!t)))
  }
  const switchSlot = (n: number) => { setSlot(n); applyDeck(sanitize(decks[n]), n) }
  const pickCard = (id: string) => {
    if (!picking) return
    const d: DeckSave = { heroId, spellIds: [...spellIds], deckIds: [...deckIds] }
    if (picking.kind === 'heroes') d.heroId = id
    else if (picking.kind === 'spells') d.spellIds[picking.index] = id
    else d.deckIds[picking.index] = id
    // changing a tower card re-lays the build (the old tower may no longer be in the deck); hero/spell changes keep it
    applyDeck(d, slot, picking.kind !== 'towers')
    setPicking(null)
  }
  const setSpot = (id: string, patch: Partial<Spot>) => setSpots((s) => ({ ...s, [id]: { ...s[id], ...patch } }))

  const placements: Placement[] = useMemo(() => MAP.spots.flatMap((sp) => {
    const st = spots[sp.id]
    const tower = st?.towerId ? deckTowers.find((t) => t.id === st.towerId) : undefined
    if (!tower || !tower.tiers[st.tier]) return []
    return [{ spotId: sp.id, tower, tier: st.tier, skills: st.skills, rally: tower.kind === 'barracks' ? (st.rally ?? nearestOnRoute(sp)) : undefined }]
  }), [spots, deckTowers])

  const perkLists = useMemo(() => [...(hero ? hero.perks : []), ...spells.flatMap((s) => s.perks), ...deckTowers.flatMap((t) => t.perks)], [hero, spells, deckTowers])
  const mods = useMemo(() => collectMods([perkLists]), [perkLists])
  const build: Build = { hero, heroPos, spells, placements }
  const run = (pl: Placement[]) => simulate({ map: MAP, boss: BOSS, bossEnters: BOSS_ENTERS_SEC, creeps: CREEP_SETS[creepSet], build: { ...build, placements: pl }, mods })
  const result = useMemo(() => run(placements), [placements, hero, heroPos, spells, creepSet, mods]) // eslint-disable-line react-hooks/exhaustive-deps

  const end = result.killTime ?? result.crossedAt ?? result.endTime
  const onField = Math.max(0.1, end - BOSS_ENTERS_SEC)
  const total = Object.values(result.bossDamageBy).reduce((a, b) => a + b, 0)
  const dps = total / onField
  const { gold, unknown } = goldOf(placements)

  // LVL1 / LVL2 / LVL3 comparison (every placed tower at that level)
  const tierRows: TierRow[] = useMemo(() => ([1, 2, 3] as Tier[]).map((t) => {
    const pl = withTier(placements, t), r = run(pl)
    const e = Math.max(0.1, (r.killTime ?? r.crossedAt ?? r.endTime) - BOSS_ENTERS_SEC)
    const g = goldOf(pl)
    return { tier: t, dps: Object.values(r.bossDamageBy).reduce((a, b) => a + b, 0) / e, kill: killSecs(r), gold: g.gold, unknown: g.unknown }
  }), [placements, hero, heroPos, spells, creepSet, mods]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeTier: Tier | null = placements.length && placements.every((p) => p.tier === placements[0].tier) ? placements[0].tier : null
  const setAllTiers = (t: Tier) => setSpots((s) => Object.fromEntries(Object.entries(s).map(([id, sp]) => {
    const tw = sp.towerId ? towerById(sp.towerId) : undefined
    return [id, tw?.tiers[t] ? { ...sp, tier: t } : sp]
  })))

  // per-card contribution pills
  const placedNames = new Set(placements.map((p) => p.tower.name))
  const pillFor = (kind: CardKind, id: string): Pill => {
    if (kind === 'heroes') { const h = heroById(id); return { text: `${fmt(sourceDps(result.bossDamageBy, h?.name ?? '', onField))} DPS`, tone: 'good' } }
    if (kind === 'spells') {
      const s = spellById(id)
      if (!s || !s.selectable) return { text: 'OFF', tone: 'off' }
      const v = sourceDps(result.bossDamageBy, s.name, onField)
      return s.kind === 'buff' ? { text: `+${fmt(v)}`, tone: 'good' } : { text: `${fmt(v)} DPS`, tone: 'good' }
    }
    const t = towerById(id)
    if (!t || !placedNames.has(t.name)) return { text: 'NOT PLACED', tone: 'warn' }
    return { text: `${fmt(sourceDps(result.bossDamageBy, t.name, onField))} DPS`, tone: 'good' }
  }

  const explorer = useMemo(() => {
    const pts = []
    for (let s = 0; s <= PATH.length; s += 5) pts.push({ s, ...dpsAt(s, MAP, PATH, placements, mods) })
    return pts
  }, [placements, mods])
  const here = dpsAt(exploreS, MAP, PATH, placements, mods)
  const scrubPoint = result.timeline.find((p) => p.t === scrub) ?? result.timeline.at(-1)
  const kill = killSecs(result)

  return (
    <div className="app">
      <header className="stats">
        <div><b>{fmt(dps)}</b><span>DPS</span></div>
        <div><b>{fmt(dps * 60)}</b><span>DAMAGE / MIN</span></div>
        <div><b>{fmt(gold)}g{unknown ? '+' : ''}</b><span>GOLD</span></div>
        <div><b>{kill !== null ? `${kill.toFixed(1)} s` : '—'}</b><span>{kill !== null ? 'BOSS KILL' : 'NOT KILLED'}</span></div>
      </header>

      <main className="content">
        <h1>Kingdom Wars Boss DPS</h1>
        <div className="sub">Deck calculator for Kingdom Rush Battles, card level 9. Boss only; opponent-only skills are excluded.</div>

        <div className="steps">
          <button className={step === 'deck' ? 'on' : ''} onClick={() => setStep('deck')}>1 DECK</button>
          <button className={step === 'battle' ? 'on' : ''} onClick={() => setStep('battle')}>2 BATTLE</button>
        </div>

        {step === 'deck' ? (
          <DeckStep
            slot={slot} onSlot={switchSlot} onReset={() => applyDeck(DEFAULT_DECK, slot)}
            heroId={heroId} spellIds={spellIds} deckIds={deckIds}
            pills={{ hero: pillFor('heroes', heroId), spells: spellIds.map((id) => pillFor('spells', id)), towers: deckIds.map((id) => pillFor('towers', id)) }}
            onPick={(kind, index) => setPicking({ kind, index })}
            tiers={tierRows} activeTier={activeTier} onTier={setAllTiers}
            creepSet={creepSet} setCreepSet={setCreepSet} hasTowers={placements.length > 0} goBattle={() => setStep('battle')}
          />
        ) : (
          <>
            <BattleStep
              hero={hero} heroPos={heroPos} spots={spots} placements={placements} deckTowers={deckTowers} mods={mods}
              bossS={scrubPoint?.bossS ?? null}
              selected={selected} setSelected={setSelected} placing={placing} setPlacing={setPlacing}
              setHeroPos={setHeroPos} setSpot={setSpot}
              onAutoPlace={() => setSpots(autoPlace(deckTowers))} onClear={() => setSpots(emptySpots())}
              scrub={scrub} setScrub={setScrub} maxScrub={result.timeline.at(-1)?.t ?? 1}
              routes={routes} setRoutes={setRoutes}
            />
            <Results
              result={result} onField={onField} mods={mods} perks={perkLists}
              explorer={explorer} exploreS={exploreS} setExploreS={setExploreS}
              exploreInfo={`Boss at ${Math.round(exploreS)} / ${Math.round(PATH.length)}: ${fmt(here.dps)} DPS from ${here.shooters} shooter(s)${here.blocked ? ', blocked by barracks' : ''}`}
            />
          </>
        )}
      </main>

      {picking && <Picker kind={picking.kind} current={picking.kind === 'heroes' ? heroId : picking.kind === 'spells' ? spellIds[picking.index] : deckIds[picking.index]} onPick={pickCard} onClose={() => setPicking(null)} />}
    </div>
  )
}
