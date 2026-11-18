import type { Tier } from '../sim/library'
import { Card } from './common'
import { fmt } from './state'

export interface Pill { text: string; tone?: 'good' | 'off' | 'warn' }
export interface TierRow { tier: Tier; dps: number; kill: number | null; gold: number; unknown: number }

interface Props {
  slot: number; onSlot: (n: number) => void; onReset: () => void
  heroId: string; spellIds: string[]; deckIds: string[]
  pills: { hero: Pill; spells: Pill[]; towers: Pill[] }
  onPick: (kind: 'heroes' | 'spells' | 'towers', index: number) => void
  tiers: TierRow[]; activeTier: Tier | null; onTier: (t: Tier) => void
  creepSet: 'A' | 'B'; setCreepSet: (s: 'A' | 'B') => void
  hasTowers: boolean; goBattle: () => void
}

export function DeckStep(p: Props) {
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
          <Card kind="heroes" id={p.heroId} pill={p.pills.hero.text} tone={p.pills.hero.tone} onClick={() => p.onPick('heroes', 0)} />
          {p.spellIds.map((id, i) => <Card key={'s' + i} kind="spells" id={id} pill={p.pills.spells[i].text} tone={p.pills.spells[i].tone} onClick={() => p.onPick('spells', i)} />)}
          {p.deckIds.map((id, i) => <Card key={'t' + i} kind="towers" id={id} pill={p.pills.towers[i].text} tone={p.pills.towers[i].tone} onClick={() => p.onPick('towers', i)} />)}
        </div>
        <div className="hint">Tap a card to change it. The pill is what that card adds against the boss; OFF means the simulator can't use it yet.</div>
      </section>

      <section className="panel">
        <h2>Tower level</h2>
        <div className="tiers">
          {p.tiers.map((r) => (
            <button key={r.tier} className={'tier' + (p.activeTier === r.tier ? ' on' : '')} onClick={() => p.onTier(r.tier)}>
              <b>LVL{r.tier}</b>
              <span className="big">{fmt(r.dps)} DPS</span>
              <span>{fmt(r.dps * 60)} / min</span>
              <span className="gold">{fmt(r.gold)}g{r.unknown ? '+' : ''}</span>
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
    </>
  )
}
