import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { cn } from '@/utils/helpers'
import { useTheme } from '@/hooks/useTheme'
import { ensurePermanentSnapshotLoaded } from '@/services/backupService'
import { initGlobalUndo, undoLastAction, withoutUndo } from '@/services/undoService'
import { notify, subscribeToast, type ToastMessage } from '@/services/toastService'

// The frame shared by every page: sidebar on the left, top bar on top, page content below.
export function AppLayout() {
  useTheme()
  const [toast, setToast] = useState<ToastMessage | null>(null)

  useEffect(() => subscribeToast(setToast), [])

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
        notify(undone ? `Undone: ${label}` : 'Nothing to undo', 'info', 2400)
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')
  const toggle = () => setCollapsed((c) => { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); return !c })
  return (
    <div className="min-h-screen">
      {toast && (
        <div
          key={toast.id}
          role="status"
          className={cn(
            'pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-[90] inline-flex items-center gap-2 rounded-full liquid-glass px-4 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md max-w-[90vw]',
            toast.type === 'ok' && 'ring-1 ring-emerald-400/75 text-emerald-800 dark:ring-emerald-400/55 dark:text-emerald-200',
            toast.type === 'err' && 'ring-1 ring-red-400/75 text-red-700 dark:ring-red-400/55 dark:text-red-300',
            toast.type === 'info' && 'ring-1 ring-primary/45 text-slate-800 dark:text-slate-100',
          )}
        >
          {toast.type === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
          {toast.type === 'err' && <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />}
          {toast.type === 'info' && <RotateCcw className="h-3.5 w-3.5 text-primary shrink-0" />}
          <span className="truncate">{toast.text}</span>
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
