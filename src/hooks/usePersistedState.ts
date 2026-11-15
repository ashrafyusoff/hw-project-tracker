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
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // ignore quota or storage errors
    }
  }, [key, state])

  return [state, setState] as const
}
