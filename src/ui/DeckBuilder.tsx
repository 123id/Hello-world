// Step 1: build a deck from your collection and read pure damage numbers.
// DPS here is damage per hit ÷ attack time (see sim/dps.ts). There is no map, boss position or creeps in this step.
import { useMemo, useState } from 'react'
import type { CardKind } from '../data/icons'
import { heroDps, spellDps, towerDps, type CardDps, type DeckDps } from '../sim/dps'
import { LIBRARY, heroById, spellById, towerById, type Tier } from '../sim/library'
import { Card, Icon } from './common'
import { useLongPressDrag } from './drag'
import { Gold, type DmgClass } from './icons'
import { Inspect } from './Inspect'
import { classOfHero, classOfTower, fmt, listOf, type DeckState } from './state'

type Kind = CardKind
export interface TierRow { tier: Tier; dps: number; perMin: number; gold: number; unknown: number; kill: number | null }

interface Props {
  deck: DeckState; dps: DeckDps
  slot: number; onSlot: (n: number) => void; onClear: () => void; onReset: () => void
  onPlace: (kind: Kind, index: number, id: string | null) => void
  onSwap: (kind: Kind, a: number, b: number) => void
  onTier: (t: Tier) => void; onPerks: (on: boolean) => void
  onToggleSkill: (towerId: string, skillId: string) => void
  tiers: TierRow[]; goBattle: () => void
}

