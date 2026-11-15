import { useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'hw-tracker-theme'
const THEME_CHANGE_EVENT = 'hw-tracker-theme-change'

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return 'light'
}

export function applyThemeToDom(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // ignore storage errors
  }
  applyThemeToDom(mode)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: mode }))
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const initial = getInitialTheme()
    applyThemeToDom(initial)
    return initial
  })

  useEffect(() => {
    applyThemeToDom(theme)
    const onThemeChange = (e: Event) => {
      const next = (e as CustomEvent<ThemeMode>).detail
      if (next === 'light' || next === 'dark') {
        setTheme(next)
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        applyThemeToDom(e.newValue)
        setTheme(e.newValue)
      }
    }
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [theme])

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    setThemeMode(next)
    setTheme(next)
  }

  return {
    theme,
    isDark: theme === 'dark',
    setTheme: setThemeMode,
    toggleTheme,
  }
}

