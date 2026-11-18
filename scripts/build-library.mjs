// Builds src/data/library.json from the raw card export.
// Drops free-text provenance (notes, sources, chat handles) so nothing personal ships in a public repo.
// Usage: node scripts/build-library.mjs [rawPath]
import { readFileSync, writeFileSync } from 'node:fs'

const raw = JSON.parse(readFileSync(process.argv[2] ?? 'data/raw/cards-full.json', 'utf8'))
const DROP = new Set([
  'note', 'notes', 'source', 'supersededWebEntry', 'discordGuildNote', 'cooldownSource',
  'projectionMethod', 'rankShown', 'webAnchorReference', 'spellStatisticsPanel',
  'panelLowerHalfUnverified', 'statConflict', 'cooldownConflict', 'anchorStats',
])
const clean = (v) => {
  if (Array.isArray(v)) return v.map(clean)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, clean(x)]))
  }
  return v
}
const out = {
  bossDefault: raw.meta.bossDefault,
  heroes: clean(raw.heroes), spells: clean(raw.spells), towers: clean(raw.towers),
}
const text = JSON.stringify(out)
// Personal strings to refuse come from a private, gitignored list (one per line) so they never appear in the repo.
let terms = ['discord']
try { terms = terms.concat(readFileSync('data/raw/scrub-terms.txt', 'utf8').split('\n').map((t) => t.trim()).filter(Boolean)) } catch { /* optional */ }
const leaks = terms.filter((t) => text.toLowerCase().includes(t.toLowerCase()))
if (leaks.length) { console.error('REFUSING: personal strings remain:', leaks.length, 'term(s) matched'); process.exit(1) }
writeFileSync('src/data/library.json', text + '\n')
console.log(`wrote src/data/library.json (${(text.length / 1024).toFixed(0)} KB): ` +
  `${out.towers.length} towers, ${out.heroes.length} heroes, ${out.spells.length} spells`)