type Src = { where: 'deck'; index: number } | { where: 'coll' }
interface Drag { kind: Kind; id: string; src: Src; x: number; y: number; over: string | null }
const dropAt = (x: number, y: number): string | null => (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null

const SLOT_LABEL: Record<Kind, string> = { heroes: 'Hero', spells: 'Spell', towers: 'Tower' }
const RARITY: Record<string, number> = { Legendary: 0, Epic: 1, Rare: 2, Common: 3 }

function DragCard(p: {
  kind: Kind; id: string; src: Src; dropId?: string; pill: string; tone: 'good' | 'off'; cls: DmgClass | null
  badge?: { text: string; title: string; tone?: 'ok' | 'warn' }; dim?: boolean; selected?: boolean
  drag: Drag | null; setDrag: (d: Drag | null | ((d: Drag | null) => Drag | null)) => void
  onTap: () => void; onDropTo: (target: string | null) => void
}) {
  const handlers = useLongPressDrag({
    onTap: p.onTap,
    onStart: (x, y) => p.setDrag({ kind: p.kind, id: p.id, src: p.src, x, y, over: null }),
    onMove: (x, y) => p.setDrag((d) => (d ? { ...d, x, y, over: dropAt(x, y) } : d)),
    onEnd: (x, y) => { p.onDropTo(dropAt(x, y)); p.setDrag(null) },
    onCancel: () => p.setDrag(null),
  })
  const lifted = !!p.drag && p.drag.id === p.id && p.drag.kind === p.kind
  const over = !!p.dropId && !!p.drag && p.drag.kind === p.kind && p.drag.over === p.dropId && !lifted
  return <Card kind={p.kind} id={p.id} pill={p.pill} tone={p.tone} cls={p.cls} drag={handlers} drop={p.dropId} dragging={lifted} over={over} badge={p.badge} dim={p.dim} sel={p.selected} />
}

export function DeckBuilder(p: Props) {
  const { deck, dps } = p
  const [tab, setTab] = useState<Kind>('towers')
  const [sort, setSort] = useState<'dps' | 'name' | 'rarity'>('dps')
  const [sel, setSel] = useState<{ kind: Kind; index: number } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [info, setInfo] = useState<{ kind: Kind; id: string } | null>(null)

  const idsOf = (kind: Kind): (string | null)[] => (kind === 'heroes' ? [deck.hero] : kind === 'spells' ? deck.spells : deck.towers)
  const inDeck = (kind: Kind, id: string) => idsOf(kind).includes(id)

  // ---- numbers for any card (in the deck or in the collection) -------------------------------
  const towerList = dps.towers.map((t) => t?.dps ?? 0)
  const cardInfo = (kind: Kind, id: string): CardDps => {
    if (kind === 'heroes') return heroDps(heroById(id)!, dps.mods)
    if (kind === 'spells') return spellDps(spellById(id)!, dps.mods, towerList)
    return towerDps(towerById(id)!, deck.tier, deck.skills[id] ?? [], dps.mods)
  }
  const clsOf = (kind: Kind, id: string): DmgClass | null => {
    if (kind === 'heroes') return classOfHero(heroById(id)!)
    if (kind === 'towers') return classOfTower(towerById(id)!)
    return spellById(id)!.kind === 'buff' ? null : 'magic'
  }
  const pillFor = (kind: Kind, id: string): { text: string; tone: 'good' | 'off' } => {
    const v = cardInfo(kind, id).dps
    if (v === null) return { text: 'no data', tone: 'off' }
    return { text: kind === 'spells' && spellById(id)!.kind === 'buff' ? `+${fmt(v)}` : `${fmt(v)} DPS`, tone: 'good' }
  }

  // ---- putting cards into the deck ------------------------------------------------------------
  const flash = (t: string) => { setMsg(t); window.setTimeout(() => setMsg((m) => (m === t ? null : m)), 4000) }
  const useCard = (kind: Kind, id: string) => {
    const ids = idsOf(kind)
    if (ids.includes(id)) { flash('That card is already in your deck.'); return }
    let index = sel && sel.kind === kind ? sel.index : -1
    if (index < 0) index = ids.findIndex((x) => x === null)
    if (index < 0 && kind === 'heroes') index = 0
    if (index < 0) { flash(`Your ${SLOT_LABEL[kind].toLowerCase()} slots are full. Drag this card onto the one you want to replace, or unequip a card first.`); return }
    p.onPlace(kind, index, id)
    setSel(null)
  }
  const dropOn = (src: Src, kind: Kind, id: string, target: string | null) => {
    if (!target) return
    if (target === 'collection') { if (src.where === 'deck') p.onPlace(kind, src.index, null); return }
    const [k, i] = target.split(':')
    if (k !== kind) { flash(`A ${SLOT_LABEL[k as Kind].toLowerCase()} slot can't hold a ${SLOT_LABEL[kind].toLowerCase()}.`); return }
    if (src.where === 'deck') { if (+i !== src.index) p.onSwap(kind, src.index, +i) } else p.onPlace(kind, +i, id)
  }
  const selectSlot = (kind: Kind, index: number) => {
    setSel(sel && sel.kind === kind && sel.index === index ? null : { kind, index })
    setTab(kind)
  }

  // ---- the collection -------------------------------------------------------------------------
  const collection = useMemo(() => {
    const rows = listOf(tab).map((c) => {
      const kind = tab
      const base = kind === 'heroes' ? LIBRARY.heroes.find((h) => h.id === c.id)! : kind === 'spells' ? LIBRARY.spells.find((s) => s.id === c.id)! : LIBRARY.towers.find((t) => t.id === c.id)!
      return { id: c.id, name: c.name, rarity: base.rarity ?? '', dps: cardInfo(kind, c.id).dps, incomplete: c.issues.length > 0 }
    })
    rows.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'rarity' ? (RARITY[a.rarity] ?? 9) - (RARITY[b.rarity] ?? 9) || a.name.localeCompare(b.name)
      : (b.dps ?? -1) - (a.dps ?? -1) || a.name.localeCompare(b.name))
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sort, deck, dps])

  // ---- render ---------------------------------------------------------------------------------
  const slotCard = (kind: Kind, index: number, id: string | null) => {
    const dropId = `${kind}:${index}`
    if (!id) {
      const over = !!drag && drag.kind === kind && drag.over === dropId
      return (
        <button key={dropId} className={'card empty' + (sel?.kind === kind && sel.index === index ? ' sel' : '') + (over ? ' over' : '')} data-drop={dropId} onClick={() => selectSlot(kind, index)}>
          <span className="emptybox">+</span><span className="cardname">{SLOT_LABEL[kind]}</span>
        </button>
      )
    }
    const pill = pillFor(kind, id)
    return (
      <DragCard key={dropId} kind={kind} id={id} src={{ where: 'deck', index }} dropId={dropId} pill={pill.text} tone={pill.tone} cls={clsOf(kind, id)}
        selected={sel?.kind === kind && sel.index === index} drag={drag} setDrag={setDrag}
        onTap={() => setInfo({ kind, id })} onDropTo={(t) => dropOn({ where: 'deck', index }, kind, id, t)} />
    )
  }
  const infoCard = info ? cardInfo(info.kind, info.id) : null
  const deckCount = (deck.hero ? 1 : 0) + deck.spells.filter(Boolean).length + deck.towers.filter(Boolean).length

  return (
    <>
      <section className="panel deckpanel">
        <div className="panelhead">
          <h2>Deck <small className="count">{deckCount}/8</small></h2>
          <div className="row"><button className="btn small" onClick={p.onClear}>Clear deck</button><button className="btn small" onClick={p.onReset}>Example</button></div>
        </div>
        <div className="slots">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} className={'slot' + (p.slot === n ? ' on' : '')} onClick={() => p.onSlot(n)}>{n}</button>)}
          <span className="hint">deck slots, saved in this browser</span>
        </div>
        <div className="deckgrid compact">
          {slotCard('heroes', 0, deck.hero)}
          {deck.spells.map((id, i) => slotCard('spells', i, id))}
          {deck.towers.map((id, i) => slotCard('towers', i, id))}
        </div>
        {msg && <div className="note">{msg}</div>}
      </section>

      <section className={'panel collection' + (drag && drag.src.where === 'deck' && drag.over === 'collection' ? ' over' : '')} data-drop="collection">
        <h2>Collection</h2>
        <div className="hint">Drag a card onto a slot above, or tap it and press Use. Tap a card in the deck for its numbers and skills. Hold and drag a deck card to swap places, or drop it here to remove it.</div>
        <div className="tabs">
          {(['heroes', 'towers', 'spells'] as Kind[]).map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k}</button>)}
        </div>
        <div className="toolbar">
          <span className="hint" style={{ margin: 0 }}>{collection.length} {tab}{sel && sel.kind === tab ? ` · filling ${SLOT_LABEL[tab].toLowerCase()} slot ${sel.index + 1}` : ''}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as 'dps' | 'name' | 'rarity')} aria-label="Sort">
            <option value="dps">Sort: DPS</option><option value="name">Sort: name</option><option value="rarity">Sort: rarity</option>
          </select>
        </div>
        <div className="deckgrid">
          {collection.map((c) => {
            const taken = inDeck(tab, c.id)
            const pill = pillFor(tab, c.id)
            return (
              <DragCard key={c.id} kind={tab} id={c.id} src={{ where: 'coll' }} pill={pill.text} tone={pill.tone} cls={clsOf(tab, c.id)}
                dim={taken} badge={taken ? { text: '✓', title: 'in your deck' } : c.incomplete ? { text: '!', title: 'some numbers are missing in the library', tone: 'warn' } : undefined}
                drag={drag} setDrag={setDrag} onTap={() => setInfo({ kind: tab, id: c.id })} onDropTo={(t) => dropOn({ where: 'coll' }, tab, c.id, t)} />
            )
          })}
        </div>
        <div className="hint">✓ already in your deck · ! some numbers are missing in the library, so its DPS may be incomplete or unavailable.</div>
      </section>

      <section className="panel">
        <h2>Tower level</h2>
        <div className="tiers">
          {p.tiers.map((r) => (
            <button key={r.tier} className={'tier' + (deck.tier === r.tier ? ' on' : '')} onClick={() => p.onTier(r.tier)}>
              <b>LVL{r.tier}</b>
              <span className="big">{fmt(r.dps)} DPS</span>
              <span>{fmt(r.perMin)} / min</span>
              <Gold n={r.gold} plus={r.unknown > 0} size={15} />
              <span>{r.kill !== null ? `ideal kill ${r.kill.toFixed(1)} s` : 'no damage'}</span>
            </button>
          ))}
        </div>
        <label className="checkrow"><input type="checkbox" checked={deck.perks} onChange={(e) => p.onPerks(e.target.checked)} />Apply the deck's perks to the numbers</label>
        <div className="hint">Every tower in the deck at that level; gold is the total spent on towers and bought skills. Ideal kill is the boss's HP ÷ DPS, as if everything hit it from the first second.</div>
      </section>

      <button className="btn wide" onClick={p.goBattle}>Next: place towers →</button>

      {drag && <div className="ghost" style={{ left: drag.x, top: drag.y }}><Icon kind={drag.kind} id={drag.id} size={72} /></div>}

      {info && infoCard && (
        <Inspect kind={info.kind} id={info.id} info={infoCard} tier={deck.tier} bought={info.kind === 'towers' ? deck.skills[info.id] ?? [] : []} inDeck={inDeck(info.kind, info.id)}
          onToggleSkill={(sid) => p.onToggleSkill(info.id, sid)}
          onUse={() => { useCard(info.kind, info.id); setInfo(null) }}
          onUnequip={() => { const i = idsOf(info.kind).indexOf(info.id); if (i >= 0) p.onPlace(info.kind, i, null); setInfo(null) }}
          onClose={() => setInfo(null)} />
      )}
    </>
  )
}

