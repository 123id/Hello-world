import type { Pt } from './types'

export interface PathInfo { pts: Pt[]; cum: number[]; length: number }

export function buildPath(pts: Pt[]): PathInfo {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }
  return { pts, cum, length: cum[cum.length - 1] }
}

export function pointAt(p: PathInfo, s: number): Pt {
  const d = Math.max(0, Math.min(p.length, s))
  let i = 1
  while (i < p.cum.length - 1 && p.cum[i] < d) i++
  const seg = p.cum[i] - p.cum[i - 1] || 1
  const f = (d - p.cum[i - 1]) / seg
  return {
    x: p.pts[i - 1].x + (p.pts[i].x - p.pts[i - 1].x) * f,
    y: p.pts[i - 1].y + (p.pts[i].y - p.pts[i - 1].y) * f,
  }
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
