import { useCallback, useEffect, useRef, useState } from 'react'

interface UseSmoothDragOptions {
  ids: string[]
  axis: 'vertical' | 'horizontal'
  /** Minimum pointer movement in px before drag activates (useful when the whole item is clickable). */
  activationDistance?: number
  /** Gap in px between items when computing shift distance (auto-measured from adjacent rects if omitted). */
  onReorder: (fromIndex: number, toIndex: number) => void
  onClickItem?: (id: string) => void
  scrollContainerRef?: React.RefObject<HTMLElement | null>
}

export function useSmoothDrag<T extends HTMLElement>({
  ids,
  axis,
  activationDistance = 0,
  onReorder,
  onClickItem,
  scrollContainerRef,
}: UseSmoothDragOptions) {
  const itemRefs = useRef<Map<string, T>>(new Map())
  const [draggingId, setDraggingId] = useState('')

  const stateRef = useRef<{
    id: string
    fromIndex: number
    targetIndex: number
    startPointer: number
    lastPointer: number
    active: boolean
    rects: DOMRect[]
    shiftSize: number
    rafId: number | null
  } | null>(null)

  const setItemRef = useCallback((id: string) => {
    return (el: T | null) => {
      if (el) itemRefs.current.set(id, el)
      else itemRefs.current.delete(id)
    }
  }, [])

  const resetAllStyles = useCallback(() => {
    itemRefs.current.forEach((el) => {
      el.style.transition = ''
      el.style.transform = ''
      el.style.willChange = ''
      el.style.zIndex = ''
    })
  }, [])

  useEffect(() => {
    return () => {
      if (stateRef.current?.rafId) cancelAnimationFrame(stateRef.current.rafId)
      resetAllStyles()
    }
  }, [resetAllStyles])

  const applyFrame = useCallback(() => {
    const st = stateRef.current
    if (!st) return
    st.rafId = null

    const delta = st.lastPointer - st.startPointer
    const dragEl = itemRefs.current.get(st.id)
    if (dragEl) {
      dragEl.style.transition = 'none'
      dragEl.style.transform =
        axis === 'vertical'
          ? `translate3d(0, ${delta}px, 0)`
          : `translate3d(${delta}px, 0, 0) scale(1.03)`
      dragEl.style.zIndex = '20'
    }

    // Optional horizontal edge auto-scroll for the project strip
    if (axis === 'horizontal' && scrollContainerRef?.current) {
      const sr = scrollContainerRef.current.getBoundingClientRect()
      if (st.lastPointer < sr.left + 44) scrollContainerRef.current.scrollLeft -= 8
      else if (st.lastPointer > sr.right - 44) scrollContainerRef.current.scrollLeft += 8
    }

    // Compute target index from initial snapshot centers + current pointer delta
    const dragRect = st.rects[st.fromIndex]
    const dragCenter =
      (axis === 'vertical'
        ? dragRect.top + dragRect.height / 2
        : dragRect.left + dragRect.width / 2) + delta

    let nextTarget = st.fromIndex
    for (let i = 0; i < st.rects.length; i++) {
      if (i === st.fromIndex) continue
      const r = st.rects[i]
      const center = axis === 'vertical' ? r.top + r.height / 2 : r.left + r.width / 2
      if (i < st.fromIndex && dragCenter < center) {
        nextTarget = i
        break
      }
      if (i > st.fromIndex && dragCenter > center) {
        nextTarget = i
      }
    }
    st.targetIndex = nextTarget

    // Smooth GPU translate3d shift on sibling items with cubic-bezier(0.2, 0, 0, 1)
    for (let i = 0; i < ids.length; i++) {
      if (i === st.fromIndex) continue
      const el = itemRefs.current.get(ids[i])
      if (!el) continue
      el.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)'
      let offset = 0
      if (st.fromIndex < nextTarget && i > st.fromIndex && i <= nextTarget) {
        offset = -st.shiftSize
      } else if (nextTarget < st.fromIndex && i >= nextTarget && i < st.fromIndex) {
        offset = st.shiftSize
      }
      el.style.transform =
        axis === 'vertical'
          ? `translate3d(0, ${offset}px, 0)`
          : `translate3d(${offset}px, 0, 0)`
    }
  }, [axis, ids, scrollContainerRef])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, id: string) => {
      if (e.button !== 0) return
      const fromIndex = ids.indexOf(id)
      if (fromIndex < 0) return

      const rects: DOMRect[] = []
      for (const itemId of ids) {
        const el = itemRefs.current.get(itemId)
        if (!el) return
        rects.push(el.getBoundingClientRect())
      }

      let shiftSize =
        axis === 'vertical' ? rects[fromIndex].height : rects[fromIndex].width
      if (rects.length > 1) {
        const idxA = fromIndex > 0 ? fromIndex - 1 : 0
        const idxB = idxA + 1
        shiftSize =
          axis === 'vertical'
            ? rects[idxB].top - rects[idxA].top
            : rects[idxB].left - rects[idxA].left
      }

      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)

      const pointerCoord = axis === 'vertical' ? e.clientY : e.clientX
      const immediate = activationDistance <= 0
      stateRef.current = {
        id,
        fromIndex,
        targetIndex: fromIndex,
        startPointer: pointerCoord,
        lastPointer: pointerCoord,
        active: immediate,
        rects,
        shiftSize,
        rafId: null,
      }

      if (immediate) {
        setDraggingId(id)
        itemRefs.current.forEach((el) => {
          el.style.willChange = 'transform'
        })
      }
    },
    [ids, axis, activationDistance],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const st = stateRef.current
      if (!st) return
      const pointerCoord = axis === 'vertical' ? e.clientY : e.clientX
      st.lastPointer = pointerCoord

      if (!st.active) {
        if (Math.abs(pointerCoord - st.startPointer) < activationDistance) return
        st.active = true
        st.startPointer = pointerCoord
        setDraggingId(st.id)
        itemRefs.current.forEach((el) => {
          el.style.willChange = 'transform'
        })
      }

      if (st.rafId === null) {
        st.rafId = requestAnimationFrame(applyFrame)
      }
    },
    [axis, activationDistance, applyFrame],
  )

  const onPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLElement>, id: string) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      const st = stateRef.current
      stateRef.current = null
      if (!st) return
      if (st.rafId !== null) cancelAnimationFrame(st.rafId)

      const wasActive = st.active
      const { fromIndex, targetIndex } = st

      resetAllStyles()
      setDraggingId('')

      if (!wasActive) {
        onClickItem?.(id)
        return
      }
      if (fromIndex !== targetIndex) {
        onReorder(fromIndex, targetIndex)
      }
    },
    [onClickItem, onReorder, resetAllStyles],
  )

  return {
    draggingId,
    setItemRef,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
  }
}
