import { useMemo, useState } from 'react'
import { iconUrl, type CardKind } from './data/icons'
import { BOSS_ENTERS_SEC, BOSS_KW as BOSS, CREEP_SETS, MAP_KW as MAP } from './data/kingdomwars'
import { RALLY_RANGE, shooterStats, simulate, type Build, type Placement } from './sim/engine'
import { dpsAt } from './sim/explorer'
import { buildPath, dist, pointAt } from './sim/geometry'
import { LIBRARY, TIERS, heroById, spellById, towerById, type Tier, type TowerDef } from './sim/library'
import { collectMods } from './sim/perks'
import { FIGHT_SECONDS, type Pt } from './sim/types'

const path = buildPath(MAP.path)
const nearestOnRoute = (p: Pt): Pt => {
  let best = pointAt(path, 0), bd = Infinity
  for (let s = 0; s <= path.length; s += 4) { const q = pointAt(path, s); const d = dist(p, q); if (d < bd) { bd = d; best = q } }
  return best
}

interface Spot { towerId: string | null; tier: Tier; skills: string[]; rally?: Pt }
const emptySpot = (): Spot => ({ towerId: null, tier: 3, skills: [] })
const fmt = (n: number) => Math.round(n).toLocaleString()

function Icon({ kind, id, size = 32 }: { kind: CardKind; id: string; size?: number }) {
  const u = iconUrl(kind, id)
  return u ? <img src={u} width={size} height={size} alt="" style={{ objectFit: 'contain', flex: 'none' }} /> : <span style={{ display: 'inline-block', width: size, height: size, flex: 'none' }} />
}

