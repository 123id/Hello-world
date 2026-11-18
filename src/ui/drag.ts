// Press-and-hold-then-drag for touch, click-and-drag for mouse; a short press is a tap.
// Dragging blocks page scrolling only once it has started (after the hold), so the page still scrolls normally.
import { useRef } from 'react'
import type React from 'react'

let dragging = false
if (typeof document !== 'undefined') {
  document.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault() }, { passive: false })
}

export interface DragHandlers {
  enabled?: boolean // false: tap only
  onTap?: (x: number, y: number) => void
  onStart?: (x: number, y: number) => void
  onMove?: (x: number, y: number) => void
  onEnd?: (x: number, y: number) => void
  onCancel?: () => void
}

const HOLD_MS = 260
const MOVE_PX = 8

interface Press { id: number; sx: number; sy: number; x: number; y: number; timer: number | null; on: boolean; mouse: boolean; el: Element }

export function useLongPressDrag(h: DragHandlers) {
  const cb = useRef(h)
  cb.current = h
  const st = useRef<Press | null>(null)

  const finish = () => {
    const s = st.current
    if (s?.timer) window.clearTimeout(s.timer)
    if (s?.on) dragging = false
    st.current = null
  }
  const start = (s: Press) => {
    s.on = true
    s.timer = null
    dragging = true
    try { s.el.setPointerCapture(s.id) } catch { /* element may be gone */ }
    cb.current.onStart?.(s.x, s.y)
  }

  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const s: Press = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, timer: null, on: false, mouse: e.pointerType === 'mouse', el: e.currentTarget as Element }
      st.current = s
      // A mouse is captured right away so a fast flick off a small target still delivers every move to it
      // (a finger already is, implicitly).
      if (s.mouse) { try { s.el.setPointerCapture(s.id) } catch { /* element may be gone */ } }
      else if (cb.current.enabled !== false) s.timer = window.setTimeout(() => start(s), HOLD_MS)
    },
    onPointerMove(e: React.PointerEvent) {
      const s = st.current
      if (!s || s.id !== e.pointerId) return
      s.x = e.clientX; s.y = e.clientY
      const moved = Math.hypot(s.x - s.sx, s.y - s.sy)
      if (!s.on) {
        if (moved <= MOVE_PX) return
        if (s.mouse && cb.current.enabled !== false) start(s)
        else finish() // a finger that moves before the hold is scrolling the page
        return
      }
      cb.current.onMove?.(s.x, s.y)
    },
    onPointerUp(e: React.PointerEvent) {
      const s = st.current
      if (!s || s.id !== e.pointerId) return
      const wasDrag = s.on
      finish()
      if (wasDrag) cb.current.onEnd?.(e.clientX, e.clientY)
      else if (Math.hypot(e.clientX - s.sx, e.clientY - s.sy) <= MOVE_PX) cb.current.onTap?.(e.clientX, e.clientY)
    },
    onPointerCancel() {
      const wasDrag = st.current?.on
      finish()
      if (wasDrag) cb.current.onCancel?.()
    },
    onContextMenu(e: React.SyntheticEvent) { e.preventDefault() }, // no long-press menu
  }
}
