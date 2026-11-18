// Card info page (like the game's): the DPS maths, the stats, the skills and perks. No map, no boss position.
import type { ReactNode } from 'react'
import { TIERS, heroById, spellById, towerById, type PerkDef, type SkillDef, type Tier } from '../sim/library'
import type { CardDps } from '../sim/dps'
import { applyPerk, emptyMods } from '../sim/perks'
import { TILE } from '../data/kingdomwars'
import type { CardKind } from '../data/icons'
import { Icon, Sheet } from './common'
import { CLASS_LABEL, ClassIcon, Gold } from './icons'
import { classOfHero, classOfTower, fmt } from './state'

interface Props {
  kind: CardKind; id: string
  info: CardDps
  tier: Tier; bought: string[]
  inDeck: boolean
  onToggleSkill: (skillId: string) => void
  onUse: () => void; onUnequip: () => void; onClose: () => void
}

const range = (a: number, b: number) => (a === b ? fmt(a) : `${fmt(a)}–${fmt(b)}`)
function Row({ k, v }: { k: string; v: ReactNode }) { return <div className="irow"><span>{k}</span><b>{v}</b></div> }

function PerkList({ perks }: { perks: PerkDef[] }) {
  if (!perks.length) return <div className="hint">No perks.</div>
  return (
    <>
      {perks.map((p, i) => {
        const m = emptyMods(); applyPerk(m, p)
        const modeled = m.ignored.length === 0
        return (
          <div key={i} className={'skill' + (modeled ? '' : ' off')}>
            <div className="skillhead"><b>{p.name}</b><span className={'tag ' + (modeled ? 'ok' : 'no')}>{modeled ? 'counted' : 'not counted'}</span></div>
            <div className="skillbits"><span>{p.pct !== null && p.stat ? `${p.pct > 0 ? '+' : ''}${p.pct}% ${p.stat} (${p.target})` : 'no value in the library'}{p.inferred ? ' *' : ''}</span></div>
            {!modeled && <div className="hint">{p.target === 'enemies' ? 'it works on enemies, which a DPS number does not include' : m.ignored[0]?.why}</div>}
          </div>
        )
      })}
    </>
  )
}

function SkillCard({ s, info, toggle }: { s: SkillDef; info: CardDps; toggle?: { on: boolean; disabled: boolean; onChange: () => void } }) {
  const part = info.parts.find((p) => p.label === s.name)
  const bits: ReactNode[] = []
  if (s.cooldown) bits.push(`${s.cooldown}s cooldown`)
  if (s.dmgAvg) bits.push(`~${fmt(s.dmgAvg)} damage`)
  if (s.dps) bits.push(`${fmt(s.dps)} dps${s.duration ? ` for ${s.duration}s` : ''}`)
  if (s.cost != null) bits.push(<Gold key="g" n={s.cost} size={14} />)
  const opponent = !s.supported && s.why?.startsWith('scope')
  return (
    <div className={'skill' + (part ? '' : ' off')}>
      <div className="skillhead">
        {toggle && <input type="checkbox" checked={toggle.on} disabled={toggle.disabled} onChange={toggle.onChange} aria-label={`Buy ${s.name}`} />}
        <b>{s.name}</b>
        {part ? <span className="tag ok">+{fmt(part.dps)} DPS</span> : <span className="tag no">{opponent ? 'not for the boss' : 'no DPS'}</span>}
      </div>
      {bits.length > 0 && <div className="skillbits">{bits.map((b, i) => <span key={i}>{b}</span>)}</div>}
      {part && <div className="hint">{part.detail}</div>}
      {!part && !opponent && <div className="hint">{s.why ?? 'no numbers in the library'}</div>}
    </div>
  )
}