function Chart({ data, h = 90, color, bars }: { data: { x: number; y: number }[]; h?: number; color: string; bars?: boolean }) {
  const maxY = Math.max(1, ...data.map((d) => d.y))
  const W = FIGHT_SECONDS
  return (
    <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
      {bars
        ? data.map((d) => <rect key={d.x} x={d.x} y={h - (d.y / maxY) * (h - 4)} width={0.9} height={(d.y / maxY) * (h - 4)} fill={color} />)
        : <polyline fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" points={data.map((d) => `${d.x},${h - (d.y / maxY) * (h - 4)}`).join(' ')} />}
    </svg>
  )
}

type Listed = { id: string; name: string; selectable: boolean; issues: string[] }
const listOf = (k: CardKind): Listed[] => (k === 'heroes' ? LIBRARY.heroes : k === 'spells' ? LIBRARY.spells : LIBRARY.towers)

function Tile({ kind, id, label, onClick }: { kind: CardKind; id: string; label: string; onClick: () => void }) {
  const c = listOf(kind).find((x) => x.id === id)
  return (
    <button className="tile" onClick={onClick} title={`Change ${label}`}>
      <Icon kind={kind} id={id} size={58} />
      <span>{c?.name ?? id}</span>
    </button>
  )
}

function Picker({ kind, current, onPick, onClose }: { kind: CardKind; current: string; onPick: (id: string) => void; onClose: () => void }) {
  const list = [...listOf(kind)].sort((a, b) => Number(b.selectable) - Number(a.selectable) || a.name.localeCompare(b.name))
  return (
    <div className="overlay" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <b>Choose {kind === 'heroes' ? 'a hero' : kind === 'spells' ? 'a spell' : 'a tower'}</b>
          <button className="mini" onClick={onClose}>close</button>
        </div>
        <div style={{ fontSize: '.75rem', color: '#9aa', marginTop: 4 }}>Greyed-out cards are missing data the simulator needs (hover for the reason).</div>
        <div className="pgrid">
          {list.map((c) => (
            <button key={c.id} className={'tile' + (c.id === current ? ' sel' : '')} disabled={!c.selectable} onClick={() => onPick(c.id)}
              title={c.selectable ? c.name : `Not simulatable yet: ${[...new Set(c.issues)].join('; ')}`}>
              <Icon kind={kind} id={c.id} size={52} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface DeckSave { heroId: string; spellIds: string[]; deckIds: string[] }
const DEFAULT_DECK: DeckSave = { heroId: 'king-malik', spellIds: ['rain-of-fire', 'thunderbolt', 'cursed-vines'], deckIds: ['royal-archers', 'mage-tower', 'twilight-longbow', 'rocket-gunners'] }
const usable = (k: CardKind, id: string) => !!listOf(k).find((c) => c.id === id && c.selectable)
const sanitize = (d: DeckSave | undefined): DeckSave => (
  d && usable('heroes', d.heroId) && d.spellIds?.length === 3 && d.spellIds.every((x) => usable('spells', x)) && d.deckIds?.length === 4 && d.deckIds.every((x) => usable('towers', x)) ? d : DEFAULT_DECK
)
const loadDecks = (): Record<number, DeckSave> => { try { return JSON.parse(localStorage.getItem('krb-decks') ?? '{}') } catch { return {} } }
const saveDecks = (d: Record<number, DeckSave>) => { try { localStorage.setItem('krb-decks', JSON.stringify(d)) } catch { /* private mode etc. */ } }

export function App() {
  const [decks, setDecks] = useState<Record<number, DeckSave>>(loadDecks)
  const [slot, setSlot] = useState(1)
  const first = sanitize(decks[1])
  const [heroId, setHeroId] = useState(first.heroId)
  const [spellIds, setSpellIds] = useState(first.spellIds)
  const [deckIds, setDeckIds] = useState(first.deckIds)
  const [picking, setPicking] = useState<{ kind: CardKind; index: number } | null>(null)
  const [heroPos, setHeroPos] = useState<Pt>(() => pointAt(path, 1500))
  const [spots, setSpots] = useState<Record<string, Spot>>(() => {
    const s: Record<string, Spot> = Object.fromEntries(MAP.spots.map((p) => [p.id, emptySpot()]))
    s['7'] = { towerId: 'royal-archers', tier: 3, skills: [] }
    s['4'] = { towerId: 'mage-tower', tier: 3, skills: [] }
    s['10'] = { towerId: 'twilight-longbow', tier: 3, skills: [] }
    s['1'] = { towerId: 'rocket-gunners', tier: 3, skills: [], rally: undefined }
    return s
  })
  const [creepSet, setCreepSet] = useState<'A' | 'B'>('A')
  const [placing, setPlacing] = useState<string | null>(null) // 'hero' or a spot id (rally)
  const [scrub, setScrub] = useState(0)
  const [exploreS, setExploreS] = useState(1000)

  const applyDeck = (d: DeckSave, n: number) => {
    setHeroId(d.heroId); setSpellIds(d.spellIds); setDeckIds(d.deckIds)
    setDecks((all) => { const next = { ...all, [n]: d }; saveDecks(next); return next })
  }
  const switchSlot = (n: number) => { setSlot(n); applyDeck(sanitize(decks[n]), n) }
  const pickCard = (id: string) => {
    if (!picking) return
    const d: DeckSave = { heroId, spellIds: [...spellIds], deckIds: [...deckIds] }
    if (picking.kind === 'heroes') d.heroId = id
    else if (picking.kind === 'spells') d.spellIds[picking.index] = id
    else d.deckIds[picking.index] = id
    applyDeck(d, slot); setPicking(null)
  }

  const hero = heroById(heroId) ?? null
  const spells = spellIds.map((id) => spellById(id)).filter((s): s is NonNullable<typeof s> => !!s)
  const deckTowers = deckIds.map((id) => towerById(id)).filter((t): t is TowerDef => !!t)

  const placements: Placement[] = useMemo(() => MAP.spots.flatMap((sp) => {
    const st = spots[sp.id]
    const tower = st?.towerId ? deckTowers.find((t) => t.id === st.towerId) : undefined
    if (!tower || !tower.tiers[st.tier]) return []
    const rally = tower.kind === 'barracks' ? (st.rally ?? nearestOnRoute(sp)) : undefined
    return [{ spotId: sp.id, tower, tier: st.tier, skills: st.skills, rally }]
  }), [spots, deckTowers])

  const mods = useMemo(
    () => collectMods([...(hero ? [hero.perks] : []), ...spells.map((s) => s.perks), ...deckTowers.map((t) => t.perks)]),
    [hero, spells, deckTowers],
  )
  const build: Build = { hero, heroPos, spells, placements }
  const result = useMemo(
    () => simulate({ map: MAP, boss: BOSS, bossEnters: BOSS_ENTERS_SEC, creeps: CREEP_SETS[creepSet], build, mods }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creepSet, heroId, spellIds.join(), deckIds.join(), JSON.stringify(spots), heroPos.x, heroPos.y, mods],
  )

  const total = Object.values(result.bossDamageBy).reduce((a, b) => a + b, 0)
  const onField = Math.max(0.1, (result.killTime ?? result.crossedAt ?? result.endTime) - BOSS_ENTERS_SEC)
  const headline = result.killTime !== null ? `Boss killed at ${result.killTime.toFixed(1)} s`
    : result.crossedAt !== null ? `Boss crossed the line at ${result.crossedAt.toFixed(1)} s (not killed)` : `Time ran out: ${fmt(result.bossHpLeft)} HP left`
  const peak = Math.max(0, ...result.timeline.map((p) => p.dps))
  const explorer = useMemo(() => {
    const pts = []
    for (let s = 0; s <= path.length; s += 5) pts.push({ s, ...dpsAt(s, MAP, path, placements, mods) })
    return pts
  }, [placements, mods])
  const here = dpsAt(exploreS, MAP, path, placements, mods)
  const scrubPoint = result.timeline.find((p) => p.t === scrub) ?? result.timeline.at(-1)

  let gold = 0, unknownCosts = 0
  for (const pl of placements) {
    const c = pl.tower.tiers[pl.tier]?.cost
    if (c == null) unknownCosts++; else gold += c
    for (const sid of pl.skills) { const k = pl.tower.skills.find((s) => s.id === sid)?.cost; if (k == null) unknownCosts++; else gold += k }
  }

  const setSpot = (id: string, patch: Partial<Spot>) => setSpots((s) => ({ ...s, [id]: { ...s[id], ...patch } }))
  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!placing) return
    const r = e.currentTarget.getBoundingClientRect()
    const p = { x: ((e.clientX - r.left) / r.width) * MAP.width, y: ((e.clientY - r.top) / r.height) * MAP.height }
    if (placing === 'hero') setHeroPos(p)
    else setSpot(placing, { rally: p })
    setPlacing(null)
  }

  return (
    <div className="wrap">
      <div>
        <h1>KR Battles — Kingdom Wars boss simulator</h1>
        <div className="warn">
          Map, creep counts/HP and cards come from your data. Creep speed, damage and route split, the creep spawn spacing, blocking capacity (1 enemy per unit),
          unit respawn and hero reach are <b>assumptions</b>; skills the library can't fully describe are listed under “Not simulated”. Validate against a real run before trusting rankings.
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <div className="big">{headline}</div>
          <div className="stats">
            <span>Avg boss DPS <b>{fmt(total / onField)}</b></span>
            <span>Peak 1-s DPS <b>{fmt(peak)}</b></span>
            <span>Boss HP <b>{fmt(BOSS.hp)}</b></span>
            <span>Boss on field <b>{onField.toFixed(1)} s</b></span>
            <span>Gold spent <b>{fmt(gold)}</b>{unknownCosts ? ` (+${unknownCosts} unknown costs)` : ''}</span>
            <span>Creeps killed <b>{result.creepsKilled}/{result.creepsSpawned}</b></span>
          </div>
          <label>Boss HP over time</label>
          <Chart data={result.timeline.map((p) => ({ x: p.t, y: p.bossHp }))} color="#e5484d" />
          <label>Damage to boss per second</label>
          <Chart data={result.timeline.map((p) => ({ x: p.t, y: p.dps }))} color="#4ac36b" bars />
        </div>

        <h2>Map {placing && <span style={{ color: '#f5a524' }}>— click the map to place {placing === 'hero' ? 'the hero' : `the rally point of spot ${placing}`}</span>}</h2>
        <div className="panel">
          <svg viewBox={`0 0 ${MAP.width} ${MAP.height}`} style={{ maxWidth: 440, margin: '0 auto', cursor: placing ? 'crosshair' : 'default' }} onClick={onMapClick}>
            {MAP.routes.map((r) => (
              <polyline key={r.id} points={r.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={r.color}
                strokeWidth={r.id === 'r1' ? 7 : 3} strokeDasharray={r.id === 'r1' ? undefined : '10 7'} strokeLinejoin="round" opacity={r.id === 'r1' ? 0.9 : 0.6} />
            ))}
            {MAP.spots.map((sp) => {
              const pl = placements.find((p) => p.spotId === sp.id)
              const td = pl?.tower.tiers[pl.tier]
              const range = pl && td ? (pl.tower.kind === 'shooter' ? shooterStats(pl.tower, td, mods).range : RALLY_RANGE) : 0
              return (
                <g key={sp.id}>
                  {pl && <circle cx={sp.x} cy={sp.y} r={range} fill="rgba(80,160,255,.08)" stroke="rgba(80,160,255,.45)" />}
                  {pl && iconUrl('towers', pl.tower.id)
                    ? <>
                        <image href={iconUrl('towers', pl.tower.id)!} x={sp.x - 20} y={sp.y - 20} width={40} height={40} />
                        <circle cx={sp.x - 16} cy={sp.y - 16} r={9} fill="#14161a" stroke="#fff" strokeWidth={1.5} />
                        <text x={sp.x - 16} y={sp.y - 12} fontSize="11" fill="#fff" textAnchor="middle" fontWeight="bold">{sp.id}</text>
                      </>
                    : <>
                        <circle cx={sp.x} cy={sp.y} r={13} fill={pl ? '#3b6fd4' : '#444'} />
                        <text x={sp.x} y={sp.y + 5} fontSize="15" fill="#fff" textAnchor="middle" fontWeight="bold">{sp.id}</text>
                      </>}
                  {pl?.rally && <g><line x1={sp.x} y1={sp.y} x2={pl.rally.x} y2={pl.rally.y} stroke="#4ac36b" strokeDasharray="4 3" /><circle cx={pl.rally.x} cy={pl.rally.y} r={7} fill="#4ac36b" /></g>}
                </g>
              )
            })}
            {hero && (iconUrl('heroes', hero.id)
              ? <g><circle cx={heroPos.x} cy={heroPos.y} r={21} fill="#e5b93c" /><image href={iconUrl('heroes', hero.id)!} x={heroPos.x - 18} y={heroPos.y - 18} width={36} height={36} /></g>
              : <g><circle cx={heroPos.x} cy={heroPos.y} r={10} fill="#e5b93c" /><text x={heroPos.x} y={heroPos.y + 4} fontSize="11" textAnchor="middle" fontWeight="bold">H</text></g>)}
            {scrubPoint?.bossS != null
              ? (() => { const b = pointAt(path, scrubPoint.bossS); return <circle cx={b.x} cy={b.y} r={11} fill="#d84a4a" stroke="#fff" strokeWidth={2} /> })()
              : null}
          </svg>
          <label>Replay: boss position at {scrub} s</label>
          <input type="range" min={0} max={Math.max(1, result.timeline.at(-1)?.t ?? 1)} value={scrub} onChange={(e) => setScrub(+e.target.value)} />
        </div>

        <h2>Damage to the boss, by source</h2>
        <div className="panel">
          <table><tbody>
            {Object.entries(result.bossDamageBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <tr key={k}><td>{k}</td><td>{fmt(v)}</td><td>{((v / Math.max(1, total)) * 100).toFixed(1)}%</td><td>{fmt(v / onField)}/s</td></tr>
            ))}
            {total === 0 && <tr><td>nothing hit the boss</td></tr>}
          </tbody></table>
        </div>

        <h2>Path explorer — sustained DPS if the boss stood at one point</h2>
        <div className="panel">
          <label>Boss position {Math.round(exploreS)} / {Math.round(path.length)} → {fmt(here.dps)} DPS from {here.shooters} shooter(s){here.blocked ? ', blocked by barracks' : ''}</label>
          <input type="range" min={0} max={Math.round(path.length)} value={exploreS} onChange={(e) => setExploreS(+e.target.value)} />
          <Chart data={explorer.map((p) => ({ x: (p.s / path.length) * FIGHT_SECONDS, y: p.dps }))} color="#4a9eff" />
          <div style={{ fontSize: '.8rem', color: '#9aa' }}>Ignores creeps and spells. Peak {fmt(Math.max(0, ...explorer.map((p) => p.dps)))} DPS.</div>
        </div>
      </div>

      <div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Deck</h2>
          <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => <button key={n} className={'mini' + (slot === n ? ' on' : '')} onClick={() => switchSlot(n)}>{n}</button>)}
            <span style={{ fontSize: '.72rem', color: '#9aa' }}>deck slot (saved in this browser)</span>
          </div>
          <div className="deckgrid">
            <Tile kind="heroes" id={heroId} label="hero" onClick={() => setPicking({ kind: 'heroes', index: 0 })} />
            {spellIds.map((id, i) => <Tile key={'s' + i} kind="spells" id={id} label={`spell ${i + 1}`} onClick={() => setPicking({ kind: 'spells', index: i })} />)}
            {deckIds.map((id, i) => <Tile key={'t' + i} kind="towers" id={id} label={`tower ${i + 1}`} onClick={() => setPicking({ kind: 'towers', index: i })} />)}
          </div>
          <div className="row"><button className="mini" onClick={() => setPlacing(placing === 'hero' ? null : 'hero')}>{placing === 'hero' ? 'cancel' : 'place hero on map'}</button></div>
          {picking && <Picker kind={picking.kind} current={picking.kind === 'heroes' ? heroId : picking.kind === 'spells' ? spellIds[picking.index] : deckIds[picking.index]} onPick={pickCard} onClose={() => setPicking(null)} />}
          <label>Wave set</label>
          <select value={creepSet} onChange={(e) => setCreepSet(e.target.value as 'A' | 'B')}><option value="A">Set A</option><option value="B">Set B</option></select>
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>Build (spots)</h2>
          {MAP.spots.map((sp) => {
            const st = spots[sp.id]
            const tower = st.towerId ? deckTowers.find((t) => t.id === st.towerId) : undefined
            return (
              <div key={sp.id} className="spot">
                <label className="spotlabel">{tower && <Icon kind="towers" id={tower.id} size={26} />}Spot {sp.id}{tower ? ` · ${tower.name}` : ''}</label>
                <select value={tower ? tower.id : ''} onChange={(e) => setSpot(sp.id, { towerId: e.target.value || null, skills: [], rally: undefined })}>
                  <option value="">— empty —</option>
                  {deckTowers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {tower && (
                  <>
                    <div className="row">
                      {TIERS.map((t) => (
                        <button key={t} className={'mini' + (st.tier === t ? ' on' : '')} disabled={!tower.tiers[t]} onClick={() => setSpot(sp.id, { tier: t })}>
                          T{t}{tower.tiers[t]?.cost != null ? ` · ${tower.tiers[t]!.cost}g` : ''}
                        </button>
                      ))}
                      {tower.kind === 'barracks' && <button className="mini" onClick={() => setPlacing(placing === sp.id ? null : sp.id)}>{placing === sp.id ? 'cancel' : 'set rally'}</button>}
                    </div>
                    {tower.skills.map((s) => (
                      <label key={s.id} className="chk" title={s.supported ? '' : s.why}>
                        <input type="checkbox" checked={st.skills.includes(s.id)} onChange={(e) => setSpot(sp.id, { skills: e.target.checked ? [...st.skills, s.id] : st.skills.filter((x) => x !== s.id) })} />
                        <span style={{ opacity: s.supported ? 1 : 0.5 }}>{s.name}{s.cost != null ? ` · ${s.cost}g` : ''}{s.supported ? '' : ' (not simulated)'}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>Deck perks applied</h2>
          <div style={{ fontSize: '.8rem' }}>
            {[...(hero ? hero.perks : []), ...spells.flatMap((s) => s.perks), ...deckTowers.flatMap((t) => t.perks)].filter((p) => p.pct !== null && p.stat && p.target !== 'enemies').map((p, i) => (
              <div key={i}>{p.name}: {p.pct! > 0 ? '+' : ''}{p.pct}% {p.stat} ({p.target}){p.inferred ? ' *' : ''}</div>
            ))}
            {mods.ignored.length > 0 && <div style={{ color: '#9aa', marginTop: 6 }}>Not applied: {[...new Set(mods.ignored.map((m) => `${m.perk} (${m.why})`))].join('; ')}</div>}
            <div style={{ color: '#9aa', marginTop: 6 }}>* value inferred from another card with the same perk name</div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>Not simulated for this build</h2>
          <div style={{ fontSize: '.8rem', color: '#e0b060' }}>
            {result.notes.length ? result.notes.map((n, i) => <div key={i}>{n}</div>) : <span style={{ color: '#9aa' }}>nothing flagged</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
