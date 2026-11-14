import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { cn } from '@/utils/helpers'

// The frame shared by every page: sidebar on the left, top bar on top, page content below.
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')
  const toggle = () => setCollapsed((c) => { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); return !c })
  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className={cn('min-h-screen flex flex-col transition-[padding] duration-150', collapsed ? 'pl-16' : 'pl-60')}>
        <TopBar />
        <main className="flex-1 w-full p-4 sm:p-6 max-w-[1440px] mx-auto"><Outlet /></main>
        <footer className="border-t border-slate-200 bg-white/80 px-6 py-2.5 text-center text-xs text-slate-500">
          NPI Project Manager · Website by <span className="font-semibold text-slate-700">Pacca1214</span>
        </footer>
      </div>
    </div>
  )
}