export function Inspect({ kind, id, info, tier, bought, inDeck, onToggleSkill, onUse, onUnequip, onClose }: Props) {
  const hero = kind === 'heroes' ? heroById(id) : undefined
  const spell = kind === 'spells' ? spellById(id) : undefined
  const tower = kind === 'towers' ? towerById(id) : undefined
  const card = hero ?? spell ?? tower
  if (!card) return null
  const cls = hero ? classOfHero(hero) : tower ? classOfTower(tower) : spell && spell.kind !== 'buff' ? ('magic' as const) : null
  const skillsOpen = tier === 3

  return (
    <Sheet title={<span className="inspecttitle"><Icon kind={kind} id={id} size={44} />{card.name}</span>} onClose={onClose}>
      <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
        {cls && <span className="chip"><ClassIcon cls={cls} size={15} />{CLASS_LABEL[cls]}</span>}
        {card.rarity && <span className="chip">{card.rarity}</span>}
        <span className="chip">{tower ? `Tower level ${tier}` : 'Card level 9'}</span>
      </div>

      <div className="dpsbox">
        <div className="dpsbig">{info.dps === null ? 'No DPS' : `${fmt(info.dps)} DPS`}</div>
        {info.parts.map((p) => (
          <div key={p.label} className="dpspart"><span><b>{p.label}</b><br /><small>{p.detail}</small></span><b>{fmt(p.dps)}</b></div>
        ))}
        {info.notes.map((n, i) => <div key={i} className="hint warn">{n}</div>)}
        {info.dps === null && info.notes.length === 0 && <div className="hint">The library has no damage numbers for this card.</div>}
      </div>

      {hero && (
        <>
          <h3>Stats</h3>
          <Row k="Health" v={fmt(hero.hp)} />
          <Row k="Armor" v={`${hero.armor}%`} />
          <Row k="Damage per hit" v={range(hero.dmgMin, hero.dmgMax)} />
          <Row k="Attack interval" v={`${hero.interval} s`} />
          <Row k="Respawn" v={`${hero.respawn} s${hero.respawnAssumed ? ' (assumed)' : ''}`} />
          <h3>Skills</h3>
          {hero.skills.map((s) => <SkillCard key={s.id} s={s} info={info} />)}
        </>
      )}

      {tower && (
        <>
          <h3>Levels</h3>
          <table className="tbl">
            <thead><tr><td></td>{TIERS.map((t) => <td key={t}><b>LVL{t}</b></td>)}</tr></thead>
            <tbody>
              <tr><td>{tower.kind === 'barracks' ? 'Hit' : 'Damage per hit'}</td>{TIERS.map((t) => { const d = tower.tiers[t]; return <td key={t}>{d ? range(d.dmgMin, d.dmgMax) : '–'}</td> })}</tr>
              <tr><td>Attack interval</td>{TIERS.map((t) => <td key={t}>{tower.tiers[t] ? `${tower.tiers[t]!.interval} s` : '–'}</td>)}</tr>
              {tower.kind === 'barracks' && <tr><td>Soldiers</td>{TIERS.map((t) => { const d = tower.tiers[t]; return <td key={t}>{d?.units ? `${d.units} × ${fmt(d.unitHp ?? 0)} HP` : '–'}</td> })}</tr>}
              <tr><td>Range</td>{TIERS.map((t) => <td key={t}>{tower.tiers[t]?.range ?? '–'}</td>)}</tr>
              <tr><td>Total cost</td>{TIERS.map((t) => <td key={t}>{tower.tiers[t]?.cost != null ? <Gold n={tower.tiers[t]!.cost!} size={13} /> : '–'}</td>)}</tr>
            </tbody>
          </table>
          <h3>Skills</h3>
          <div className="hint">{skillsOpen ? (inDeck ? 'Tick the skills you bought; they add their DPS.' : 'Add this tower to your deck to buy skills.') : 'Skills unlock at tower level 3.'}</div>
          {tower.skills.map((s) => (
            <SkillCard key={s.id} s={s} info={info}
              toggle={s.supported ? { on: bought.includes(s.id), disabled: !skillsOpen || !inDeck, onChange: () => onToggleSkill(s.id) } : undefined} />
          ))}
        </>
      )}

      {spell && (
        <>
          <h3>Stats</h3>
          {spell.cooldown > 0 && <Row k="Cooldown" v={`${spell.cooldown} s`} />}
          {spell.aoe > 0 && <Row k="Area" v={`${spell.aoe} units (${(spell.aoe / TILE).toFixed(1)} tiles)`} />}
          {spell.kind === 'strike' && <Row k="Damage per hit" v={`${range(spell.dmgMin, spell.dmgMax)} × ${spell.hits}`} />}
          {spell.kind === 'zone' && <Row k="Damage over time" v={`${fmt(spell.dpsAvg)} DPS for ${spell.duration} s`} />}
          {spell.kind === 'buff' && <Row k="Buff" v={`+${spell.buffDmgPct}% damage, +${spell.buffRangePct}% range, ${spell.duration} s, up to ${spell.buffTowers} towers`} />}
        </>
      )}

      <h3>Perks</h3>
      <PerkList perks={card.perks} />
      <div className="hint">* value filled in from another card with the same perk name</div>

      {inDeck
        ? <button className="btn wide danger" style={{ marginTop: 14 }} onClick={onUnequip}>Unequip</button>
        : <button className="btn wide go" style={{ marginTop: 14 }} onClick={onUse}>Use</button>}
    </Sheet>
  )
}
