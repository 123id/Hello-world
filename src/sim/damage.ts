import type { BossDef, DmgType } from './types'

export function effective(boss: BossDef, amount: number, type: DmgType): number {
  if (type === 'physical') return amount * (1 - boss.armor)
  if (type === 'magic') return amount * (1 - boss.magicResist)
  return amount
}
