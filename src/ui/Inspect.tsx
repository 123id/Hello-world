import type { ReactNode } from 'react'
import { RALLY_RANGE, HERO_REACH, type Placement } from '../sim/engine'
import { heroById, spellById, towerById, TIERS, type PerkDef, type SkillDef } from '../sim/library'
import { applyPerk, emptyMods } from '../sim/perks'
import { TILE } from '../data/kingdomwars'
import type { CardKind } from '../data/icons'
import { Icon, Sheet } from './common'
import { CLASS_LABEL, ClassIcon, Gold, type DmgClass } from './icons'
import { MAP, bestCoverage, classOfHero, classOfTower, fmt, routeCoverage, type Spots } from './state'

interface Props {
  kind: CardKind; id: string
  dps: number; share: number
  placements: Placement[]; spots: Spots
  onChange: () => void; onClose: () => void
}

const range = (a: number, b: number) => (a === b ? fmt(a) : `${fmt(a)}–${fmt(b)}`)
const pct = (f: number) => `${Math.round(f * 100)}%`

function Row({ k, v }: { k: string; v: ReactNode }) { return <div className="irow"><span>{k}</span><b>{v}</b></div> }

function SkillList({ skills, bought }: { skills: SkillDef[]; bought?: Set<string> }) {
  if (!skills.length) return <div className="hint">No skills in the library.</div>
  return (
    <>
      {skills.map((s) => {
        const bits: ReactNode[] = []
        if (s.cooldown) bits.push(`${s.cooldown}s cooldown`)
        if (s.dmgAvg) bits.push(`~${fmt(s.dmgAvg)} damage`)
        if (s.dps) bits.push(`${fmt(s.dps)} dps${s.duration ? ` for ${s.duration}s` : ''}`)
        if (s.cost != null) bits.push(<Gold key="g" n={s.cost} size={14} />)
        const why = s.supported ? null : s.why?.startsWith('scope') ? 'opponent-only or not used on the boss, excluded' : `not simulated yet (${s.why ?? 'unknown'})`
        return (
          <div key={s.id} className={'skill' + (s.supported ? '' : ' off')}>
            <div className="skillhead"><b>{s.name}</b>{bought?.has(s.id) && <span className="tag">bought</span>}<span className={'tag ' + (s.supported ? 'ok' : 'no')}>{s.supported ? 'simulated' : 'not simulated'}</span></div>
            {bits.length > 0 && <div className="skillbits">{bits.map((b, i) => <span key={i}>{b}</span>)}</div>}
            {why && <div className="hint">{why}</div>}
          </div>
        )
      })}
    </>
  )
}

function PerkList({ perks }: { perks: PerkDef[] }) {
  if (!perks.length) return <div className="hint">No perks.</div>
  return (
    <>
      {perks.map((p, i) => {
        const m = emptyMods(); applyPerk(m, p)
        const modeled = m.ignored.length === 0
        const enemy = p.target === 'enemies'
        return (
          <div key={i} className={'skill' + (modeled ? '' : ' off')}>
            <div className="skillhead"><b>{p.name}</b><span className={'tag ' + (modeled ? 'ok' : 'no')}>{modeled ? 'applied' : 'not applied'}</span></div>
            <div className="skillbits"><span>{p.pct !== null && p.stat ? `${p.pct > 0 ? '+' : ''}${p.pct}% ${p.stat} (${p.target})` : 'no value in the library'}{p.inferred ? ' *' : ''}</span></div>
            {!modeled && <div className="hint">{enemy ? 'works on enemies, which the simulator does not model' : m.ignored[0]?.why}</div>}
          </div>
        )
      })}
    </>
  )
}

