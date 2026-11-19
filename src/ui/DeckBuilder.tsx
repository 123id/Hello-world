// Step 1 (the game's Collection > Cards screen): build a deck and read pure damage numbers.
// DPS here is damage per hit ÷ attack time plus every skill (see sim/dps.ts). No map, boss position or creeps.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CardKind } from '../data/icons'
import { heroDps, skillDps, spellDps, towerDps, towerSkillCtx, type CardDps, type DeckDps, type PerkGain } from '../sim/dps'
import { LIBRARY, heroById, spellById, towerById, type Tier } from '../sim/library'
import { Card, Icon, Sheet } from './common'
import { useLongPressDrag } from './drag'
import { Gold, type DmgClass } from './icons'
import { InfoPage } from './InfoPage'
import { Popover } from './Popover'
import { ReplaceScreen } from './ReplaceScreen'
import { classOfHero, classOfTower, fmt, listOf, listOfDeck, placed, type DeckState } from './state'

type Kind = CardKind
export interface TierRow { tier: Tier; dps: number; perMin: number; gold: number; unknown: number; kill: number | null }

interface Props {
  deck: DeckState; dps: DeckDps
  slot: number; onSlot: (n: number) => void; onClear: () => void; onReset: () => void
  onPlace: (kind: Kind, index: number, id: string | null) => void
  onSwap: (kind: Kind, a: number, b: number) => void
  onTier: (t: Tier) => void; onTowerTier: (towerId: string, t: Tier) => void
  onPerks: (on: boolean) => void; onPerHit: (on: boolean) => void
  gains: PerkGain[]
  onToggleSkill: (towerId: string, skillId: string) => void
  evalDeck: (d: DeckState) => number
  tiers: TierRow[]; goBattle: () => void
}

