import { useState } from 'react'
import type { Tier } from '../sim/library'
import { Card, Icon } from './common'
import { useLongPressDrag } from './drag'
import { Gold, type DmgClass } from './icons'
import { fmt } from './state'

export interface Pill { text: string; tone?: 'good' | 'off' | 'warn'; cls?: DmgClass | null }
export interface TierRow { tier: Tier; dps: number; kill: number | null; gold: number; unknown: number }
type Kind = 'heroes' | 'spells' | 'towers'

interface Props {
  slot: number; onSlot: (n: number) => void; onReset: () => void
  heroId: string; spellIds: string[]; deckIds: string[]
  pills: { hero: Pill; spells: Pill[]; towers: Pill[] }
  onInspect: (kind: Kind, index: number) => void
  onSwap: (kind: 'spells' | 'towers', from: number, to: number) => void
  tiers: TierRow[]; activeTier: Tier | null; onTier: (t: Tier) => void
  creepSet: 'A' | 'B'; setCreepSet: (s: 'A' | 'B') => void
  hasTowers: boolean; goBattle: () => void
}

interface DragState { kind: Kind; index: number; id: string; x: number; y: number; over: string | null }

const dropAt = (x: number, y: number): string | null => (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null

function DeckCard(props: {
  kind: Kind; index: number; id: string; pill: Pill; drag: DragState | null; setDrag: (d: DragState | null | ((d: DragState | null) => DragState | null)) => void
  onInspect: () => void; onSwap: (to: number) => void
}) {
  const { kind, index, id, pill, drag, setDrag } = props
  const handlers = useLongPressDrag({
    enabled: kind !== 'heroes', // there is only one hero, nothing to swap with
    onTap: props.onInspect,
    onStart: (x, y) => setDrag({ kind, index, id, x, y, over: null }),
    onMove: (x, y) => setDrag((d) => (d ? { ...d, x, y, over: dropAt(x, y) } : d)),
    onEnd: (x, y) => {
      const t = dropAt(x, y)?.split(':')
      if (t && t[0] === kind && +t[1] !== index) props.onSwap(+t[1])
      setDrag(null)
    },
    onCancel: () => setDrag(null),
  })
  const drop = `${kind}:${index}`
  const same = !!drag && drag.kind === kind
  return (
    <Card kind={kind} id={id} pill={pill.text} tone={pill.tone} cls={pill.cls} drag={handlers} drop={drop}
      dragging={drag?.kind === kind && drag.index === index} over={same && drag!.over === drop && drag!.index !== index} />
  )
}

export function DeckStep(p: Props) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const card = (kind: Kind, index: number, id: string, pill: Pill) => (
    <DeckCard key={kind + index} kind={kind} index={index} id={id} pill={pill} drag={drag} setDrag={setDrag}
      onInspect={() => p.onInspect(kind, index)} onSwap={(to) => kind !== 'heroes' && p.onSwap(kind, index, to)} />
  )
  return (
    <>
      <section className="panel">
        <div className="panelhead">
          <h2>Deck</h2>
          <button className="btn small" onClick={p.onReset}>Reset deck</button>
        </div>
        <div className="slots">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} className={'slot' + (p.slot === n ? ' on' : '')} onClick={() => p.onSlot(n)}>{n}</button>)}
          <span className="hint">deck slots, saved in this browser</span>
        </div>
        <div className="deckgrid">
          {card('heroes', 0, p.heroId, p.pills.hero)}
          {p.spellIds.map((id, i) => card('spells', i, id, p.pills.spells[i]))}
          {p.deckIds.map((id, i) => card('towers', i, id, p.pills.towers[i]))}
        </div>
        <div className="hint">Tap a card for its level, skills and coverage. Hold a card for a moment, then drag it onto another spell or tower to swap places. The pill is what the card adds against the boss; OFF means the simulator can't use it yet.</div>
      </section>

      <section className="panel">
        <h2>Tower level</h2>
        <div className="tiers">
          {p.tiers.map((r) => (
            <button key={r.tier} className={'tier' + (p.activeTier === r.tier ? ' on' : '')} onClick={() => p.onTier(r.tier)}>
              <b>LVL{r.tier}</b>
              <span className="big">{fmt(r.dps)} DPS</span>
              <span>{fmt(r.dps * 60)} / min</span>
              <Gold n={r.gold} plus={r.unknown > 0} size={15} />
              <span>{r.kill !== null ? `kill ${r.kill.toFixed(1)} s` : 'no kill'}</span>
            </button>
          ))}
        </div>
        <div className="hint">Every tower you placed, at that level. Gold is the total spent on towers and bought skills.{!p.hasTowers && ' Place towers in step 2 to compare.'}</div>
      </section>

      <section className="panel">
        <h2>Enemy wave</h2>
        <div className="seg">
          <button className={p.creepSet === 'A' ? 'on' : ''} onClick={() => p.setCreepSet('A')}>Set A</button>
          <button className={p.creepSet === 'B' ? 'on' : ''} onClick={() => p.setCreepSet('B')}>Set B</button>
        </div>
        <div className="hint">The two creep tables from krb-deck. Pick the one your boss fight uses.</div>
      </section>

      <button className="btn wide" onClick={p.goBattle}>Next: place towers →</button>

      {drag && <div className="ghost" style={{ left: drag.x, top: drag.y }}><Icon kind={drag.kind} id={drag.id} size={72} /></div>}
    </>
  )
}
