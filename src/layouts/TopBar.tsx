import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, FolderKanban, ListChecks, Moon, Plus, Search, Settings, Sun, Truck } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { useTheme } from '@/hooks/useTheme'
import type { Project, Supplier, Task } from '@/types'
import { NAV_ITEMS } from './Sidebar'
import { Button } from '@/components/ui'

export function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useTheme()
  const projects = useTable<Project>('projects')
  const projectName = projects?.find((p) => pathname === `/projects/${p.id}`)?.name
  const suppliers = useTable<Supplier>('suppliers')
  const tasks = useTable<Task>('tasks')
  const [query, setQuery] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Close dropdowns when clicking elsewhere
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) { setQuickOpen(false); setQuery('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const section = NAV_ITEMS.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))) ?? NAV_ITEMS[0]
  const isDetail = pathname.startsWith('/projects/')

  const q = query.trim().toLowerCase()
  const projectHits = q ? (projects ?? []).filter((p) => `${p.code} ${p.name} ${p.deviceName}`.toLowerCase().includes(q)).slice(0, 5) : []
  const supplierHits = q ? (suppliers ?? []).filter((s) => `${s.name} ${s.contactPerson}`.toLowerCase().includes(q)).slice(0, 5) : []
  const taskHits = q ? (tasks ?? []).filter((t) => `${t.name} ${t.assignee}`.toLowerCase().includes(q)).slice(0, 5) : []
  const totalHits = projectHits.length + supplierHits.length + taskHits.length

  const go = (to: string) => { setQuery(''); setQuickOpen(false); navigate(to) }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-slate-200 liquid-glass-chrome px-4 sm:px-6">
      <div className="min-w-0 flex items-center gap-3">
        <div className="min-w-0">
          <nav className="flex items-center text-[11px] font-medium text-slate-400" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-primary transition-colors">HW Tracker</Link>
            <ChevronRight className="h-3 w-3 mx-1" />
            {isDetail ? <Link to="/projects" className="hover:text-primary transition-colors">Projects</Link> : <span>{section.label}</span>}
            {isDetail && <><ChevronRight className="h-3 w-3 mx-1" /><span className="truncate">{projectName ?? '…'}</span></>}
          </nav>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">{isDetail ? projectName ?? 'Project' : section.label}</h1>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2.5" ref={boxRef}>
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects, tasks, suppliers…"
            className="h-8 w-52 lg:w-64 rounded-full liquid-glass-pill pl-8 pr-3 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
          {q && (
            <div className="absolute right-0 mt-1.5 w-80 rounded-2xl liquid-glass py-1.5 text-sm max-h-96 overflow-y-auto">
              {totalHits === 0 && <p className="px-3 py-2 text-slate-400">No results</p>}
              {projectHits.map((p) => (
                <button key={p.id} onClick={() => go(`/projects/${p.id}`)} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                  <FolderKanban className="h-4 w-4 text-slate-400 shrink-0" /><span className="font-medium">{p.code}</span><span className="truncate text-slate-500">{p.name}</span>
                </button>
              ))}
              {taskHits.map((t) => (
                <button key={t.id} onClick={() => go('/tasks')} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                  <ListChecks className="h-4 w-4 text-slate-400 shrink-0" /><span className="truncate">{t.name}</span>
                </button>
              ))}
              {supplierHits.map((s) => (
                <button key={s.id} onClick={() => go(`/suppliers?open=${s.id}`)} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                  <Truck className="h-4 w-4 text-slate-400 shrink-0" /><span className="truncate">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <Button variant="primary" onClick={() => setQuickOpen((o) => !o)}><Plus className="h-4 w-4" /> Quick Add</Button>
          {quickOpen && (
            <div className="absolute right-0 mt-1.5 w-44 rounded-2xl liquid-glass py-1.5 text-sm">
              <button onClick={() => go('/projects?new=1')} className="block w-full px-3.5 py-2 text-left hover:bg-slate-100/70">New Project</button>
              <button onClick={() => go('/tasks?new=1')} className="block w-full px-3.5 py-2 text-left hover:bg-slate-100/70">New Task</button>
              <button onClick={() => go('/suppliers?new=1')} className="block w-full px-3.5 py-2 text-left hover:bg-slate-100/70">New Supplier</button>
            </div>
          )}
        </div>

        <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
        </span>

        <div className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 p-0.5">
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="rounded-full p-1.5 text-slate-600 hover:bg-white hover:shadow-sm transition-all"
          >
            {isDark ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <Link to="/settings" className="rounded-full p-1.5 text-slate-600 hover:bg-white hover:shadow-sm transition-all" aria-label="Settings">
            <Settings className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  )
}
