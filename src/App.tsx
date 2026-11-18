import { useMemo, useState } from 'react'
import { HEROES, SPELLS, TOWERS } from './data/placeholder'
import { BOSS_ENTERS_SEC, BOSS_KW as BOSS, CREEP_SETS, MAP_KW as MAP } from './data/kingdomwars'
import { dpsAt } from './sim/explorer'
import { buildPath, pointAt } from './sim/geometry'
import { simulate } from './sim/engine'
import type { Layout, TowerCard } from './sim/types'

const path = buildPath(MAP.path)
const cards: Record<string, TowerCard> = Object.fromEntries(TOWERS.map((t) => [t.id, t]))
const STEP = 5

export function App() {
  const [layout, setLayout] = useState<Layout>({
    spots: Object.fromEntries(MAP.spots.map((s) => [s.id, null])),
    rally: Object.fromEntries(MAP.spots.map((s) => [s.id, 0])),
    heroS: 300,
  })
  const [bossS, setBossS] = useState(700)
  const [creepSet, setCreepSet] = useState<'A' | 'B'>('A')

  const deckTowers = useMemo(
    () => TOWERS.filter((t) => Object.values(layout.spots).includes(t.id)), [layout.spots])
  const towerCount = Object.values(layout.spots).filter(Boolean).length

  const curve = useMemo(() => {
    const pts = []
    for (let s = 0; s <= path.length; s += STEP) pts.push({ s, ...dpsAt(s, MAP, path, BOSS, layout, cards) })
    return pts
  }, [layout])
  const maxDps = Math.max(1, ...curve.map((p) => p.dps))
  const here = dpsAt(bossS, MAP, path, BOSS, layout, cards)
  const bp = pointAt(path, bossS)

  const result = useMemo(
    () => simulate(MAP, BOSS, { hero: HEROES[0], spells: SPELLS, towers: deckTowers }, layout),
    [layout, deckTowers])

  const setSpot = (id: string, card: string) =>
    setLayout((l) => ({ ...l, spots: { ...l.spots, [id]: card || null } }))

  return (
    <div className="wrap">
      <div>
        <h1>KR Battles — Boss Kill Calculator</h1>
        <div className="warn">
          Map and creep tables are real (from krb-deck screenshots). Tower, hero and spell numbers here are still
          PLACEHOLDERS, and creeps are not simulated yet, so results are meaningless until the real library is wired in.
        </div>
        <h2>Map</h2>
        <div className="panel">
          <svg viewBox={`0 0 ${MAP.width} ${MAP.height}`} style={{ maxWidth: 440, margin: '0 auto' }}>
            {MAP.image && <image href={MAP.image} width={MAP.width} height={MAP.height} />}
            {(MAP.routes ?? []).map((r) => (
              <polyline key={r.id} points={r.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={r.color}
                strokeWidth={r.id === 'r1' ? 7 : 3} strokeDasharray={r.id === 'r1' ? undefined : '10 7'} strokeLinejoin="round" opacity={r.id === 'r1' ? 0.9 : 0.7} />
            ))}
            {MAP.spots.map((sp) => {
              const c = cards[layout.spots[sp.id] ?? '']
              const r = c?.kind === 'shooter' ? c.range : c?.range
              return (
                <g key={sp.id}>
                  {c && <circle cx={sp.x} cy={sp.y} r={r} fill="rgba(80,160,255,.08)" stroke="rgba(80,160,255,.4)" />}
                  <circle cx={sp.x} cy={sp.y} r={13} fill={c ? '#3b6fd4' : '#444'} />
                  <text x={sp.x} y={sp.y + 5} fontSize="15" fill="#fff" textAnchor="middle" fontWeight="bold">{sp.id}</text>
                  {c?.kind === 'barracks' && (() => { const rp = pointAt(path, layout.rally[sp.id] ?? 0); return <circle cx={rp.x} cy={rp.y} r={6} fill="#4ac36b" /> })()}
                </g>
              )
            })}
            {(() => { const hp = pointAt(path, layout.heroS); return <circle cx={hp.x} cy={hp.y} r={7} fill="#e5b93c" /> })()}
            <circle cx={bp.x} cy={bp.y} r={10} fill="#d84a4a" />
          </svg>
        </div>

        <h2>Enemy wave (who enters)</h2>
        <div className="panel">
          <label>Wave set
            <select value={creepSet} onChange={(e) => setCreepSet(e.target.value as 'A' | 'B')}>
              <option value="A">Set A</option><option value="B">Set B</option>
            </select>
          </label>
          <div style={{ fontSize: '.8rem', color: '#9aa', margin: '4px 0' }}>Boss enters at {BOSS_ENTERS_SEC}s. Spawn schedule, creep speed and armor are not loaded yet.</div>
          <table><tbody>
            {CREEP_SETS[creepSet].map((c) => <tr key={c.name}><td>{c.name}{c.flying ? ' (flying)' : ''}</td><td>×{c.count}</td><td>from {c.firstSec}s</td><td>{c.hp} HP</td></tr>)}
          </tbody></table>
        </div>

        <h2>Path explorer — boss DPS taken along the path</h2>
        <div className="panel">
          <label>Boss position: {Math.round(bossS)} / {Math.round(path.length)} → {Math.round(here.dps)} DPS from {here.shooters} shooter(s){here.blocked ? ', BLOCKED by barracks' : ''}</label>
          <input type="range" min={0} max={Math.round(path.length)} value={bossS} onChange={(e) => setBossS(+e.target.value)} />
          <svg viewBox={`0 0 ${path.length} 100`} preserveAspectRatio="none" style={{ height: 100 }}>
            <polyline fill="none" stroke="#4ac36b" strokeWidth="2" vectorEffect="non-scaling-stroke"
              points={curve.map((p) => `${p.s},${100 - (p.dps / maxDps) * 95}`).join(' ')} />
            <line x1={bossS} x2={bossS} y1={0} y2={100} stroke="#d84a4a" vectorEffect="non-scaling-stroke" />
          </svg>
          <div style={{ fontSize: '.8rem', color: '#9aa' }}>Peak {Math.round(maxDps)} DPS at distance {curve.reduce((a, b) => (b.dps > a.dps ? b : a)).s}</div>
        </div>
      </div>

      <div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Layout</h2>
          <div style={{ fontSize: '.8rem', color: towerCount > 4 ? '#e66' : '#9aa' }}>{towerCount}/4 towers</div>
          {MAP.spots.map((sp) => {
            const c = cards[layout.spots[sp.id] ?? '']
            return (
              <div key={sp.id}>
                <label>Spot {sp.id}</label>
                <select value={layout.spots[sp.id] ?? ''} onChange={(e) => setSpot(sp.id, e.target.value)}>
                  <option value="">— empty —</option>
                  {TOWERS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {c?.kind === 'barracks' && (
                  <input type="range" min={0} max={Math.round(path.length)} value={layout.rally[sp.id] ?? 0}
                    onChange={(e) => setLayout((l) => ({ ...l, rally: { ...l.rally, [sp.id]: +e.target.value } }))} />
                )}
              </div>
            )
          })}
          <label>Hero position</label>
          <input type="range" min={0} max={Math.round(path.length)} value={layout.heroS}
            onChange={(e) => setLayout((l) => ({ ...l, heroS: +e.target.value }))} />
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>Simulation (3:00)</h2>
          <div>{result.killTime !== null ? `Boss killed at ${result.killTime.toFixed(1)}s` : result.reachedEnd ? `Boss crossed the line at ${result.endTime.toFixed(1)}s` : `Timed out, ${Math.round(result.bossHpLeft)} HP left`}</div>
          <table><tbody>
            {Object.entries(result.damageBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><td>{k}</td><td>{Math.round(v)}</td></tr>)}
          </tbody></table>
        </div>
      </div>
    </div>
  )
}