export function Inspect({ kind, id, dps, share, placements, spots, onChange, onClose }: Props) {
  const hero = kind === 'heroes' ? heroById(id) : undefined
  const spell = kind === 'spells' ? spellById(id) : undefined
  const tower = kind === 'towers' ? towerById(id) : undefined
  const card = hero ?? spell ?? tower
  if (!card) return null

  const cls: DmgClass | null = hero ? classOfHero(hero) : tower ? classOfTower(tower) : 'magic'
  const issues = [...new Set(card.issues)]
  const bought = new Set<string>()
  for (const sp of Object.values(spots)) if (sp.towerId === id) sp.skills.forEach((x) => bought.add(x))
  const placed = placements.find((p) => p.tower.id === id)

  return (
    <Sheet title={<span className="inspecttitle"><Icon kind={kind} id={id} size={44} />{card.name}</span>} onClose={onClose}>
      <div className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
        {cls && <span className="chip"><ClassIcon cls={cls} size={15} />{CLASS_LABEL[cls]}</span>}
        {card.rarity && <span className="chip">{card.rarity}</span>}
        <span className="chip">Level 9 (assumed)</span>
      </div>
      {issues.length > 0 && <div className="note">Not usable yet: {issues.join('; ')}.</div>}
      {dps > 0 && <div className="note good">Adds {fmt(dps)} DPS against the boss ({pct(share)} of the total).</div>}

      {hero && (
        <>
          <h3>Stats</h3>
          <Row k="Health" v={fmt(hero.hp)} />
          <Row k="Armor" v={`${hero.armor}%`} />
          <Row k="Damage" v={range(hero.dmgMin, hero.dmgMax)} />
          <Row k="Attack interval" v={`${hero.interval}s`} />
          <Row k="Respawn" v={`${hero.respawn}s${hero.respawnAssumed ? ' (assumed)' : ''}`} />
          <h3>Coverage</h3>
          <div className="hint">Hero skills fire when the boss is within {HERO_REACH} map units ({(HERO_REACH / TILE).toFixed(1)} tiles) of the hero. You can place the hero anywhere on the map.</div>
        </>
      )}

      {tower && (
        <>
          <h3>Levels</h3>
          <table className="tbl">
            <thead><tr><td></td>{TIERS.map((t) => <td key={t}><b>LVL{t}</b></td>)}</tr></thead>
            <tbody>
              <tr><td>{tower.kind === 'barracks' ? 'Unit damage' : 'Damage'}</td>{TIERS.map((t) => { const d = tower.tiers[t]; return <td key={t}>{d ? range(d.dmgMin, d.dmgMax) : '–'}</td> })}</tr>
              <tr><td>Attack interval</td>{TIERS.map((t) => <td key={t}>{tower.tiers[t] ? `${tower.tiers[t]!.interval}s` : '–'}</td>)}</tr>
              <tr><td>Range</td>{TIERS.map((t) => <td key={t}>{tower.tiers[t]?.range ?? '–'}</td>)}</tr>
              {tower.kind === 'barracks' && <tr><td>Units × health</td>{TIERS.map((t) => { const d = tower.tiers[t]; return <td key={t}>{d?.units ? `${d.units} × ${fmt(d.unitHp ?? 0)}` : '–'}</td> })}</tr>}
              <tr><td>Total cost</td>{TIERS.map((t) => <td key={t}>{tower.tiers[t]?.cost != null ? <Gold n={tower.tiers[t]!.cost!} size={13} /> : '–'}</td>)}</tr>
            </tbody>
          </table>
          <h3>Coverage of the boss route</h3>
          {(() => {
            const td = tower.tiers[3]
            if (!td) return <div className="hint">Tier 3 data is missing.</div>
            const r = tower.kind === 'barracks' ? RALLY_RANGE : td.range ?? 0
            const here = placed ? MAP.spots.find((s) => s.id === placed.spotId) : undefined
            const best = bestCoverage(r)
            return (
              <>
                {here && <Row k={`From spot ${here.id} (where you placed it)`} v={pct(routeCoverage(here, r))} />}
                <Row k={`Best spot is ${best.spotId}`} v={pct(best.frac)} />
                <div className="hint">{tower.kind === 'barracks' ? `Barracks block the boss where their rally point sits, within ${RALLY_RANGE} units of the tower.` : `Share of the boss's 35-tile route that is inside the tower's range at level 3.`}{tower.hitsAir ? '' : ' It cannot hit flying enemies.'}{tower.targetsHighestHp ? ' It targets the enemy with the most HP, so it focuses the boss.' : ''}</div>
              </>
            )
          })()}
          <h3>Skills</h3>
          <SkillList skills={tower.skills} bought={bought} />
        </>
      )}

      {spell && (
        <>
          <h3>Stats</h3>
          {spell.cooldown > 0 && <Row k="Cooldown" v={`${spell.cooldown}s`} />}
          {spell.aoe > 0 && <Row k="Area" v={`${spell.aoe} units (${(spell.aoe / TILE).toFixed(1)} tiles)`} />}
          {spell.kind === 'strike' && <Row k="Damage" v={`${range(spell.dmgMin, spell.dmgMax)} × ${spell.hits} hit${spell.hits === 1 ? '' : 's'}`} />}
          {spell.kind === 'zone' && <Row k="Damage over time" v={`${fmt(spell.dpsAvg)} DPS for ${spell.duration}s`} />}
          {spell.kind === 'zone' && spell.slowPct > 0 && <Row k="Slow" v={`${spell.slowPct}%`} />}
          {spell.kind === 'buff' && <Row k="Buff" v={`+${spell.buffDmgPct}% damage, +${spell.buffRangePct}% range for ${spell.duration}s on up to ${spell.buffTowers} towers`} />}
          <h3>Coverage</h3>
          <div className="hint">Cast on the boss every {spell.cooldown || '?'}s once it is on the field (assumes perfect aim).</div>
        </>
      )}

      <h3>Perks</h3>
      <PerkList perks={card.perks} />
      <div className="hint">* value filled in from another card with the same perk name</div>

      <button className="btn wide" style={{ marginTop: 14 }} onClick={onChange}>Change this card</button>
    </Sheet>
  )
}
