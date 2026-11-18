import { useState } from 'react'
import { BOSS_KW as BOSS } from '../data/kingdomwars'
import type { PerkDef } from '../sim/library'
import type { Mods } from '../sim/perks'
import { FIGHT_SECONDS, type SimResult } from '../sim/types'
import { Chart } from './common'
import { ClassIcon, type DmgClass } from './icons'
import { classOfSource, fmt, PATH } from './state'

interface Props {
  result: SimResult; onField: number; mods: Mods; perks: PerkDef[]; classByName: Record<string, DmgClass>
  explorer: { s: number; dps: number }[]; exploreS: number; setExploreS: (n: number) => void; exploreInfo: string
}

export function Results({ result, onField, mods, perks, classByName, explorer, exploreS, setExploreS, exploreInfo }: Props) {
  const [open, setOpen] = useState(false)
  const total = Object.values(result.bossDamageBy).reduce((a, b) => a + b, 0)
  const headline = result.killTime !== null ? `Boss killed at ${result.killTime.toFixed(1)} s`
    : result.crossedAt !== null ? `Boss crossed the line at ${result.crossedAt.toFixed(1)} s (not killed)` : `Time ran out: ${fmt(result.bossHpLeft)} HP left`
  return (
    <>
      <section className="panel">
        <h2>Boss fight</h2>
        <div className={'headline ' + (result.killTime !== null ? 'good' : 'bad')}>{headline}</div>
        <div className="hint">{fmt(total)} of {fmt(BOSS.hp)} HP dealt · creeps killed {result.creepsKilled}/{result.creepsSpawned}</div>
        <label className="lab">Boss HP over time</label>
        <Chart data={result.timeline.map((p) => ({ x: p.t, y: p.bossHp }))} color="#ff6b6b" />
        <label className="lab">Damage to the boss per second</label>
        <Chart data={result.timeline.map((p) => ({ x: p.t, y: p.dps }))} color="#5fe28a" bars />
      </section>

      <section className="panel">
        <h2>Damage by source</h2>
        <table className="tbl"><tbody>
          {Object.entries(result.bossDamageBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <tr key={k}><td><span className="srcname">{(() => { const c = classOfSource(k, classByName); return c ? <ClassIcon cls={c} size={14} /> : <span style={{ width: 14 }} /> })()}{k}</span></td><td>{fmt(v / Math.max(0.1, onField))}/s</td><td>{((v / Math.max(1, total)) * 100).toFixed(1)}%</td></tr>
          ))}
          {total === 0 && <tr><td>nothing hit the boss</td></tr>}
        </tbody></table>
      </section>

      <section className="panel">
        <button className="btn wide" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} analysis, perks and assumptions</button>
        {open && (
          <div style={{ marginTop: 12 }}>
            <h3>Where is the boss easiest to hit?</h3>
            <div className="hint">Sustained DPS if the boss stood still at one point of its route (ignores creeps and spells).</div>
            <label className="lab">{exploreInfo}</label>
            <input type="range" min={0} max={Math.round(PATH.length)} value={exploreS} onChange={(e) => setExploreS(+e.target.value)} />
            <Chart data={explorer.map((p) => ({ x: (p.s / PATH.length) * FIGHT_SECONDS, y: p.dps }))} color="#6ab0ff" />

            <h3>Deck perks applied</h3>
            <div className="small">
              {perks.filter((p) => p.pct !== null && p.stat && p.target !== 'enemies').map((p, i) => (
                <div key={i}>{p.name}: {p.pct! > 0 ? '+' : ''}{p.pct}% {p.stat} ({p.target}){p.inferred ? ' *' : ''}</div>
              ))}
              {mods.ignored.length > 0 && <div className="hint">Not applied: {[...new Set(mods.ignored.map((m) => `${m.perk} (${m.why})`))].join('; ')}</div>}
              <div className="hint">* value filled in from another card with the same perk name</div>
            </div>

            <h3>Not simulated for this build</h3>
            <div className="small warn">{result.notes.length ? result.notes.map((n, i) => <div key={i}>{n}</div>) : <span className="hint">nothing flagged</span>}</div>

            <h3>Assumptions</h3>
            <div className="small hint">
              Creep speed, damage and route split · creep spawn spacing (even from first appearance until 215 s, fitted to krb-deck) · each unit or hero blocks one ground enemy ·
              barracks unit respawn 10 s · hero skills fire when the boss is within 200 units · hero skill damage is per cast · 1 tile = 80 range units ·
              purchases happen at the start (gold is shown, not enforced) · average of min/max damage, no crits, boss armor and resist unknown (0).
            </div>
          </div>
        )}
      </section>
    </>
  )
}
