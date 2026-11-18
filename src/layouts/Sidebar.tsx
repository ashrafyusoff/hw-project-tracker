import { NavLink } from 'react-router-dom'
import { Archive, BarChart3, Briefcase, ChevronsLeft, ChevronsRight, FolderKanban, Layers, ListChecks, Settings, Truck } from 'lucide-react'
import { cn } from '@/utils/helpers'

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: BarChart3, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/deliverables', label: 'Deliverables', icon: Layers },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/non-npi', label: 'Non-NPI Work', icon: Briefcase },
  { to: '/archived', label: 'Archived', icon: Archive },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={cn('fixed inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 liquid-glass-chrome transition-[width] duration-150', collapsed ? 'w-16' : 'w-60')}>
      <div className="flex h-14 items-center gap-2.5 px-3.5 border-b border-slate-200">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 shrink-0">
          <img src="/favicon.svg" alt="HW Tracker" className="h-5 w-5 rounded-md" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="block text-sm font-bold text-slate-900 truncate leading-tight">HW Tracker</span>
            <span className="block text-[10px] font-medium text-slate-400 truncate leading-tight">Hardware & NPI</span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
        {!collapsed && (
          <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>
        )}
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all duration-150',
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-lg shrink-0 transition-colors',
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/70 group-hover:text-slate-700',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {!collapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-2.5 border-t border-slate-200">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200/70 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> <span>Collapse Sidebar</span></>}
        </button>
      </div>
    </aside>
  )
}