type Src = { where: 'deck'; index: number } | { where: 'coll' }
interface Drag { kind: Kind; id: string; src: Src; x: number; y: number; over: string | null }
type Sort = 'dps' | 'rarity' | 'name'
const SORT_LABEL: Record<Sort, string> = { dps: 'DPS', rarity: 'RARITY', name: 'NAME' }
const NEXT_SORT: Record<Sort, Sort> = { dps: 'rarity', rarity: 'name', name: 'dps' }
const RARITY: Record<string, number> = { Legendary: 0, Epic: 1, Rare: 2, Common: 3 }
const SLOT_LABEL: Record<Kind, string> = { heroes: 'Hero', spells: 'Spell', towers: 'Tower' }
const TABS: { key: 'deck' | Kind; label: string; icon: string }[] = [
  { key: 'deck', label: 'Deck', icon: 'tab-deck' }, { key: 'heroes', label: 'Heroes', icon: 'tab-heroes' },
  { key: 'towers', label: 'Towers', icon: 'tab-towers' }, { key: 'spells', label: 'Spells', icon: 'tab-spells' },
]
const BASE = import.meta.env.BASE_URL
const STRIP = 54 // height of the pinned deck strip, which floats over the page (it must not push the content down)
const dropAt = (x: number, y: number): string | null => (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null

function DragCard(p: {
  kind: Kind; id: string; src: Src; dropId?: string; pill: string; tone: 'good' | 'off'; cls: DmgClass | null
  badge?: { text: string; title: string; tone?: 'ok' | 'warn' }; tag?: string; dim?: boolean; selected?: boolean
  drag: Drag | null; setDrag: (d: Drag | null | ((d: Drag | null) => Drag | null)) => void
  onTap: (rect: DOMRect) => void; onDropTo: (target: string | null) => void
}) {
  const handlers = useLongPressDrag({
    onTap: (x, y) => { const el = document.elementFromPoint(x, y)?.closest('.card'); if (el) p.onTap(el.getBoundingClientRect()) },
    onStart: (x, y) => p.setDrag({ kind: p.kind, id: p.id, src: p.src, x, y, over: null }),
    onMove: (x, y) => p.setDrag((d) => (d ? { ...d, x, y, over: dropAt(x, y) } : d)),
    onEnd: (x, y) => { p.onDropTo(dropAt(x, y)); p.setDrag(null) },
    onCancel: () => p.setDrag(null),
  })
  const lifted = !!p.drag && p.drag.id === p.id && p.drag.kind === p.kind
  const over = !!p.dropId && !!p.drag && p.drag.kind === p.kind && p.drag.over === p.dropId && !lifted
  return <Card kind={p.kind} id={p.id} pill={p.pill} tone={p.tone} cls={p.cls} drag={handlers} drop={p.dropId} dragging={lifted} over={over} badge={p.badge} tag={p.tag} dim={p.dim} sel={p.selected} />
}

export function DeckBuilder(p: Props) {
  const { deck, dps } = p
  const [sel, setSel] = useState<{ kind: Kind; index: number } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pop, setPop] = useState<{ kind: Kind; id: string; anchor: DOMRect } | null>(null)
  const [info, setInfo] = useState<{ kind: Kind; id: string } | null>(null)
  const [replacing, setReplacing] = useState<{ kind: Kind; id: string } | null>(null)
  const [settings, setSettings] = useState(false)
  const [sorts, setSorts] = useState<Record<Kind, Sort>>({ heroes: 'dps', towers: 'dps', spells: 'dps' })
  const [active, setActive] = useState<'deck' | Kind>('deck')
  const [deckVisible, setDeckVisible] = useState(true)
  const [slots, setSlots] = useState<{ tabs: HTMLElement | null; mini: HTMLElement | null }>({ tabs: null, mini: null })

  const idsOf = (kind: Kind) => listOfDeck(deck, kind)
  const inDeck = (kind: Kind, id: string) => idsOf(kind).includes(id)
  const tierOf = (id: string): Tier => deck.tiers[id] ?? deck.tier
  const offOf = (id: string) => deck.skillsOff[id] ?? []

  // ---- the fixed tab row and the scroll-aware deck strip live in the app's header ----------------
  useEffect(() => { setSlots({ tabs: document.getElementById('tabrow-slot'), mini: document.getElementById('minideck-slot') }) }, [])
  useEffect(() => {
    let raf = 0
    const run = () => {
      raf = 0
      const head = document.getElementById('tophead')
      const headBottom = head?.getBoundingClientRect().bottom ?? 120
      const limit = headBottom + STRIP + 14
      let cur: 'deck' | Kind = 'deck'
      for (const t of TABS) { const el = document.getElementById('sec-' + t.key); if (el && el.getBoundingClientRect().top <= limit) cur = t.key }
      setActive(cur)
      const d = document.getElementById('sec-deck')
      setDeckVisible(!!d && d.getBoundingClientRect().bottom > headBottom + 30)
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(run) }
    run(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf) }
  }, [])
  const goTo = (key: 'deck' | Kind) => {
    const el = document.getElementById('sec-' + key), head = document.getElementById('tophead')
    if (!el) return
    window.scrollTo({ top: key === 'deck' ? 0 : Math.max(0, el.getBoundingClientRect().top + window.scrollY - (head?.getBoundingClientRect().bottom ?? 120) - STRIP - 6), behavior: 'smooth' })
  }

  // ---- numbers for any card (in the deck or in the collection) -------------------------------
  const towerList = dps.towers.map((t) => t?.dps ?? 0)
  const cardInfo = (kind: Kind, id: string, tier?: Tier): CardDps => {
    if (kind === 'heroes') return heroDps(heroById(id)!, dps.mods, deck.perHit)
    if (kind === 'spells') return spellDps(spellById(id)!, dps.mods, towerList, deck.perHit)
    return towerDps(towerById(id)!, tier ?? tierOf(id), offOf(id), dps.mods, deck.perHit)
  }
  const clsOf = (kind: Kind, id: string): DmgClass | null => {
    if (kind === 'heroes') return classOfHero(heroById(id)!)
    if (kind === 'towers') return classOfTower(towerById(id)!)
    return spellById(id)!.kind === 'buff' ? null : 'magic'
  }
  const pillFor = (kind: Kind, id: string): { text: string; tone: 'good' | 'off' } => {
    const v = cardInfo(kind, id).dps
    if (v === null) return { text: '', tone: 'off' } // no stats in the library: show the picture only
    return { text: kind === 'spells' && spellById(id)!.kind === 'buff' ? `+${fmt(v)}` : `${fmt(v)} DPS`, tone: 'good' }
  }

  // ---- putting cards into the deck ------------------------------------------------------------
  const flash = (t: string) => { setMsg(t); window.setTimeout(() => setMsg((m) => (m === t ? null : m)), 4000) }
  const useCard = (kind: Kind, id: string) => {
    const ids = idsOf(kind)
    if (ids.includes(id)) { flash('That card is already in your deck.'); return }
    let index = sel && sel.kind === kind ? sel.index : -1
    if (index < 0) index = ids.findIndex((x) => x === null)
    if (index < 0 && kind === 'heroes') index = 0 // one hero slot: Use swaps the hero straight away, like the game
    if (index < 0) { setReplacing({ kind, id }); return } // full: the game asks which card to replace
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
    goTo(kind)
  }

  // ---- the collection -------------------------------------------------------------------------
  const collection = useMemo(() => {
    const out = {} as Record<Kind, { id: string; name: string; rarity: string; dps: number | null; flag: string | null }[]>
    for (const kind of ['heroes', 'towers', 'spells'] as Kind[]) {
      const rows = listOf(kind).map((c) => {
        const base = kind === 'heroes' ? LIBRARY.heroes.find((h) => h.id === c.id)! : kind === 'spells' ? LIBRARY.spells.find((s) => s.id === c.id)! : LIBRARY.towers.find((t) => t.id === c.id)!
        const flag = c.issues.length > 0 ? 'some numbers are missing in the library' : base.dataLevel !== null && base.dataLevel !== 9 ? `numbers are from card level ${base.dataLevel}, not 9` : null
        return { id: c.id, name: c.name, rarity: base.rarity ?? '', dps: cardInfo(kind, c.id).dps, flag }
      })
      const s = sorts[kind]
      rows.sort((a, b) => s === 'name' ? a.name.localeCompare(b.name)
        : s === 'rarity' ? (RARITY[a.rarity] ?? 9) - (RARITY[b.rarity] ?? 9) || a.name.localeCompare(b.name)
        : (b.dps ?? -1) - (a.dps ?? -1) || a.name.localeCompare(b.name))
      out[kind] = rows
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorts, deck, dps])

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
        tag={kind === 'towers' ? `LVL${tierOf(id)}` : undefined}
        selected={sel?.kind === kind && sel.index === index} drag={drag} setDrag={setDrag}
        onTap={(anchor) => setPop({ kind, id, anchor })} onDropTo={(t) => dropOn({ where: 'deck', index }, kind, id, t)} />
    )
  }
  const deckCount = (deck.hero ? 1 : 0) + deck.spells.filter(Boolean).length + deck.towers.filter(Boolean).length
  const miniTile = (kind: Kind, index: number, id: string | null) => {
    const dropId = `${kind}:${index}`
    const over = !!drag && drag.kind === kind && drag.over === dropId
    return <span key={dropId} className={'mini' + (id ? '' : ' empty') + (sel?.kind === kind && sel.index === index ? ' sel' : '') + (over ? ' over' : '')} data-drop={dropId}>{id ? <Icon kind={kind} id={id} size={34} /> : '+'}</span>
  }

  const computeFor = (kind: Kind, id: string) => ({
    info: (t: Tier) => cardInfo(kind, id, t),
    skill: (s: import('../sim/library').SkillDef, t: Tier) => {
      const tw = kind === 'towers' ? towerById(id) : undefined
      return skillDps(s, tw ? towerSkillCtx(tw, t, dps.mods, deck.perHit) : { tier: 3, perHit: deck.perHit })
    },
  })

  return (
    <>
      {slots.tabs && createPortal(
        <div className="tabrow">
          {TABS.map((t) => (
            <button key={t.key} className={active === t.key ? 'on' : ''} onClick={() => goTo(t.key)}>
              <img src={`${BASE}ui/${t.icon}.png`} width={44} height={44} alt="" draggable={false} /><span>{t.label}</span>
            </button>
          ))}
        </div>, slots.tabs)}
      {slots.mini && !deckVisible && createPortal(
        <div className="minideck">
          {miniTile('heroes', 0, deck.hero)}{deck.spells.map((id, i) => miniTile('spells', i, id))}{deck.towers.map((id, i) => miniTile('towers', i, id))}
          <b>{fmt(dps.total)}</b>
        </div>, slots.mini)}

      <section id="sec-deck" className="gdeck">
        <div className="slotsrow">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} className={'slotbtn' + (p.slot === n ? ' on' : '')} onClick={() => p.onSlot(n)}>{n}</button>)}
          <button className="gear" onClick={() => setSettings(true)} aria-label="Deck settings">⚙</button>
        </div>
        <div className="deckgrid">
          {slotCard('heroes', 0, deck.hero)}
          {deck.spells.map((id, i) => slotCard('spells', i, id))}
          {deck.towers.map((id, i) => slotCard('towers', i, id))}
        </div>
        <div className="decksum"><span>{deckCount}/8 cards</span><span>Deck power <b>{fmt(dps.total)} DPS</b></span></div>
        {msg && <div className="note">{msg}</div>}
      </section>

      <section className="panel levelpanel">
        <div className="paneltitle">Tower level</div>
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
        <div className="hint">All towers at that level. Set one tower alone in its info page. Ideal kill is the boss's HP ÷ DPS, as if everything hit it from the first second.</div>
      </section>

      <section className="panel bonuspanel">
        <div className="paneltitle">Deck bonuses</div>
        <div className="hint" style={{ marginTop: 0 }}>What each card's perks add to your deck, found by leaving the perk out. Perks work as long as the card is in the deck.</div>
        {p.gains.length === 0 && <div className="hint">Your deck has no perks yet. Add cards and they appear here.</div>}
        {p.gains.filter((g) => g.counted).map((g) => (
          <div key={g.cardId + g.perk.name} className="bonusrow">
            <Icon kind={g.kind} id={g.cardId} size={34} />
            <span className="bname"><b>{g.perk.name}</b><small>{g.cardName} · {g.perk.pct! > 0 ? '+' : ''}{g.perk.pct}% {g.perk.stat} ({g.perk.target}){g.perk.inferred ? ' *' : ''}</small></span>
            <span className={'bgain' + (g.dps > 0 || g.killSecs > 0 ? ' up' : '')}>
              {g.dps > 0.5 ? `+${fmt(g.dps)} DPS` : g.killSecs > 0.005 ? `kill ${g.killSecs.toFixed(2)} s faster` : 'no DPS change'}
            </span>
          </div>
        ))}
        {p.gains.some((g) => !g.counted) && (
          <details className="bonusoff">
            <summary>{p.gains.filter((g) => !g.counted).length} perks that do not change DPS</summary>
            {p.gains.filter((g) => !g.counted).map((g) => (
              <div key={g.cardId + g.perk.name} className="bonusrow off">
                <Icon kind={g.kind} id={g.cardId} size={28} />
                <span className="bname"><b>{g.perk.name}</b><small>{g.cardName}: {g.why}</small></span>
              </div>
            ))}
          </details>
        )}
        <div className="hint">* value filled in from another card with the same perk name. Tower-damage perks add to each tower's basic attack. Whether they also boost tower skills is not known yet, so skills are not boosted.</div>
      </section>

      {(['heroes', 'towers', 'spells'] as Kind[]).map((kind) => (
        <section key={kind} id={'sec-' + kind} className={'gsection' + (drag && drag.src.where === 'deck' && drag.over === 'collection' ? ' dropzone' : '')} data-drop="collection">
          <div className="sechead">
            <div><h2>{kind}</h2><span className="found">Found {collection[kind].length}/{collection[kind].length}</span></div>
            <button className="sortbtn" onClick={() => setSorts({ ...sorts, [kind]: NEXT_SORT[sorts[kind]] })}>{SORT_LABEL[sorts[kind]]} ▲</button>
          </div>
          <div className="deckgrid">
            {collection[kind].map((c) => {
              const taken = inDeck(kind, c.id), pill = pillFor(kind, c.id)
              return (
                <DragCard key={c.id} kind={kind} id={c.id} src={{ where: 'coll' }} pill={pill.text} tone={pill.tone} cls={clsOf(kind, c.id)}
                  tag={kind === 'towers' ? `LVL${tierOf(c.id)}` : undefined}
                  dim={taken} badge={taken ? { text: '✓', title: 'in your deck' } : c.flag ? { text: '!', title: c.flag, tone: 'warn' } : undefined}
                  drag={drag} setDrag={setDrag} onTap={(anchor) => setPop({ kind, id: c.id, anchor })} onDropTo={(t) => dropOn({ where: 'coll' }, kind, c.id, t)} />
              )
            })}
          </div>
          {kind === 'spells' && <div className="hint">Tap a card for Info / Use. Hold and drag to put it in the deck, or drop a deck card on a list to remove it. ✓ in your deck · ! numbers missing or from another card level.</div>}
        </section>
      ))}

      {drag && <div className="ghost" style={{ left: drag.x, top: drag.y }}><Icon kind={drag.kind} id={drag.id} size={72} /></div>}

      {pop && (
        <Popover anchor={pop.anchor} kind={pop.kind} id={pop.id} onClose={() => setPop(null)}
          buttons={[
            { label: 'Info', tone: 'blue', onClick: () => { setInfo({ kind: pop.kind, id: pop.id }); setPop(null) } },
            inDeck(pop.kind, pop.id)
              ? { label: 'Unequip', tone: 'red', onClick: () => { const i = idsOf(pop.kind).indexOf(pop.id); if (i >= 0) p.onPlace(pop.kind, i, null); setPop(null) } }
              : { label: 'Use', tone: 'yellow', onClick: () => { useCard(pop.kind, pop.id); setPop(null) } },
          ]} />
      )}

      {info && (
        <InfoPage key={info.kind + info.id} kind={info.kind} id={info.id} inDeck={inDeck(info.kind, info.id)} deckTier={tierOf(info.id)} off={offOf(info.id)}
          compute={computeFor(info.kind, info.id)} gains={p.gains.filter((g) => g.cardId === info.id)} onTier={(t) => p.onTowerTier(info.id, t)} onToggleSkill={(sid) => p.onToggleSkill(info.id, sid)}
          onUse={() => { useCard(info.kind, info.id); setInfo(null) }}
          onUnequip={() => { const i = idsOf(info.kind).indexOf(info.id); if (i >= 0) p.onPlace(info.kind, i, null); setInfo(null) }}
          onClose={() => setInfo(null)} />
      )}

      {replacing && (
        <ReplaceScreen kind={replacing.kind} incoming={replacing.id} deck={deck} total={dps.total}
          after={(i) => p.evalDeck(placed(deck, replacing.kind, i, replacing.id))}
          onPick={(i) => { p.onPlace(replacing.kind, i, replacing.id); setReplacing(null); setSel(null) }} onCancel={() => setReplacing(null)} />
      )}

      {settings && (
        <Sheet title="Deck settings" onClose={() => setSettings(false)}>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn" onClick={() => { p.onClear(); setSettings(false) }}>Clear deck</button>
            <button className="btn" onClick={() => { p.onReset(); setSettings(false) }}>Load example deck</button>
          </div>
          <label className="checkrow"><input type="checkbox" checked={deck.perks} onChange={(e) => p.onPerks(e.target.checked)} />Apply the deck's perks to the numbers</label>
          <label className="checkrow"><input type="checkbox" checked={deck.perHit} onChange={(e) => p.onPerHit(e.target.checked)} />Multi-hit skills and spells: the listed damage is per hit (multiply by the number of hits)</label>
          <div className="hint">Untick the second box if the game lists the damage of the whole cast. A skill's affected units always count as separate hits, because with only the boss in range they all land on it.</div>
          <div className="hint">DPS = damage per hit ÷ attack time, plus each skill's damage ÷ its cooldown. Card level 9 is assumed, and the numbers come from the library, so cards marked ! may differ from what the game shows.</div>
        </Sheet>
      )}
    </>
  )
}
