import { NavLink } from 'react-router-dom'
import { Archive, BarChart3, Briefcase, ChevronsLeft, ChevronsRight, FolderKanban, Layers, Settings, Truck } from 'lucide-react'
import { cn } from '@/utils/helpers'

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: BarChart3, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/deliverables', label: 'Deliverables', icon: Layers },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/non-npi', label: 'Non-NPI Work', icon: Briefcase },
  { to: '/archived', label: 'Archived', icon: Archive },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col gap-3 p-3 transition-[width] duration-150 pointer-events-none',
        collapsed ? 'w-[72px]' : 'w-56',
      )}
    >
      {/* Island 1: "HW Tracker" Brand Island */}
      <div
        className={cn(
          'pointer-events-auto flex h-12 items-center rounded-full liquid-glass shadow-md px-3 shrink-0',
          collapsed ? 'justify-center' : 'gap-2.5',
        )}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20 shrink-0">
          <img src="/favicon.svg" alt="HW Tracker" className="h-4 w-4 rounded-sm" />
        </div>
        {!collapsed && (
          <span className="text-sm font-bold text-slate-900 truncate leading-tight">HW Tracker</span>
        )}
      </div>

      {/* Island 2: Workspace Navigation & Collapse Island */}
      <div className="pointer-events-auto flex-1 flex flex-col rounded-3xl liquid-glass shadow-md overflow-hidden min-h-0">
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
                  'group flex items-center rounded-full py-1.5 text-xs font-semibold transition-all duration-150',
                  collapsed ? 'justify-center px-1.5' : 'gap-2.5 px-2.5',
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
                      'flex h-6 w-6 items-center justify-center rounded-full shrink-0 transition-colors',
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/70 group-hover:text-slate-700',
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

        <div className="flex h-11 items-center px-2.5 shrink-0">
          <button
            onClick={onToggle}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full liquid-glass-pill px-3 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronsRight className="h-3.5 w-3.5" />
            ) : (
              <>
                <ChevronsLeft className="h-3.5 w-3.5" />
                <span>Collapse Sidebar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
