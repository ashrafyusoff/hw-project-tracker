import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { cn } from '@/utils/helpers'
import { useTheme } from '@/hooks/useTheme'
import { ensurePermanentSnapshotLoaded } from '@/services/backupService'

// The frame shared by every page: sidebar on the left, top bar on top, page content below.
export function AppLayout() {
  useTheme()
  useEffect(() => {
    void ensurePermanentSnapshotLoaded()
  }, [])
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')
  const toggle = () => setCollapsed((c) => { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); return !c })
  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className={cn('min-h-screen flex flex-col transition-[padding] duration-150', collapsed ? 'pl-[72px]' : 'pl-56')}>
        <TopBar />
        <main className="flex-1 w-full p-3 sm:p-4 max-w-[1440px] mx-auto"><Outlet /></main>
        <div className="px-3 sm:px-4 pb-3 shrink-0">
          <footer className="flex h-11 items-center justify-center rounded-full liquid-glass shadow-sm px-4 text-center text-xs text-slate-500 max-w-[1440px] mx-auto">
            HW Tracker · Website by <span className="ml-1 font-semibold text-slate-700">Pacca</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
