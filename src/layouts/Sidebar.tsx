import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map())
  const [indicator, setIndicator] = useState<{ top: number; left: number; width: number; height: number; ready: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    ready: false,
  })

  const activeItem = NAV_ITEMS.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))) ?? NAV_ITEMS[0]

  useLayoutEffect(() => {
    const update = () => {
      const el = linkRefs.current.get(activeItem.to)
      if (!el) return
      setIndicator({
        top: el.offsetTop,
        left: el.offsetLeft,
        width: el.offsetWidth,
        height: el.offsetHeight,
        ready: true,
      })
    }
    update()
    const raf = requestAnimationFrame(update)
    const timer = window.setTimeout(update, 180)
    const navEl = navRef.current
    const ro = navEl ? new ResizeObserver(update) : null
    if (navEl && ro) ro.observe(navEl)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      ro?.disconnect()
    }
  }, [activeItem.to, collapsed])

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
        <nav ref={navRef} className="relative flex-1 flex flex-col gap-1 px-2.5 py-3 overflow-y-auto overflow-x-hidden">
          {!collapsed && (
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Workspace
            </p>
          )}
          {/* Sliding Liquid Glass Blue Pill Indicator */}
          {indicator.ready && (
            <div
              aria-hidden="true"
              style={{
                transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)`,
                width: indicator.width,
                height: indicator.height,
                transition:
                  'transform 340ms cubic-bezier(0.22, 1, 0.36, 1), width 160ms cubic-bezier(0.22, 1, 0.36, 1), height 160ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              className="pointer-events-none !m-0 absolute top-0 left-0 rounded-full bg-primary shadow-md"
            />
          )}
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              ref={(el) => {
                if (el) linkRefs.current.set(to, el)
                else linkRefs.current.delete(to)
              }}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'relative z-10 group flex items-center rounded-full text-xs font-semibold transition-colors duration-200',
                  collapsed ? 'mx-auto h-[36px] w-[36px] justify-center p-0' : 'h-[36px] gap-2.5 pl-[5px] pr-3',
                  isActive
                    ? 'text-white'
                    : 'text-slate-600 ring-1 ring-inset ring-transparent hover:ring-blue-500/80 hover:text-slate-900 dark:hover:ring-blue-400/85 dark:hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-[26px] w-[26px] items-center justify-center rounded-full shrink-0 transition-colors duration-200',
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400',
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
