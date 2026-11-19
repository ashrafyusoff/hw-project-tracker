import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { cn } from '@/utils/helpers'
import { useTheme } from '@/hooks/useTheme'
import { ensurePermanentSnapshotLoaded } from '@/services/backupService'
import { initGlobalUndo, undoLastAction, withoutUndo } from '@/services/undoService'

// The frame shared by every page: sidebar on the left, top bar on top, page content below.
export function AppLayout() {
  useTheme()
  const [undoToast, setUndoToast] = useState('')

  useEffect(() => {
    initGlobalUndo()
    void withoutUndo(() => ensurePermanentSnapshotLoaded())
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const isTextInput =
        (tag === 'INPUT' &&
          !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(
            (target as HTMLInputElement).type,
          )) ||
        tag === 'TEXTAREA' ||
        !!target?.isContentEditable
      if (isTextInput) return

      e.preventDefault()
      void undoLastAction().then(({ undone, label }) => {
        const msg = undone ? `Undone: ${label}` : 'Nothing to undo'
        setUndoToast(msg)
        window.setTimeout(() => setUndoToast((cur) => (cur === msg ? '' : cur)), 2400)
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')
  const toggle = () => setCollapsed((c) => { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); return !c })
  return (
    <div className="min-h-screen">
      {undoToast && (
        <div
          role="status"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[80] inline-flex items-center gap-1.5 rounded-full liquid-glass px-4 py-1.5 text-xs font-semibold text-slate-800 shadow-lg"
        >
          <RotateCcw className="h-3.5 w-3.5 text-primary" />
          <span>{undoToast}</span>
        </div>
      )}
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className={cn('min-h-screen flex flex-col transition-[padding] duration-150', collapsed ? 'pl-[72px]' : 'pl-56')}>
        <div className="flex-1 flex flex-col w-full px-3 sm:px-4">
          <TopBar />
          <main className="flex-1 w-full py-3"><Outlet /></main>
          <div className="pb-3 shrink-0 w-full">
            <footer className="flex h-11 w-full items-center justify-center rounded-full liquid-glass shadow-sm px-4 text-center text-xs text-slate-500">
              HW Tracker · Website by <span className="ml-1 font-semibold text-slate-700">Pacca</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  )
}
