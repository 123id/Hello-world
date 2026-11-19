// "SELECT A CARD TO REPLACE": the game's screen for putting a card into a full deck.
// Addition: every card you can replace shows what your deck's DPS becomes.
import type { CardKind } from '../data/icons'
import { Card, Icon } from './common'
import { fmt, listOf, type DeckState } from './state'

interface Props {
  kind: CardKind; incoming: string
  deck: DeckState
  after: (index: number) => number // deck DPS after replacing the slot at this index
  total: number
  onPick: (index: number) => void; onCancel: () => void
}

export function ReplaceScreen({ kind, incoming, deck, after, total, onPick, onCancel }: Props) {
  const name = listOf(kind).find((c) => c.id === incoming)?.name ?? incoming
  const cell = (k: CardKind, index: number, id: string | null) => {
    if (!id) return <span key={k + index} className="card empty"><span className="emptybox" /></span>
    const live = k === kind
    const diff = live ? after(index) - total : 0
    return (
      <div key={k + index} className={'repcell' + (live ? ' live' : '')}>
        <Card kind={k} id={id} hideName glow={live} dim={!live} onClick={live ? () => onPick(index) : undefined} />
        {live && <span className={'repdelta ' + (diff >= 0 ? 'up' : 'down')}>{diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(diff))}</span>}
      </div>
    )
  }
  return (
    <div className="repscreen">
      <div className="rephead">Select a card to replace</div>
      <div className="repnow"><Icon kind={kind} id={incoming} size={40} /><span>Adding <b>{name}</b></span></div>
      <div className="deckgrid repgrid">
        {cell('heroes', 0, deck.hero)}
        {deck.spells.map((id, i) => cell('spells', i, id))}
        {deck.towers.map((id, i) => cell('towers', i, id))}
      </div>
      <div className="hint" style={{ textAlign: 'center' }}>The arrow under a card is how your deck's DPS changes if you replace it.</div>
      <button className="gbtn red wide" onClick={onCancel}>Cancel</button>
    </div>
  )
}
