// The card info page, laid out like the game's (title, card badge, hexagon tabs, light stat panel, Unequip / Use)
// plus what the game doesn't have: the DPS of the card with every part and its arithmetic.
import { useState, type ReactNode } from 'react'
import { TIERS, heroById, spellById, towerById, type PerkDef, type SkillDef, type Tier } from '../sim/library'
import type { CardDps, SkillResult } from '../sim/dps'
import { applyPerk, emptyMods } from '../sim/perks'
import { TILE } from '../data/kingdomwars'
import type { CardKind } from '../data/icons'
import { Icon } from './common'
import { CLASS_LABEL, ClassIcon, Gold } from './icons'
import { classOfHero, classOfTower, fmt } from './state'

export interface InfoCompute { info: (t: Tier) => CardDps; skill: (s: SkillDef, t: Tier) => SkillResult }
interface Props {
  kind: CardKind; id: string
  inDeck: boolean; deckTier: Tier; off: string[]
  compute: InfoCompute
  onTier: (t: Tier) => void; onToggleSkill: (skillId: string) => void
  onUse: () => void; onUnequip: () => void; onClose: () => void
}

const pickTier = (v: number | number[], t: Tier) => (Array.isArray(v) ? v[t - 1] : v)

function Tile({ label, value, tone, wide }: { label: string; value: ReactNode; tone?: 'blue' | 'pink' | 'gold' | 'green'; wide?: boolean }) {
  return <div className={'itile' + (tone ? ' ' + tone : '') + (wide ? ' wide' : '')}><span>{label}</span><b>{value}</b></div>
}

function PerkList({ perks }: { perks: PerkDef[] }) {
  if (!perks.length) return <div className="ihint">No perks.</div>
  return (
    <>
      {perks.map((p, i) => {
        const m = emptyMods(); applyPerk(m, p)
        const modeled = m.ignored.length === 0
        return (
          <div key={i} className="iperk">
            <div><b>{p.name}</b><span className={'itag ' + (modeled ? 'ok' : 'no')}>{modeled ? 'counted' : 'not counted'}</span></div>
            <small>{p.pct !== null && p.stat ? `${p.pct > 0 ? '+' : ''}${p.pct}% ${p.stat} (${p.target})` : 'no value in the library'}{p.inferred ? ' *' : ''}{!modeled ? ` — ${p.target === 'enemies' ? 'works on enemies, which a DPS number does not include' : m.ignored[0]?.why}` : ''}</small>
          </div>
        )
      })}
    </>
  )
}

