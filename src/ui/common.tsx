import type { ReactNode } from 'react'
import type React from 'react'
import { iconUrl, type CardKind } from '../data/icons'
import { FIGHT_SECONDS } from '../sim/types'
import type { useLongPressDrag } from './drag'
import { ClassIcon, type DmgClass } from './icons'
import { listOf } from './state'

export function Icon({ kind, id, size = 32 }: { kind: CardKind; id: string; size?: number }) {
  const u = iconUrl(kind, id)
  if (u) return <img src={u} width={size} height={size} alt="" draggable={false} style={{ objectFit: 'contain', flex: 'none' }} />
  const initials = id.split('-').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  return <span className="noicon" style={{ width: size, maxWidth: '100%', aspectRatio: '1', fontSize: size * 0.32 }}>{initials}</span>
}

/** A card like in the game: the icon, a small name, and a pill with its DPS (the game shows upgrade progress there). */
export function Card({ kind, id, pill, tone, cls, onClick, sel, drag, drop, dragging, over, badge, dim, tag, glow, hideName }: {
  kind: CardKind; id: string; pill?: string; tone?: 'good' | 'off' | 'warn'; cls?: DmgClass | null; onClick?: () => void; sel?: boolean
  drag?: ReturnType<typeof useLongPressDrag>; drop?: string; dragging?: boolean; over?: boolean; badge?: { text: string; title: string; tone?: 'ok' | 'warn' }
  dim?: boolean; tag?: string; glow?: boolean; hideName?: boolean
}) {
  const c = listOf(kind).find((x) => x.id === id)
  const handlers = drag ? { ...drag, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } } : { onClick }
  return (
    <button className={'card' + (sel ? ' sel' : '') + (dragging ? ' dragging' : '') + (over ? ' over' : '') + (dim ? ' dim' : '') + (glow ? ' glow' : '') + (drag ? ' draggable' : '')} data-drop={drop} title={c?.name} {...handlers}>
      <span className="cardimg"><Icon kind={kind} id={id} size={84} />{badge && <span className={'badge ' + (badge.tone ?? '')} title={badge.title}>{badge.text}</span>}{tag && <span className="tag-level">{tag}</span>}</span>
      {!hideName && <span className="cardname">{c?.name ?? id}</span>}
      {pill !== undefined && pill !== '' && <span className={'pill ' + (tone ?? '')}>{cls && <ClassIcon cls={cls} size={13} />}{pill}</span>}
    </button>
  )
}

export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}> {/* press outside closes; a stray click after the touch that opened it must not */}
      <div className="sheet">
        <div className="sheethead"><b>{title}</b><button className="btn small" onClick={onClose}>Done</button></div>
        <div className="sheetbody">{children}</div>
      </div>
    </div>
  )
}

export function Chart({ data, h = 90, color, bars }: { data: { x: number; y: number }[]; h?: number; color: string; bars?: boolean }) {
  const maxY = Math.max(1, ...data.map((d) => d.y))
  return (
    <svg viewBox={`0 0 ${FIGHT_SECONDS} ${h}`} preserveAspectRatio="none" className="chart" style={{ height: h }}>
      {bars
        ? data.map((d) => <rect key={d.x} x={d.x} y={h - (d.y / maxY) * (h - 4)} width={0.9} height={(d.y / maxY) * (h - 4)} fill={color} />)
        : <polyline fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" points={data.map((d) => `${d.x},${h - (d.y / maxY) * (h - 4)}`).join(' ')} />}
    </svg>
  )
}
