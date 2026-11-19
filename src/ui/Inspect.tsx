// Card info page (like the game's): the DPS maths, the stats, the skills and perks. No map, no boss position.
import type { ReactNode } from 'react'
import { TIERS, heroById, spellById, towerById, type PerkDef, type SkillDef, type Tier } from '../sim/library'
import type { CardDps, SkillResult } from '../sim/dps'
import { applyPerk, emptyMods } from '../sim/perks'
import { TILE } from '../data/kingdomwars'
import type { CardKind } from '../data/icons'
import { Icon, Sheet } from './common'
import { CLASS_LABEL, ClassIcon, Gold } from './icons'
import { classOfHero, classOfTower, fmt } from './state'

interface Props {
  kind: CardKind; id: string
  info: CardDps
  tier: Tier // this tower's level
  levels: { tier: Tier; dps: number | null }[] // towers: DPS at each level
  off: string[] // skills switched off
  skillOf: (s: SkillDef) => SkillResult // a skill's numbers in the current deck context, whether or not it is switched on
  inDeck: boolean
  onTier: (t: Tier) => void
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

function SkillCard({ s, res, counted, toggle }: { s: SkillDef; res: SkillResult; counted: boolean; toggle?: { disabled: boolean; onChange: () => void } }) {
  const opponent = !!s.calcWhy?.startsWith('scope')
  const bits: ReactNode[] = []
  if (s.cost != null) bits.push(<Gold key="g" n={s.cost} size={14} />)
  return (
    <div className={'skill' + (counted ? '' : ' off')}>
      <div className="skillhead">
        {toggle && <input type="checkbox" checked={counted} disabled={toggle.disabled} onChange={toggle.onChange} aria-label={`Count ${s.name}`} />}
        <b>{s.name}</b>
        {res.part
          ? <span className={'tag ' + (counted ? 'ok' : '')}>{counted ? '+' : 'off · +'}{fmt(res.part.dps)} DPS</span>
          : <span className="tag no">{opponent ? 'not for the boss' : 'no DPS'}</span>}
        {bits.length > 0 && <span className="skillbits">{bits}</span>}
      </div>
      {res.part && <div className="hint">{res.part.detail}</div>}
      {!res.part && !opponent && <div className="hint">Not counted: {res.why}</div>}
    </div>
  )
}

export function Inspect({ kind, id, info, tier, levels, off, skillOf, inDeck, onTier, onToggleSkill, onUse, onUnequip, onClose }: Props) {
  const hero = kind === 'heroes' ? heroById(id) : undefined
  const spell = kind === 'spells' ? spellById(id) : undefined
  const tower = kind === 'towers' ? towerById(id) : undefined
  const card = hero ?? spell ?? tower
  if (!card) return null
  const cls = hero ? classOfHero(hero) : tower ? classOfTower(tower) : spell && spell.kind !== 'buff' ? ('magic' as const) : null
  const skillsOpen = tier === 3
  const countable = (s: SkillDef) => !!s.calc && (s.calc.type !== 'summon' || s.calc.duration !== null)

  return (
    <Sheet title={<span className="inspecttitle"><Icon kind={kind} id={id} size={44} />{card.name}</span>} onClose={onClose}>
      <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
        {cls && <span className="chip"><ClassIcon cls={cls} size={15} />{CLASS_LABEL[cls]}</span>}
        {card.rarity && <span className="chip">{card.rarity}</span>}
        {!tower && <span className="chip">Card level 9</span>}
      </div>

      {tower && (
        <>
          <div className="hint" style={{ marginTop: 0 }}>Tower level{inDeck ? '' : ' (add the tower to your deck to change its level)'}</div>
          <div className="levelpick">
            {levels.map((l) => (
              <button key={l.tier} className={tier === l.tier ? 'on' : ''} disabled={!inDeck} onClick={() => onTier(l.tier)}>
                <b>LVL{l.tier}</b><span>{l.dps === null ? 'no data' : `${fmt(l.dps)} DPS`}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="dpsbox">
        <div className="dpsbig">{info.dps === null ? 'No DPS' : `${fmt(info.dps)} DPS`}</div>
        <div className="hint" style={{ marginTop: 0 }}>{info.parts.length > 1 ? 'All of this added together:' : ''}</div>
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
          {hero.skills.map((s) => <SkillCard key={s.id} s={s} res={skillOf(s)} counted={!!skillOf(s).part} />)}
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
          <div className="hint">{skillsOpen ? 'Every skill with numbers counts by default. Untick one to leave it out of the DPS and its gold.' : 'Skills unlock at tower level 3.'}</div>
          {tower.skills.map((s) => {
            const res = skillOf(s), counted = !!res.part && skillsOpen && !off.includes(s.id)
            return <SkillCard key={s.id} s={s} res={res} counted={counted} toggle={countable(s) ? { disabled: !skillsOpen || !inDeck, onChange: () => onToggleSkill(s.id) } : undefined} />
          })}
        </>
      )}

      {spell && (
        <>
          <h3>Stats</h3>
          {spell.cooldown > 0 && <Row k="Cooldown" v={`${spell.cooldown} s`} />}
          {spell.aoe > 0 && <Row k="Area" v={`${spell.aoe} units (${(spell.aoe / TILE).toFixed(1)} tiles)`} />}
          {spell.kind === 'strike' && <Row k="Damage per hit" v={`${range(spell.dmgMin, spell.dmgMax)} × ${spell.hits} hits`} />}
          {spell.kind === 'zone' && <Row k="Damage over time" v={`${fmt(spell.dpsAvg)} DPS for ${spell.duration} s`} />}
          {spell.kind === 'buff' && <Row k="Buff" v={`+${spell.buffDmgPct}% damage, +${spell.buffRangePct}% range, ${spell.duration} s, up to ${spell.buffTowers} towers`} />}
          {spell.kind === 'summon' && spell.summon && <Row k="Summon" v={`${spell.summon.units} × ${range(spell.summon.dmgAvg, spell.summon.dmgAvg)} per hit, ${spell.summon.interval} s, ${spell.summon.duration} s`} />}
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