const initials = (n: string) => n.split(/[\s']+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')

export function InfoPage({ kind, id, inDeck, deckTier, off, compute, onTier, onToggleSkill, onUse, onUnequip, onClose }: Props) {
  const hero = kind === 'heroes' ? heroById(id) : undefined
  const spell = kind === 'spells' ? spellById(id) : undefined
  const tower = kind === 'towers' ? towerById(id) : undefined
  const card = hero ?? spell ?? tower
  const [tab, setTab] = useState<string>('info')
  const [viewTier, setViewTier] = useState<Tier>(deckTier)
  if (!card) return null

  const tier: Tier = tower ? viewTier : 3
  const skills: SkillDef[] = (tower ?? hero)?.skills ?? []
  const info = compute.info(tier)
  const hasStats = info.dps !== null || info.parts.length > 0
  // opponent-only skills are not for the boss, and a skill with no numbers has nothing to show
  const shownSkills = skills.filter((s) => !s.calcWhy?.startsWith('scope') && s.calc !== null)
  const cls = hero ? classOfHero(hero) : tower ? classOfTower(tower) : spell && spell.kind !== 'buff' ? ('magic' as const) : null
  const nextTier = () => { const n = ((tier % 3) + 1) as Tier; setViewTier(n); if (inDeck) onTier(n) }
  const skill = tab !== 'info' ? shownSkills.find((s) => s.id === tab) : undefined
  const odd = card.dataLevel !== null && card.dataLevel !== 9

  const panel = (() => {
    if (skill) {
      const res = compute.skill(skill, tier), k = skill.calc
      const cd = k && (k.type === 'cast' ? pickTier(k.cooldown, tier) : k.cooldown)
      const counted = !!res.part && tier === 3 && !off.includes(skill.id)
      const canToggle = !!k && (k.type !== 'summon' || k.duration !== null) && !!tower
      return (
        <>
          <div className="ipanelhead"><b>{skill.name}</b>{tower && <button className="ilvl" onClick={nextTier}>LVL{tier}</button>}</div>
          <div className="itiles">
            {skill.cost != null && <Tile label="Cost" value={<Gold n={skill.cost} size={15} />} />}
            {cd ? <Tile label="Cooldown" value={`${cd}`} /> : null}
            {skill.units != null && <Tile label="Affected units" value={skill.units} />}
            {skill.dmgMin != null && <Tile label="Damage Min" value={fmt(skill.dmgMin)} />}
            {skill.dmgMax != null && <Tile label="Damage Max" value={fmt(skill.dmgMax)} />}
          </div>
          <div className={'idps' + (res.part ? '' : ' none')}>
            <div className="idpsbig">{res.part ? `+${fmt(res.part.dps)} DPS` : 'No DPS'}</div>
            {res.part ? <div className="ihint">{res.part.detail}</div> : <div className="ihint">Not counted: {res.why}</div>}
            {tower && tier !== 3 && res.part && <div className="ihint">Skills only work at tower level 3 (switch the level above).</div>}
          </div>
          {canToggle && (
            <label className="iswitch"><input type="checkbox" checked={counted} disabled={tier !== 3 || !inDeck} onChange={() => onToggleSkill(skill.id)} />
              <span>Count this skill in the DPS{!inDeck ? ' (add the card to your deck first)' : ''}</span></label>
          )}
        </>
      )
    }
    // ---- the stats tab -------------------------------------------------------------------------
    const td = tower?.tiers[tier]
    return (
      <>
        <div className="ipanelhead"><b>{tower ? 'Tower stats' : hero ? 'Hero stats' : 'Spell stats'}</b>{tower ? <button className="ilvl" onClick={nextTier}>LVL{tier}</button> : <span className="ilvl static">LVL 9</span>}</div>
        {!hasStats && (
          <div className="inostats">{spell && spell.kind === 'other' && !spell.issues.some((i) => /missing|summon|unknown/.test(i)) ? 'This spell has no damage numbers.' : 'No stats for this card yet.'}</div>
        )}
        {hasStats && <div className="idps">
          <div className="idpsbig">{info.dps === null ? 'No DPS' : `${fmt(info.dps)} DPS`}</div>
          {info.parts.length > 1 && <div className="ihint" style={{ marginTop: 0 }}>All of this added together:</div>}
          {info.parts.map((p) => <div key={p.label} className="idpspart"><span><b>{p.label}</b><small>{p.detail}</small></span><b>{fmt(p.dps)}</b></div>)}
          {info.notes.map((n, i) => <div key={i} className="ihint warn">{n}</div>)}
          {tower && (
            <div className="ilevels">
              {TIERS.map((t) => { const d = compute.info(t).dps; return <button key={t} className={t === tier ? 'on' : ''} onClick={() => { setViewTier(t); if (inDeck) onTier(t) }}><span>LVL{t}</span><b>{d === null ? '—' : fmt(d)}</b></button> })}
            </div>
          )}
        </div>}
        {odd && hasStats && <div className="iwarn">These numbers are from card level {card.dataLevel}; the game shows the numbers of your own card level, so they differ.</div>}
        {hasStats && <div className="itiles">
          {tower && <Tile label="Type" tone="pink" value={<>{cls && <ClassIcon cls={cls} size={14} />}{cls ? CLASS_LABEL[cls] : ''}</>} />}
          {tower && td && <Tile label="Cost" value={td.cost != null ? <Gold n={td.cost} size={15} /> : '—'} />}
          {tower && td && <Tile label="Attack speed" value={td.interval} />}
          {tower && td && <Tile label={tower.kind === 'barracks' ? 'Hit min' : 'Min damage'} value={fmt(td.dmgMin)} />}
          {tower && td && <Tile label={tower.kind === 'barracks' ? 'Hit max' : 'Max damage'} value={fmt(td.dmgMax)} />}
          {tower && td && <Tile label="Range" value={td.range ?? '—'} />}
          {tower?.kind === 'barracks' && td && <Tile label="Soldiers" value={td.units ? `${td.units} × ${fmt(td.unitHp ?? 0)} HP` : '—'} wide />}
          {hero && <>
            <Tile label="Type" tone="pink" value={<>{cls && <ClassIcon cls={cls} size={14} />}{cls ? CLASS_LABEL[cls] : ''}</>} />
            <Tile label="Health" value={fmt(hero.hp)} /><Tile label="Armor" value={`${hero.armor}%`} />
            <Tile label="Attack speed" value={hero.interval} /><Tile label="Respawn" value={`${hero.respawn}${hero.respawnAssumed ? '*' : ''}`} />
            <Tile label="Min damage" value={fmt(hero.dmgMin)} /><Tile label="Max damage" value={fmt(hero.dmgMax)} />
          </>}
          {spell && <>
            <Tile label="Type" tone="pink" value={<>{cls && <ClassIcon cls={cls} size={14} />}{cls ? CLASS_LABEL[cls] : 'Buff'}</>} />
            {spell.cooldown > 0 && <Tile label="Cooldown" value={spell.cooldown} />}
            {spell.aoe > 0 && <Tile label="Area" value={`${spell.aoe} (${(spell.aoe / TILE).toFixed(1)} tiles)`} />}
            {spell.kind === 'strike' && <><Tile label="Damage min" value={fmt(spell.dmgMin)} /><Tile label="Damage max" value={fmt(spell.dmgMax)} /><Tile label="Hits" value={spell.hits} /></>}
            {spell.kind === 'zone' && <><Tile label="Damage over time" value={`${fmt(spell.dpsAvg)} / s`} /><Tile label="Duration" value={`${spell.duration} s`} /></>}
            {spell.kind === 'buff' && <><Tile label="Damage" value={`+${spell.buffDmgPct}%`} /><Tile label="Range" value={`+${spell.buffRangePct}%`} /><Tile label="Duration" value={`${spell.duration} s`} /><Tile label="Towers" value={spell.buffTowers} /></>}
            {spell.kind === 'summon' && spell.summon && <><Tile label="Units" value={spell.summon.units} /><Tile label="Hit" value={fmt(spell.summon.dmgAvg)} /><Tile label="Attack speed" value={spell.summon.interval} /><Tile label="Lasts" value={`${spell.summon.duration} s`} /></>}
          </>}
        </div>}
        <div className="isub">Perks</div>
        <PerkList perks={card.perks} />
        {card.perks.some((p) => p.inferred) && <div className="ihint">* value filled in from another card with the same perk name</div>}
      </>
    )
  })()

  return (
    <div className="infopage">
      <div className="infotop">
        <div className="infotitle">{card.name}</div>
        <div className="inforarity">{card.rarity ?? ''}</div>
        <div className="infoart"><Icon kind={kind} id={id} size={150} /></div>
      </div>
      <div className="infobody">
        <div className="infotabs">
          <div className="infobadge"><Icon kind={kind} id={id} size={58} /><span>{tower ? `LVL ${tier}` : 'LVL 9'}</span></div>
          <button className={'hext' + (tab === 'info' ? ' on' : '')} onClick={() => setTab('info')} aria-label="Stats">i</button>
          {shownSkills.map((s) => {
            const res = compute.skill(s, tier)
            return <button key={s.id} className={'hext' + (tab === s.id ? ' on' : '') + (res.part ? '' : ' dim')} onClick={() => setTab(s.id)} aria-label={s.name} title={s.name}>{initials(s.name)}</button>
          })}
        </div>
        <div className="ipanel">{panel}</div>
        {inDeck
          ? <button className="gbtn red wide" onClick={onUnequip}>Unequip</button>
          : <button className="gbtn green wide" onClick={onUse}>Use</button>}
      </div>
      <button className="closex" onClick={onClose} aria-label="Close">✕</button>
    </div>
  )
}

