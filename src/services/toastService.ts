export type ToastType = 'ok' | 'err' | 'info'

export interface ToastMessage {
  id: number
  type: ToastType
  text: string
}

type Listener = (toast: ToastMessage | null) => void

let seq = 0
let current: ToastMessage | null = null
let hideTimer: number | undefined
const listeners = new Set<Listener>()

function emit() {
  for (const fn of listeners) fn(current)
}

export function notify(text: string, type: ToastType = 'ok', durationMs = 2800) {
  if (!text) return
  if (hideTimer) window.clearTimeout(hideTimer)
  const id = ++seq
  current = { id, type, text }
  emit()
  hideTimer = window.setTimeout(() => {
    if (current?.id === id) {
      current = null
      emit()
    }
  }, durationMs)
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener)
  listener(current)
  return () => {
    listeners.delete(listener)
  }
}
