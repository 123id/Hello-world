import { useRef } from 'react'
import { iconUrl } from '../data/icons'
import { RALLY_RANGE, shooterStats, type Placement } from '../sim/engine'
import { dist, pointAt } from '../sim/geometry'
import { TIERS, type HeroDef, type TowerDef } from '../sim/library'
import type { Mods } from '../sim/perks'
import type { Pt } from '../sim/types'
import { Card, Sheet } from './common'
import { MAP, PATH, type Placing, type Spot, type Spots } from './state'

interface Props {
  hero: HeroDef | null; heroPos: Pt; spots: Spots; placements: Placement[]; deckTowers: TowerDef[]; mods: Mods
  bossS: number | null
  selected: string | null; setSelected: (id: string | null) => void
  placing: Placing; setPlacing: (p: Placing) => void
  setHeroPos: (p: Pt) => void; setSpot: (id: string, patch: Partial<Spot>) => void
  onAutoPlace: () => void; onClear: () => void
  scrub: number; setScrub: (n: number) => void; maxScrub: number
  routes: 'off' | 'boss' | 'all'; setRoutes: (m: 'off' | 'boss' | 'all') => void
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const BASE = import.meta.env.BASE_URL

export function BattleStep(p: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const sel = p.selected ? p.spots[p.selected] : null
  const selTower = sel?.towerId ? p.deckTowers.find((t) => t.id === sel.towerId) : undefined
  const selPlacement = p.selected ? p.placements.find((x) => x.spotId === p.selected) : undefined

  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!p.placing || !svg.current) return
    const r = svg.current.getBoundingClientRect()
    const pt = { x: ((e.clientX - r.left) / r.width) * MAP.width, y: ((e.clientY - r.top) / r.height) * MAP.height }
    if (p.placing === 'hero') p.setHeroPos(pt)
    else {
      const spot = MAP.spots.find((s) => s.id === (p.placing as { rally: string }).rally)
      let q = pt
      if (spot) { const d = dist(pt, spot); if (d > RALLY_RANGE) q = { x: spot.x + ((pt.x - spot.x) * RALLY_RANGE) / d, y: spot.y + ((pt.y - spot.y) * RALLY_RANGE) / d } }
      p.setSpot((p.placing as { rally: string }).rally, { rally: q })
    }
    p.setPlacing(null)
  }

  const bossPt = p.bossS != null ? pointAt(PATH, p.bossS) : null
  const placingText = p.placing === 'hero' ? 'Tap the map to place your hero' : p.placing ? `Tap the map to set the rally point (within the ring) for spot ${p.placing.rally}` : null

  return (
    <>
      <section className="panel">
        <div className="panelhead">
          <h2>Place towers</h2>
          <div className="row">
            <button className="btn small" onClick={p.onAutoPlace}>Auto-place</button>
            <button className="btn small" onClick={p.onClear}>Clear</button>
          </div>
        </div>
        {placingText
          ? <div className="banner">{placingText} <button className="btn small" onClick={() => p.setPlacing(null)}>Cancel</button></div>
          : <div className="hint">Tap a numbered stump to build on it. Tap your hero to move them.</div>}

        <svg ref={svg} viewBox={`0 0 ${MAP.width} ${MAP.height}`} className="map" style={{ cursor: p.placing ? 'crosshair' : 'default' }} onClick={onMapClick}>
          <image href={`${BASE}map.webp`} width={MAP.width} height={MAP.height} />
          {p.routes !== 'off' && MAP.routes.filter((r) => p.routes === 'all' || r.id === 'r1').map((r) => (
            <polyline key={r.id} points={r.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={r.color} strokeLinejoin="round"
              strokeWidth={r.id === 'r1' ? 5 : 3} strokeDasharray="10 8" opacity={r.id === 'r1' ? 0.75 : 0.6} />
          ))}
          {/* range ring of the selected spot */}
          {selPlacement && (() => {
            const sp = MAP.spots.find((s) => s.id === selPlacement.spotId)!
            const td = selPlacement.tower.tiers[selPlacement.tier]
            const r = selPlacement.tower.kind === 'shooter' && td ? shooterStats(selPlacement.tower, td, p.mods).range : RALLY_RANGE
            return <circle cx={sp.x} cy={sp.y} r={r} fill="rgba(255,207,63,.12)" stroke="#ffcf3f" strokeWidth={3} strokeDasharray="8 6" />
          })()}
          {MAP.spots.map((sp) => {
            const pl = p.placements.find((x) => x.spotId === sp.id)
            const url = pl ? iconUrl('towers', pl.tower.id) : null
            const isSel = p.selected === sp.id
            return (
              <g key={sp.id} onClick={(e) => { e.stopPropagation(); if (p.placing) { onMapClick(e as unknown as React.MouseEvent<SVGSVGElement>); return } p.setSelected(sp.id) }} style={{ cursor: 'pointer' }}>
                <circle cx={sp.x} cy={sp.y} r={38} fill="transparent" />
                {isSel && <circle cx={sp.x} cy={sp.y} r={34} fill="none" stroke="#ffcf3f" strokeWidth={4} />}
                {pl && (url
                  ? <image href={url} x={sp.x - 32} y={sp.y - 32} width={64} height={64} />
                  : <g><rect x={sp.x - 28} y={sp.y - 28} width={56} height={56} rx={14} fill="#244b95" stroke="#fff" strokeWidth={2} strokeDasharray="5 4" />
                      <text x={sp.x} y={sp.y + 7} fontSize="20" fill="#fff" textAnchor="middle" fontWeight="bold">{pl.tower.id.split('-').slice(0, 2).map((w) => w[0].toUpperCase()).join('')}</text></g>)}
                {pl && pl.tower.kind === 'barracks' && pl.rally && isSel && <g><line x1={sp.x} y1={sp.y} x2={pl.rally.x} y2={pl.rally.y} stroke="#5fe28a" strokeWidth={3} strokeDasharray="5 4" /><circle cx={pl.rally.x} cy={pl.rally.y} r={9} fill="#5fe28a" stroke="#fff" strokeWidth={2} /></g>}
                {pl && <g><circle cx={sp.x + 28} cy={sp.y - 28} r={12} fill="#0b1a3a" stroke="#ffcf3f" strokeWidth={2} /><text x={sp.x + 28} y={sp.y - 23} fontSize="14" fill="#ffcf3f" textAnchor="middle" fontWeight="bold">{pl.tier}</text></g>}
              </g>
            )
          })}
          {p.hero && (
            <g onClick={(e) => { e.stopPropagation(); p.setPlacing('hero') }} style={{ cursor: 'pointer' }}>
              <circle cx={p.heroPos.x} cy={p.heroPos.y} r={32} fill="#ffcf3f" stroke="#fff" strokeWidth={3} />
              {iconUrl('heroes', p.hero.id) && <image href={iconUrl('heroes', p.hero.id)!} x={p.heroPos.x - 28} y={p.heroPos.y - 28} width={56} height={56} />}
            </g>
          )}
          {bossPt && <g><circle cx={bossPt.x} cy={bossPt.y} r={16} fill="#ff4d4d" stroke="#fff" strokeWidth={3} /><text x={bossPt.x} y={bossPt.y + 5} fontSize="14" fill="#fff" textAnchor="middle" fontWeight="bold">B</text></g>}
        </svg>

        <div className="row" style={{ marginTop: 8 }}>
          <button className={'btn small' + (p.routes !== 'off' ? ' on' : '')} onClick={() => p.setRoutes(p.routes === 'off' ? 'boss' : p.routes === 'boss' ? 'all' : 'off')}>Routes: {p.routes === 'boss' ? 'boss only' : p.routes}</button>
          <button className="btn small" onClick={() => p.setPlacing('hero')}>Place hero</button>
        </div>
        <label className="lab">Replay: boss at {mmss(p.scrub)}</label>
        <input type="range" min={0} max={Math.max(1, p.maxScrub)} value={p.scrub} onChange={(e) => p.setScrub(+e.target.value)} />
      </section>

      {p.selected && !p.placing && sel && (
        <Sheet title={`Spot ${p.selected}`} onClose={() => p.setSelected(null)}>
          <div className="hint">Choose a tower from your deck:</div>
          <div className="deckgrid">
            {p.deckTowers.map((t) => (
              <Card key={t.id} kind="towers" id={t.id} sel={sel.towerId === t.id} pill={t.kind === 'barracks' ? 'barracks' : t.cls}
                onClick={() => p.setSpot(p.selected!, { towerId: sel.towerId === t.id ? null : t.id, skills: [], rally: undefined })} />
            ))}
          </div>
          {selTower && (
            <>
              <div className="hint" style={{ marginTop: 10 }}>Level</div>
              <div className="seg">
                {TIERS.map((t) => (
                  <button key={t} className={sel.tier === t ? 'on' : ''} disabled={!selTower.tiers[t]} onClick={() => p.setSpot(p.selected!, { tier: t })}>
                    LVL{t}{selTower.tiers[t]?.cost != null ? ` · ${selTower.tiers[t]!.cost}g` : ''}
                  </button>
                ))}
              </div>
              {selTower.kind === 'barracks' && (
                <button className="btn wide" style={{ marginTop: 10 }} onClick={() => p.setPlacing({ rally: p.selected! })}>Set rally point on the map</button>
              )}
              <div className="hint" style={{ marginTop: 10 }}>Skills you bought (greyed = not simulated yet)</div>
              {selTower.skills.map((s) => (
                <label key={s.id} className="chk" title={s.supported ? '' : s.why}>
                  <input type="checkbox" checked={sel.skills.includes(s.id)} onChange={(e) => p.setSpot(p.selected!, { skills: e.target.checked ? [...sel.skills, s.id] : sel.skills.filter((x) => x !== s.id) })} />
                  <span style={{ opacity: s.supported ? 1 : 0.5 }}>{s.name}{s.cost != null ? ` · ${s.cost}g` : ''}{s.supported ? '' : ' (not simulated)'}</span>
                </label>
              ))}
            </>
          )}
        </Sheet>
      )}
    </>
  )
}
