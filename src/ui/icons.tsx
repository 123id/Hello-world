// Small UI icons. The coin is the game's own (cropped from a screenshot); the four damage-type
// icons are drawn here as SVG: sword = melee, arrow = ranged, blast = magic, dynamite = artillery.
export type DmgClass = 'melee' | 'ranged' | 'magic' | 'artillery'

export const CLASS_LABEL: Record<DmgClass, string> = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic', artillery: 'Artillery' }

const burst = (() => {
  const pts: string[] = []
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16 - Math.PI / 2, r = i % 2 === 0 ? 11 : 6
    pts.push(`${(12 + Math.cos(a) * r).toFixed(2)},${(12 + Math.sin(a) * r).toFixed(2)}`)
  }
  return pts.join(' ')
})()

export function ClassIcon({ cls, size = 14 }: { cls: DmgClass; size?: number }) {
  return (
    <svg className="clsicon" viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={CLASS_LABEL[cls]}>
      <title>{CLASS_LABEL[cls]}</title>
      {cls === 'melee' && (
        <g transform="rotate(45 12 12)">
          <path d="M12 0.5 L14.4 3.6 V15.5 H9.6 V3.6 Z" fill="#eef3fb" stroke="#4c5d7a" strokeWidth="1" strokeLinejoin="round" />
          <rect x="6" y="15.5" width="12" height="2.8" rx="1.3" fill="#ffcf3f" stroke="#8a5a00" strokeWidth="0.9" />
          <rect x="10.5" y="18.3" width="3" height="4" fill="#8b4b1f" />
          <circle cx="12" cy="22.8" r="1.4" fill="#ffcf3f" stroke="#8a5a00" strokeWidth="0.6" />
        </g>
      )}
      {cls === 'ranged' && (
        <g transform="rotate(45 12 12)">
          <rect x="11.1" y="5" width="1.8" height="15" fill="#d2a96a" stroke="#6b4a1f" strokeWidth="0.6" />
          <path d="M12 0.8 L15.8 7.2 H8.2 Z" fill="#e3eaf5" stroke="#4c5d7a" strokeWidth="0.9" strokeLinejoin="round" />
          <path d="M12 16 L8.6 21.6 L12 19.6 L15.4 21.6 Z" fill="#e5484d" stroke="#7a1a1d" strokeWidth="0.6" strokeLinejoin="round" />
        </g>
      )}
      {cls === 'magic' && (
        <g>
          <polygon points={burst} fill="#b54cff" stroke="#4a1b7a" strokeWidth="1" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="4.2" fill="#ffd9ff" />
          <circle cx="12" cy="12" r="2" fill="#fff" />
        </g>
      )}
      {cls === 'artillery' && (
        <g>
          <rect x="6.5" y="9" width="11" height="14" rx="2.2" fill="#d43c3c" stroke="#661212" strokeWidth="1" />
          <rect x="6.5" y="14" width="11" height="2.6" fill="#f3dba5" stroke="#661212" strokeWidth="0.6" />
          <path d="M12 9 Q12 5.6 15.4 4.6" stroke="#7a5a2a" fill="none" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M16.2 0.8 L17.1 3.2 L19.6 3.9 L17.1 4.7 L16.2 7.2 L15.3 4.7 L12.8 3.9 L15.3 3.2 Z" fill="#ffcf3f" stroke="#a15c00" strokeWidth="0.5" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  )
}

export function Coin({ size = 16 }: { size?: number }) {
  return <img className="coin" src={`${import.meta.env.BASE_URL}ui/coin.png`} width={size} height={size} alt="gold" />
}

/** "1,180 🪙" — a gold amount with the coin after it; `plus` marks that some costs are unknown. */
export function Gold({ n, plus, size = 16 }: { n: number | string; plus?: boolean; size?: number }) {
  return <span className="gold">{typeof n === 'number' ? Math.round(n).toLocaleString() : n}{plus ? '+' : ''}<Coin size={size} /></span>
}
