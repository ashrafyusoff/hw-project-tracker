import { useEffect, useState } from 'react'

/**
 * Like `useState`, but automatically saves and restores the value from `localStorage`
 * so filters, sort modes, expand/collapse states, and view settings persist across
 * tab switches and browser reloads.
 */
export function usePersistedState<T>(key: string, defaultValue: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        return JSON.parse(raw) as T
      }
    } catch {
      // ignore corrupted storage values
    }
    return defaultValue
  })

  useEffect(() => {
    try {
      const nextRaw = JSON.stringify(state)
      if (localStorage.getItem(key) !== nextRaw) {
        localStorage.setItem(key, nextRaw)
      }
    } catch {
      // ignore quota or storage errors
    }
  }, [key, state])

  useEffect(() => {
    const onUndoSync = () => {
      try {
        const raw = localStorage.getItem(key)
        setState(raw !== null ? (JSON.parse(raw) as T) : defaultValue)
      } catch {
        // ignore parse errors
      }
    }
    window.addEventListener('npi-undo-sync', onUndoSync)
    return () => window.removeEventListener('npi-undo-sync', onUndoSync)
  }, [key, defaultValue])

  return [state, setState] as const
}
