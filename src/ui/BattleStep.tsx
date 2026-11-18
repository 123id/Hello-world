import { useRef, useState, type ReactNode } from 'react'
import { iconUrl } from '../data/icons'
import { RALLY_RANGE, shooterStats, type Placement } from '../sim/engine'
import { dist, pointAt } from '../sim/geometry'
import { TIERS, type HeroDef, type TowerDef } from '../sim/library'
import type { Mods } from '../sim/perks'
import type { Pt } from '../sim/types'
import { Card, Sheet } from './common'
import { useLongPressDrag, type DragHandlers } from './drag'
import { Gold } from './icons'
import { MAP, PATH, clampRally, type Placing, type Spot, type Spots } from './state'

/** An SVG group that can be tapped, or held and dragged. */
function DragG({ h, children, style }: { h: DragHandlers; children: ReactNode; style?: React.CSSProperties }) {
  const hs = useLongPressDrag(h)
  return <g {...hs} style={{ cursor: h.enabled === false ? 'pointer' : 'grab', ...style }}>{children}</g>
}

interface Props {
  hero: HeroDef | null; heroPos: Pt; spots: Spots; placements: Placement[]; deckTowers: TowerDef[]; mods: Mods
  bossS: number | null
  selected: string | null; setSelected: (id: string | null) => void
  placing: Placing; setPlacing: (p: Placing) => void
  setHeroPos: (p: Pt) => void; setSpot: (id: string, patch: Partial<Spot>) => void; moveTower: (from: string, to: string) => void
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

  const [towerDrag, setTowerDrag] = useState<{ from: string; pt: Pt; to: string | null } | null>(null)
  const toMap = (cx: number, cy: number): Pt => {
    const r = svg.current!.getBoundingClientRect()
    return { x: ((cx - r.left) / r.width) * MAP.width, y: ((cy - r.top) / r.height) * MAP.height }
  }
  const nearestSpot = (pt: Pt, max = 80): string | null => {
    let best: string | null = null, bd = max
    for (const sp of MAP.spots) { const d = dist(pt, sp); if (d < bd) { bd = d; best = sp.id } }
    return best
  }
  const placeAt = (pt: Pt) => {
    if (!p.placing) return
    if (p.placing === 'hero') p.setHeroPos(pt)
    else {
      const spot = MAP.spots.find((s) => s.id === (p.placing as { rally: string }).rally)
      p.setSpot((p.placing as { rally: string }).rally, { rally: spot ? clampRally(spot, pt) : pt })
    }
    p.setPlacing(null)
  }
  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => { if (p.placing && svg.current) placeAt(toMap(e.clientX, e.clientY)) }

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
          : <div className="hint">Tap a stump to build on it. Hold a tower, then drag it onto another stump to move or swap it. Drag your hero and the green rally dots the same way.</div>}

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
            const lifted = towerDrag?.from === sp.id
            const target = towerDrag?.to === sp.id && towerDrag.from !== sp.id
            return (
              <DragG key={sp.id} style={{ opacity: lifted ? 0.35 : 1 }} h={{
                enabled: !!pl && !p.placing,
                onTap: (x, y) => { if (p.placing) placeAt(toMap(x, y)); else p.setSelected(sp.id) },
                onStart: (x, y) => setTowerDrag({ from: sp.id, pt: toMap(x, y), to: null }),
                onMove: (x, y) => setTowerDrag((d) => { if (!d) return d; const pt = toMap(x, y); return { ...d, pt, to: nearestSpot(pt) } }),
                onEnd: (x, y) => { const to = nearestSpot(toMap(x, y)); if (to && to !== sp.id) p.moveTower(sp.id, to); setTowerDrag(null) },
                onCancel: () => setTowerDrag(null),
              }}>
                <circle cx={sp.x} cy={sp.y} r={38} fill="transparent" />
                {isSel && <circle cx={sp.x} cy={sp.y} r={34} fill="none" stroke="#ffcf3f" strokeWidth={4} />}
                {target && <circle cx={sp.x} cy={sp.y} r={40} fill="rgba(95,226,138,.2)" stroke="#5fe28a" strokeWidth={4} strokeDasharray="6 5" />}
                {pl && (url
                  ? <image href={url} x={sp.x - 32} y={sp.y - 32} width={64} height={64} />
                  : <g><rect x={sp.x - 28} y={sp.y - 28} width={56} height={56} rx={14} fill="#244b95" stroke="#fff" strokeWidth={2} strokeDasharray="5 4" />
                      <text x={sp.x} y={sp.y + 7} fontSize="20" fill="#fff" textAnchor="middle" fontWeight="bold">{pl.tower.id.split('-').slice(0, 2).map((w) => w[0].toUpperCase()).join('')}</text></g>)}
                {pl && <g><circle cx={sp.x + 28} cy={sp.y - 28} r={12} fill="#0b1a3a" stroke="#ffcf3f" strokeWidth={2} /><text x={sp.x + 28} y={sp.y - 23} fontSize="14" fill="#ffcf3f" textAnchor="middle" fontWeight="bold">{pl.tier}</text></g>}
              </DragG>
            )
          })}
          {/* rally points of barracks: drag them */}
          {p.placements.filter((pl) => pl.tower.kind === 'barracks' && pl.rally).map((pl) => {
            const sp = MAP.spots.find((x) => x.id === pl.spotId)!
            return (
              <g key={'r' + pl.spotId}>
                <line x1={sp.x} y1={sp.y} x2={pl.rally!.x} y2={pl.rally!.y} stroke="#5fe28a" strokeWidth={3} strokeDasharray="5 4" opacity={0.8} />
                <DragG h={{ onTap: () => p.setSelected(pl.spotId), onMove: (x, y) => p.setSpot(pl.spotId, { rally: clampRally(sp, toMap(x, y)) }) }}>
                  <circle cx={pl.rally!.x} cy={pl.rally!.y} r={22} fill="transparent" />
                  <circle cx={pl.rally!.x} cy={pl.rally!.y} r={9} fill="#5fe28a" stroke="#fff" strokeWidth={2} />
                </DragG>
              </g>
            )
          })}
          {p.hero && (
            <DragG h={{ onTap: () => p.setPlacing('hero'), onMove: (x, y) => p.setHeroPos(toMap(x, y)) }}>
              <circle cx={p.heroPos.x} cy={p.heroPos.y} r={32} fill="#ffcf3f" stroke="#fff" strokeWidth={3} />
              {iconUrl('heroes', p.hero.id) && <image href={iconUrl('heroes', p.hero.id)!} x={p.heroPos.x - 28} y={p.heroPos.y - 28} width={56} height={56} />}
            </DragG>
          )}
          {towerDrag && (() => {
            const pl = p.placements.find((x) => x.spotId === towerDrag.from)
            const url = pl ? iconUrl('towers', pl.tower.id) : null
            return url ? <image href={url} x={towerDrag.pt.x - 36} y={towerDrag.pt.y - 36} width={72} height={72} style={{ pointerEvents: 'none' }} opacity={0.9} /> : null
          })()}
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
                    LVL{t}{selTower.tiers[t]?.cost != null ? <> · <Gold n={selTower.tiers[t]!.cost!} size={14} /></> : null}
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
                  <span style={{ opacity: s.supported ? 1 : 0.5 }}>{s.name}{s.cost != null ? <> · <Gold n={s.cost} size={14} /></> : null}{s.supported ? '' : ' (not simulated)'}</span>
                </label>
              ))}
            </>
          )}
        </Sheet>
      )}
    </>
  )
}
