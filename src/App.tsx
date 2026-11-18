import { useEffect, useMemo, useState } from 'react'
import { BOSS_ENTERS_SEC, BOSS_KW as BOSS, CREEP_SETS } from './data/kingdomwars'
import type { CardKind } from './data/icons'
import { deckDps, type DeckInput } from './sim/dps'
import { simulate, type Build, type Placement } from './sim/engine'
import { dpsAt } from './sim/explorer'
import { pointAt } from './sim/geometry'
import { heroById, spellById, towerById, type Tier, type TowerDef } from './sim/library'
import { collectMods } from './sim/perks'
import type { Pt } from './sim/types'
import { BattleStep } from './ui/BattleStep'
import { DeckBuilder, type TierRow } from './ui/DeckBuilder'
import { Gold } from './ui/icons'
import { Results } from './ui/Results'
import {
  DEFAULT_DECK, MAP, PATH, autoPlace, classOfHero, classOfTower, emptyDeck, emptySpots, fmt, goldOf, loadDecks, nearestOnRoute, saveDecks,
  type DeckState, type Placing, type Spot, type Spots,
} from './ui/state'
import type { DmgClass } from './ui/icons'

type Kind = CardKind

export function App() {
  // ---- the deck (step 1) ----------------------------------------------------------------------
  const [decks, setDecks] = useState<Record<number, DeckState>>(() => ({ 1: DEFAULT_DECK, ...loadDecks() }))
  const [slot, setSlot] = useState(1)
  const deck = decks[slot] ?? DEFAULT_DECK
  const setDeck = (next: DeckState) => setDecks((all) => ({ ...all, [slot]: next }))
  useEffect(() => saveDecks(decks), [decks])

  const listFor = (kind: Kind, d: DeckState) => (kind === 'heroes' ? [d.hero] : kind === 'spells' ? d.spells : d.towers)
  const withList = (d: DeckState, kind: Kind, list: (string | null)[]): DeckState => (kind === 'heroes' ? { ...d, hero: list[0] } : kind === 'spells' ? { ...d, spells: list } : { ...d, towers: list })
  /** Put a card (or nothing) into a slot; a card already in the deck moves, swapping with whatever was in the target slot. */
  const place = (kind: Kind, index: number, id: string | null) => {
    const list = [...listFor(kind, deck)]
    if (id) { const from = list.indexOf(id); if (from >= 0 && from !== index) list[from] = list[index] }
    list[index] = id
    setDeck(withList(deck, kind, list))
  }
  const swap = (kind: Kind, a: number, b: number) => { const list = [...listFor(kind, deck)]; [list[a], list[b]] = [list[b], list[a]]; setDeck(withList(deck, kind, list)) }
  const toggleSkill = (towerId: string, skillId: string) => {
    const cur = deck.skills[towerId] ?? []
    setDeck({ ...deck, skills: { ...deck.skills, [towerId]: cur.includes(skillId) ? cur.filter((x) => x !== skillId) : [...cur, skillId] } })
  }

  const hero = deck.hero ? heroById(deck.hero) ?? null : null
  const spells = deck.spells.map((id) => (id ? spellById(id) ?? null : null))
  const towers = deck.towers.map((id) => (id ? towerById(id) ?? null : null))
  const deckInput = (tier: Tier): DeckInput => ({ hero, spells, towers, tier, skills: deck.skills, perks: deck.perks })
  const ideal = useMemo(() => deckDps(deckInput(deck.tier), BOSS.hp), [deck]) // eslint-disable-line react-hooks/exhaustive-deps
  const tierRows: TierRow[] = useMemo(() => ([1, 2, 3] as Tier[]).map((t) => {
    const r = deckDps(deckInput(t), BOSS.hp)
    return { tier: t, dps: r.total, perMin: r.perMin, gold: r.gold, unknown: r.unknownCosts, kill: r.idealKill }
  }), [deck]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the battle (step 2) --------------------------------------------------------------------
  const [step, setStep] = useState<'deck' | 'battle'>('deck')
  const deckTowers = towers.filter((t): t is TowerDef => !!t)
  const spellCards = spells.filter((s): s is NonNullable<typeof s> => !!s)
  const [spots, setSpotsRaw] = useState<Spots>(() => autoPlace(deckTowers))
  const [heroPos, setHeroPos] = useState<Pt>(() => pointAt(PATH, 1500))
  const [creepSet, setCreepSet] = useState<'A' | 'B'>('A')
  const [selected, setSelected] = useState<string | null>(null)
  const [placing, setPlacing] = useState<Placing>(null)
  const [scrub, setScrub] = useState(0)
  const [routes, setRoutes] = useState<'off' | 'boss' | 'all'>('boss')
  const [exploreS, setExploreS] = useState(1000)

  const setSpot = (id: string, patch: Partial<Spot>) => setSpotsRaw((s) => ({ ...s, [id]: { ...s[id], ...patch } }))
  /** Move a tower to another stump; if that stump is taken the two towers swap. */
  const moveTower = (from: string, to: string) => setSpotsRaw((s) => ({ ...s, [from]: { ...s[to], rally: undefined }, [to]: { ...s[from], rally: undefined } }))
  const goBattle = () => {
    // first visit with towers in the deck but none on the map: lay them out for the player
    if (!MAP.spots.some((sp) => deckTowers.some((t) => t.id === spots[sp.id]?.towerId)) && deckTowers.length) setSpotsRaw(autoPlace(deckTowers))
    setStep('battle')
  }

  const placements: Placement[] = useMemo(() => MAP.spots.flatMap((sp) => {
    const st = spots[sp.id]
    const tower = st?.towerId ? deckTowers.find((t) => t.id === st.towerId) : undefined
    if (!tower || !tower.tiers[deck.tier]) return []
    return [{ spotId: sp.id, tower, tier: deck.tier, skills: deck.tier === 3 ? deck.skills[tower.id] ?? [] : [], rally: tower.kind === 'barracks' ? (st.rally ?? nearestOnRoute(sp)) : undefined }]
  }), [spots, deck.towers.join(), deck.tier, deck.skills]) // eslint-disable-line react-hooks/exhaustive-deps

  const perkLists = useMemo(() => (deck.perks ? [...(hero ? hero.perks : []), ...spellCards.flatMap((s) => s.perks), ...deckTowers.flatMap((t) => t.perks)] : []), [deck]) // eslint-disable-line react-hooks/exhaustive-deps
  const mods = useMemo(() => collectMods([perkLists]), [perkLists])
  const build: Build = { hero, heroPos, spells: spellCards, placements }
  const result = useMemo(
    () => simulate({ map: MAP, boss: BOSS, bossEnters: BOSS_ENTERS_SEC, creeps: CREEP_SETS[creepSet], build, mods }),
    [placements, deck, heroPos, creepSet, mods], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const end = result.killTime ?? result.crossedAt ?? result.endTime
  const onField = Math.max(0.1, end - BOSS_ENTERS_SEC)
  const total = Object.values(result.bossDamageBy).reduce((a, b) => a + b, 0)
  const fightDps = total / onField
  const fightGold = goldOf(placements)
  const kill = result.killTime !== null ? result.killTime - BOSS_ENTERS_SEC : null

  const classByName: Record<string, DmgClass> = {}
  if (hero) classByName[hero.name] = classOfHero(hero)
  for (const sp of spellCards) if (sp.kind !== 'buff') classByName[sp.name] = 'magic'
  for (const t of deckTowers) classByName[t.name] = classOfTower(t)

  const explorer = useMemo(() => {
    const pts = []
    for (let s = 0; s <= PATH.length; s += 5) pts.push({ s, ...dpsAt(s, MAP, PATH, placements, mods) })
    return pts
  }, [placements, mods])
  const here = dpsAt(exploreS, MAP, PATH, placements, mods)
  const scrubPoint = result.timeline.find((p) => p.t === scrub) ?? result.timeline.at(-1)

  // ---- header numbers: step 1 shows the pure numbers, step 2 the fight ------------------------
  const head = step === 'deck'
    ? { dps: ideal.total, perMin: ideal.perMin, gold: ideal.gold, unknown: ideal.unknownCosts, killText: ideal.idealKill !== null ? `${ideal.idealKill.toFixed(1)} s` : '—', killLabel: 'IDEAL KILL' }
    : { dps: fightDps, perMin: fightDps * 60, gold: fightGold.gold, unknown: fightGold.unknown, killText: kill !== null ? `${kill.toFixed(1)} s` : '—', killLabel: kill !== null ? 'BOSS KILL' : 'NOT KILLED' }

  return (
    <div className="app">
      <header className="stats">
        <div><b>{fmt(head.dps)}</b><span>DPS</span></div>
        <div><b>{fmt(head.perMin)}</b><span>DAMAGE / MIN</span></div>
        <div><b><Gold n={head.gold} plus={head.unknown > 0} size={20} /></b><span>GOLD</span></div>
        <div><b>{head.killText}</b><span>{head.killLabel}</span></div>
      </header>

      <main className="content">
        <h1>Kingdom Wars Boss DPS</h1>
        <div className="sub">Deck calculator for Kingdom Rush Battles, card level 9. Boss only; opponent-only skills are excluded.</div>

        <div className="steps">
          <button className={step === 'deck' ? 'on' : ''} onClick={() => setStep('deck')}>1 DECK</button>
          <button className={step === 'battle' ? 'on' : ''} onClick={goBattle}>2 BATTLE</button>
        </div>

        {step === 'deck' ? (
          <DeckBuilder
            deck={deck} dps={ideal} slot={slot} onSlot={setSlot}
            onClear={() => setDeck({ ...emptyDeck(), tier: deck.tier, perks: deck.perks })} onReset={() => setDeck(DEFAULT_DECK)}
            onPlace={place} onSwap={swap}
            onTier={(t) => setDeck({ ...deck, tier: t })} onPerks={(on) => setDeck({ ...deck, perks: on })} onToggleSkill={toggleSkill}
            tiers={tierRows} goBattle={goBattle}
          />
        ) : (
          <>
            <section className="panel">
              <h2>Enemy wave</h2>
              <div className="seg">
                <button className={creepSet === 'A' ? 'on' : ''} onClick={() => setCreepSet('A')}>Set A</button>
                <button className={creepSet === 'B' ? 'on' : ''} onClick={() => setCreepSet('B')}>Set B</button>
              </div>
              <div className="hint">The two creep tables from krb-deck. Pick the one your boss fight uses.</div>
            </section>
            <BattleStep
              hero={hero} heroPos={heroPos} spots={spots} placements={placements} deckTowers={deckTowers} mods={mods}
              bossS={scrubPoint?.bossS ?? null}
              selected={selected} setSelected={setSelected} placing={placing} setPlacing={setPlacing}
              setHeroPos={setHeroPos} setSpot={setSpot} moveTower={moveTower}
              onAutoPlace={() => setSpotsRaw(autoPlace(deckTowers))} onClear={() => setSpotsRaw(emptySpots())}
              scrub={scrub} setScrub={setScrub} maxScrub={result.timeline.at(-1)?.t ?? 1}
              routes={routes} setRoutes={setRoutes}
            />
            <Results
              result={result} onField={onField} mods={mods} perks={perkLists} classByName={classByName}
              explorer={explorer} exploreS={exploreS} setExploreS={setExploreS}
              exploreInfo={`Boss at ${Math.round(exploreS)} / ${Math.round(PATH.length)}: ${fmt(here.dps)} DPS from ${here.shooters} shooter(s)${here.blocked ? ', blocked by barracks' : ''}`}
            />
          </>
        )}
      </main>
    </div>
  )
}
