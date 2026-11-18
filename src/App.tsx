import { useMemo, useState } from 'react'
import { BOSS, HEROES, MAP, SPELLS, TOWERS } from './data/placeholder'
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
  const [bossS, setBossS] = useState(200)

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
          All card, boss and map numbers are PLACEHOLDERS. Results are meaningless until real data is loaded.
        </div>
        <h2>Map</h2>
        <div className="panel">
          <svg viewBox={`0 0 ${MAP.width} ${MAP.height}`}>
            {MAP.image && <image href={MAP.image} width={MAP.width} height={MAP.height} />}
            <polyline points={MAP.path.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#6b5b3a" strokeWidth="14" strokeLinejoin="round" />
            {MAP.spots.map((sp) => {
              const c = cards[layout.spots[sp.id] ?? '']
              const r = c?.kind === 'shooter' ? c.range : c?.range
              return (
                <g key={sp.id}>
                  {c && <circle cx={sp.x} cy={sp.y} r={r} fill="rgba(80,160,255,.08)" stroke="rgba(80,160,255,.4)" />}
                  <circle cx={sp.x} cy={sp.y} r={9} fill={c ? '#3b6fd4' : '#444'} />
                  <text x={sp.x} y={sp.y - 13} fontSize="11" fill="#ccc" textAnchor="middle">{sp.id}{c ? `: ${c.name}` : ''}</text>
                  {c?.kind === 'barracks' && (() => { const rp = pointAt(path, layout.rally[sp.id] ?? 0); return <circle cx={rp.x} cy={rp.y} r={6} fill="#4ac36b" /> })()}
                </g>
              )
            })}
            {(() => { const hp = pointAt(path, layout.heroS); return <circle cx={hp.x} cy={hp.y} r={7} fill="#e5b93c" /> })()}
            <circle cx={bp.x} cy={bp.y} r={10} fill="#d84a4a" />
          </svg>
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
