// The small popup the game shows above a tapped card: its name, a bigger picture, and Info / Use or Info / Unequip.
import { useLayoutEffect, useRef, useState } from 'react'
import type { CardKind } from '../data/icons'
import { Icon } from './common'
import { listOf } from './state'

export interface PopButton { label: string; tone: 'blue' | 'yellow' | 'red'; onClick: () => void }
const W = 156

export function Popover({ anchor, kind, id, buttons, onClose }: { anchor: DOMRect; kind: CardKind; id: string; buttons: PopButton[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 220
    const vw = window.innerWidth, vh = window.innerHeight
    const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - W / 2), vw - W - 8)
    let top = anchor.top - h + 14 // the game puts it over the card, a little overlapping
    if (top < 118) top = Math.min(anchor.bottom - 14, vh - h - 90) // no room above: open below
    setPos({ left, top })
  }, [anchor])
  const name = listOf(kind).find((c) => c.id === id)?.name ?? id
  return (
    // Closes on a fresh press outside. (Not on "click": after a touch the browser sends a click to whatever is under the finger,
    // which is this very backdrop once the popup has opened, and it would close the popup the moment it appeared.)
    <div className="popback" onPointerDown={onClose}>
      <div ref={ref} className="popover" style={{ left: pos?.left ?? -999, top: pos?.top ?? -999, width: W }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="poptitle">{name}</div>
        <div className="popcard"><Icon kind={kind} id={id} size={92} /></div>
        {buttons.map((b) => <button key={b.label} className={'gbtn ' + b.tone} onClick={b.onClick}>{b.label}</button>)}
      </div>
    </div>
  )
}
