import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckSquare, ChevronLeft, ChevronRight, ClipboardPaste, Copy, GripVertical, Scissors, Star, X } from 'lucide-react'
import type { Milestone, Priority, Project, Task, Workstream } from '@/types'
import { Badge, Button, Card } from '@/components/ui'
import { usePersistedState } from '@/hooks/usePersistedState'
import { duplicateTaskToDate, rescheduleTask, updateTask } from '@/services/taskService'
import { duplicateMilestoneToDate, rescheduleMilestone } from '@/services/milestoneService'
import { TaskFormBody } from '@/features/tasks/TaskForm'
import { MilestoneFormBody } from '@/features/tasks/MilestoneForm'
import { cn, todayStr } from '@/utils/helpers'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
const MINI_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

export function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Returns the Monday of the week for `d`. */
export function getMondayOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = copy.getDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy
}

/** ISO 8601 week number (1..53) */
export function getIsoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** Maps any date (including Sat/Sun) into the 5-day workweek (Sat/Sun snap to Friday of that workweek). */
function snapToWorkdayYmd(ymd: string): string {
  const d = parseYmd(ymd)
  const dow = d.getDay()
  if (dow === 6) return toYmd(addDays(d, -1))
  if (dow === 0) return toYmd(addDays(d, -2))
  return ymd
}

/** Builds a calendar grid for the given month.
 *  `hideEndOverflow`: blanks out days after the last day of `month` (used at the end of the 1st mini calendar).
 *  `hideStartOverflow`: blanks out days before the 1st day of `month` (used at the beginning of the 2nd mini calendar).
 */
function buildMiniMonthWeeks(year: number, month: number, opts: { hideStartOverflow?: boolean; hideEndOverflow?: boolean }) {
  const firstOfMonth = new Date(year, month, 1)
  const lastOfMonth = new Date(year, month + 1, 0)
  const startMonday = getMondayOfWeek(firstOfMonth)
  const rows: {
    ww: number
    monday: Date
    mondayYmd: string
    days: { date: Date; ymd: string; dayNum: number; inMonth: boolean; isWeekday: boolean; hidden: boolean }[]
  }[] = []

  let cur = startMonday
  while (cur <= lastOfMonth) {
    const monday = new Date(cur)
    const ww = getIsoWeek(monday)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i)
      const beforeMonth = d < firstOfMonth
      const afterMonth = d > lastOfMonth
      const hidden = !!(opts.hideStartOverflow && beforeMonth) || !!(opts.hideEndOverflow && afterMonth)
      return {
        date: d,
        ymd: toYmd(d),
        dayNum: d.getDate(),
        inMonth: d.getMonth() === month,
        isWeekday: i < 5,
        hidden,
      }
    })
    rows.push({ ww, monday, mondayYmd: toYmd(monday), days })
    cur = addDays(cur, 7)
  }
  return {
    title: firstOfMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    rows,
  }
}

interface ItemRef {
  kind: 'task' | 'milestone'
  id: string
  name: string
}

interface ClipboardItem extends ItemRef {
  mode: 'copy' | 'cut'
}

const PRIORITY_ORDER: Record<Priority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
}

const PRIORITY_ITEMS: { priority: Priority; boxCls: string; cardCls: string }[] = [
  {
    priority: 'Critical',
    boxCls: 'bg-red-500 border-red-700',
    cardCls: 'border-red-400 border-l-4 border-l-red-600 bg-red-100/90 text-red-950',
  },
  {
    priority: 'High',
    boxCls: 'bg-amber-400 border-amber-600',
    cardCls: 'border-amber-400 border-l-4 border-l-amber-500 bg-amber-100/90 text-amber-950',
  },
  {
    priority: 'Medium',
    boxCls: 'bg-blue-500 border-blue-700',
    cardCls: 'border-blue-400 border-l-4 border-l-blue-600 bg-blue-100/90 text-blue-950',
  },
  {
    priority: 'Low',
    boxCls: 'bg-slate-300 border-slate-500',
    cardCls: 'border-slate-300 border-l-4 border-l-slate-500 bg-slate-100 text-slate-900',
  },
]

const PRIORITY_CARD_STYLE: Record<Priority, string> = {
  Critical: PRIORITY_ITEMS[0].cardCls,
  High: PRIORITY_ITEMS[1].cardCls,
  Medium: PRIORITY_ITEMS[2].cardCls,
  Low: PRIORITY_ITEMS[3].cardCls,
}

function isTaskOverdue(t: Task, today: string): boolean {
  return t.status !== 'Completed' && t.status !== 'Cancelled' && !!t.dueDate && t.dueDate < today
}

// Task colour is strictly by priority; progress & completion remain tracked in text/metadata
function taskCardStyle(t: Task): string {
  return PRIORITY_CARD_STYLE[t.priority] ?? PRIORITY_CARD_STYLE.Medium
}

function milestoneCardStyle(): string {
  return 'border-purple-500 border-l-4 border-l-purple-700 bg-purple-100/95 text-purple-950'
}

function milestoneVarianceLabel(m: Milestone): string {
  if (!m.targetDate || !m.actualDate || m.actualDate === m.targetDate) return ''
  const t = parseYmd(m.targetDate).getTime()
  const a = parseYmd(m.actualDate).getTime()
  const diffDays = Math.round((a - t) / 86400000)
  if (diffDays < 0) return `Pull-in ${Math.abs(diffDays)}d`
  if (diffDays > 0) return `Delay ${diffDays}d`
  return ''
}

export function WorkWeekCalendar({
  tasks,
  milestones,
  projects,
  workstreams = [],
  baseMonday: controlledMonday,
  onBaseMondayChange,
}: {
  tasks: Task[]
  milestones: Milestone[]
  projects: Project[]
  workstreams?: Workstream[]
  baseMonday?: Date
  onBaseMondayChange?: (d: Date) => void
}) {
  const today = todayStr()
  // Start at current week's Monday by default; Prev/Next jumps by 1 month
  const [internalMonday, setInternalMonday] = useState<Date>(() => getMondayOfWeek(parseYmd(today)))
  const baseMonday = controlledMonday ?? internalMonday
  const setBaseMonday = (updater: Date | ((prev: Date) => Date)) => {
    const next = typeof updater === 'function' ? updater(baseMonday) : updater
    setInternalMonday(next)
    onBaseMondayChange?.(next)
  }
  // Customizable number of weeks (1..10, default 4) — saved in localStorage
  const [weeksToShow, setWeeksToShow] = usePersistedState<number>('npi.calendar.weeksToShow', 4)
  const clampedWeeks = Math.max(4, Math.min(10, weeksToShow))
  const [filterProject, setFilterProject] = usePersistedState<string>('npi.calendar.filterProject', '')
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([])
  const [dragOverCell, setDragOverCell] = useState<string>('')
  const [draggingId, setDraggingId] = useState<string>('')
  const [selectedItem, setSelectedItem] = useState<ItemRef | null>(null)
  const [selectedDay, setSelectedDay] = useState<string>(today)
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null)
  const [toast, setToast] = useState<string>('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTarget, setDrawerTarget] = useState<{ kind: 'task'; task: Task } | { kind: 'milestone'; milestone: Milestone } | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? '' : t)), 2800)
  }

  function openTaskDrawer(t: Task) {
    setDrawerTarget({ kind: 'task', task: t })
    setDrawerOpen(true)
  }

  function openMilestoneDrawer(m: Milestone) {
    setDrawerTarget({ kind: 'milestone', milestone: m })
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
  }

  function togglePriorityFilter(p: Priority) {
    setSelectedPriorities((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  }

  const isPriorityDimmed = (p: Priority) => selectedPriorities.length > 0 && !selectedPriorities.includes(p)

  async function handlePriorityBoxClick(p: Priority) {
    if (!selectedItem) {
      showToast('Select a task first, then click a priority box to change its priority')
      return
    }
    if (selectedItem.kind !== 'task') {
      showToast('Milestones do not have a priority field')
      return
    }
    const targetTask = tasks.find((t) => t.id === selectedItem.id)
    if (!targetTask) return
    if (targetTask.priority === p) {
      showToast(`"${targetTask.name}" is already ${p} priority`)
      return
    }
    await updateTask(targetTask.id, { ...targetTask, priority: p })
    showToast(`Updated "${targetTask.name}" priority to ${p}`)
  }

  // Navigate by 1 full month (snapped to the Monday of that week)
  function shiftMonth(deltaMonths: number) {
    setBaseMonday((prev) => {
      const target = new Date(prev.getFullYear(), prev.getMonth() + deltaMonths, prev.getDate())
      return getMondayOfWeek(target)
    })
  }

  // Navigate by 1 week (used in Weekly Hours view)
  function shiftWeek(deltaWeeks: number) {
    setBaseMonday((prev) => addDays(prev, deltaWeeks * 7))
  }

  function goToCurrentWeek() {
    setBaseMonday(getMondayOfWeek(parseYmd(today)))
  }

  const weeks = useMemo(() => {
    const count = Math.max(1, Math.min(10, weeksToShow))
    return Array.from({ length: count }, (_, wIdx) => {
      const monday = addDays(baseMonday, wIdx * 7)
      const ww = getIsoWeek(monday)
      const days = Array.from({ length: 5 }, (__, dIdx) => {
        const dateObj = addDays(monday, dIdx)
        const ymd = toYmd(dateObj)
        return {
          ymd,
          dayName: DAY_NAMES[dIdx],
          dayLabel: dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          isToday: ymd === today,
        }
      })
      return {
        ww,
        year: monday.getFullYear(),
        mondayYmd: toYmd(monday),
        fridayLabel: days[4].dayLabel,
        mondayLabel: days[0].dayLabel,
        days,
      }
    })
  }, [baseMonday, weeksToShow, today])

  // Set of Mondays currently displayed in the workweek schedule (for highlighting in the mini calendar)
  const displayedMondays = useMemo(() => new Set(weeks.map((w) => w.mondayYmd)), [weeks])

  // Set of exact dates that have tasks or milestones on the calendar (excluding overdue tasks moved to the basket)
  const busyDates = useMemo(() => {
    const s = new Set<string>()
    for (const t of tasks) {
      if (t.status === 'Cancelled' || !t.dueDate || isTaskOverdue(t, today)) continue
      if (filterProject && t.projectId !== filterProject) continue
      s.add(t.dueDate)
    }
    for (const m of milestones) {
      const msDate = m.actualDate || m.targetDate
      if (msDate && (!filterProject || m.projectId === filterProject)) s.add(msDate)
    }
    return s
  }, [tasks, milestones, filterProject, today])

  // Build 2 stacked mini-months anchored on the Thursday of the first displayed workweek
  const miniMonths = useMemo(() => {
    const anchor = addDays(baseMonday, 3)
    const y1 = anchor.getFullYear()
    const m1 = anchor.getMonth()
    const next = new Date(y1, m1 + 1, 1)
    return [
      buildMiniMonthWeeks(y1, m1, { hideEndOverflow: true }),
      buildMiniMonthWeeks(next.getFullYear(), next.getMonth(), { hideStartOverflow: true }),
    ]
  }, [baseMonday])

  const projectDevice = (pid: string) => {
    const p = projects.find((x) => x.id === pid)
    return p?.deviceName || p?.name || ''
  }

  const deliverableName = (wsId: string) => {
    const w = workstreams.find((x) => x.id === wsId)
    if (!w) return ''
    return w.category === 'Others' && w.name !== 'Others' ? `Others (${w.name})` : w.name || w.category
  }

  const itemSubtitle = (pid: string, wsId: string) => {
    const dev = projectDevice(pid)
    const deliv = deliverableName(wsId)
    return [dev, deliv].filter(Boolean).join(' · ') || '—'
  }

  // Overdue Basket: incomplete tasks past their due date, sorted by priority by default
  const overdueTasks = useMemo(() => {
    return tasks
      .filter((t) => (!filterProject || t.projectId === filterProject) && isTaskOverdue(t, today))
      .sort((a, b) => (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || a.dueDate.localeCompare(b.dueDate))
  }, [tasks, filterProject, today])

  const itemsByDay = useMemo(() => {
    const map = new Map<string, { tasks: Task[]; milestones: Milestone[] }>()
    for (const t of tasks) {
      if (t.status === 'Cancelled' || !t.dueDate || isTaskOverdue(t, today)) continue
      if (filterProject && t.projectId !== filterProject) continue
      const key = snapToWorkdayYmd(t.dueDate)
      const bucket = map.get(key) ?? { tasks: [], milestones: [] }
      bucket.tasks.push(t)
      map.set(key, bucket)
    }
    for (const bucket of map.values()) {
      bucket.tasks.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    }
    for (const m of milestones) {
      const msDate = m.actualDate || m.targetDate
      if (!msDate) continue
      if (filterProject && m.projectId !== filterProject) continue
      const key = snapToWorkdayYmd(msDate)
      const bucket = map.get(key) ?? { tasks: [], milestones: [] }
      bucket.milestones.push(m)
      map.set(key, bucket)
    }
    return map
  }, [tasks, milestones, filterProject, today])

  function handleCopy(item: ItemRef) {
    setClipboard({ ...item, mode: 'copy' })
    showToast(`Copied "${item.name}" — click Paste on any date`)
  }

  function handleCut(item: ItemRef) {
    setClipboard({ ...item, mode: 'cut' })
    showToast(`Cut "${item.name}" — click Paste on any date to move it`)
  }

  async function handlePaste(targetYmd: string, ww?: number) {
    if (!clipboard) return
    const wwLabel = ww ? `WW${String(ww).padStart(2, '0')} (${targetYmd})` : targetYmd
    try {
      if (clipboard.mode === 'cut') {
        if (clipboard.kind === 'task') await rescheduleTask(clipboard.id, targetYmd)
        else await rescheduleMilestone(clipboard.id, targetYmd)
        showToast(`Moved "${clipboard.name}" to ${wwLabel}`)
        setClipboard(null)
      } else {
        if (clipboard.kind === 'task') await duplicateTaskToDate(clipboard.id, targetYmd)
        else await duplicateMilestoneToDate(clipboard.id, targetYmd)
        showToast(`Pasted copy of "${clipboard.name}" to ${wwLabel}`)
      }
    } catch {
      // ignore if deleted
    }
  }

  // Keyboard shortcuts: Escape closes drawer; Ctrl+C, Ctrl+X on selected item; Ctrl+V on selected day
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen) {
        e.preventDefault()
        closeDrawer()
        return
      }
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedItem) {
        e.preventDefault()
        handleCopy(selectedItem)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && selectedItem) {
        e.preventDefault()
        handleCut(selectedItem)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboard && selectedDay) {
        e.preventDefault()
        void handlePaste(selectedDay)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function onDragStart(e: React.DragEvent, payload: ItemRef) {
    e.dataTransfer.setData('application/json', JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(payload.id)
  }

  function onDragEnd() {
    setDraggingId('')
    setDragOverCell('')
  }

  async function onDropOnDay(e: React.DragEvent, targetYmd: string, ww: number) {
    e.preventDefault()
    setDragOverCell('')
    setDraggingId('')
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as ItemRef
      if (payload.kind === 'task') {
        await rescheduleTask(payload.id, targetYmd)
        showToast(`Task moved to WW${String(ww).padStart(2, '0')} (${targetYmd})`)
      } else if (payload.kind === 'milestone') {
        await rescheduleMilestone(payload.id, targetYmd)
        showToast(`Milestone moved to WW${String(ww).padStart(2, '0')} (${targetYmd})`)
      }
    } catch {
      // ignore invalid drag payload
    }
  }

  async function handleDropTaskAtTime(taskId: string, targetYmd: string, startTime: string, endTime: string, ww: number) {
    setDragOverCell('')
    setDraggingId('')
    try {
      await rescheduleTask(taskId, targetYmd, startTime, endTime)
      showToast(`Task moved to WW${String(ww).padStart(2, '0')} (${targetYmd} ${startTime}–${endTime})`)
    } catch {
      // ignore if deleted
    }
  }

  async function handleDropMilestone(milestoneId: string, targetYmd: string, ww: number) {
    setDragOverCell('')
    setDraggingId('')
    try {
      await rescheduleMilestone(milestoneId, targetYmd)
      showToast(`Milestone moved to WW${String(ww).padStart(2, '0')} (${targetYmd})`)
    } catch {
      // ignore if deleted
    }
  }

  const rangeLabel = `${weeks[0].mondayLabel} – ${weeks[weeks.length - 1].fridayLabel} ${weeks[weeks.length - 1].year}`

  return (
    <Card className="xl:col-span-3">
      {/* Row 1: Title | Row 2: Project filter, Weeks, Month navigation, Date range */}
      <header className="-mx-4 -mt-4 mb-3 px-4 py-3 border-b border-slate-100 space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">Workweek Schedule — Tasks & Milestones</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} – {p.name}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-md px-2 h-8">
            <span className="font-medium">Weeks:</span>
            <input
              type="number"
              min={4}
              max={10}
              value={clampedWeeks}
              onChange={(e) => setWeeksToShow(Math.max(4, Math.min(10, Number(e.target.value) || 4)))}
              className="w-11 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-800 text-center focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-[11px] text-slate-500">(4–10)</span>
          </label>

          <div className="flex items-center gap-1">
            <Button size="sm" onClick={() => shiftMonth(-1)} title="Previous month"><ChevronLeft className="h-3.5 w-3.5" /> Prev Month</Button>
            <Button size="sm" onClick={goToCurrentWeek}>Current Week</Button>
            <Button size="sm" onClick={() => shiftMonth(1)} title="Next month">Next Month <ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
          <span className="text-xs text-slate-600 font-semibold ml-auto">{rangeLabel}</span>
        </div>
      </header>
      {/* Priority Colour Legend (click box = set selected task priority; click word = filter/dim) + Instructions */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Priority:</span>
          {PRIORITY_ITEMS.map(({ priority, boxCls }) => {
            const isActive = selectedPriorities.includes(priority)
            const isDimmed = isPriorityDimmed(priority)
            return (
              <span key={priority} className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handlePriorityBoxClick(priority)}
                  title={
                    selectedItem?.kind === 'task'
                      ? `Click colour box to set "${selectedItem.name}" to ${priority}`
                      : `Select a task, then click to set priority to ${priority}`
                  }
                  className={cn(
                    'h-3.5 w-3.5 rounded-sm border transition-transform hover:scale-110 cursor-pointer',
                    boxCls,
                    selectedItem?.kind === 'task' && 'ring-1 ring-offset-1 ring-slate-400',
                  )}
                />
                <button
                  type="button"
                  onClick={() => togglePriorityFilter(priority)}
                  title={`Click word to ${isActive ? 'remove' : 'filter'} ${priority} priority`}
                  className={cn(
                    'cursor-pointer rounded px-1 py-0.5 transition-all select-none',
                    isActive && 'bg-slate-800 text-white font-semibold',
                    !isActive && isDimmed && 'opacity-40 hover:opacity-80',
                    !isActive && !isDimmed && 'hover:bg-slate-100 font-medium text-slate-700',
                  )}
                >
                  {priority}
                </button>
              </span>
            )
          })}
          {selectedPriorities.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPriorities([])}
              className="text-[11px] text-primary hover:underline font-medium"
            >
              Show all
            </button>
          )}
          <span className="text-slate-300">|</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-sm bg-purple-100 border border-purple-500">
              <Star className="h-2.5 w-2.5 text-amber-500 fill-amber-400" />
            </span>
            Milestone
          </span>
        </div>
        <span className="text-slate-500">Single-click to select (Copy/Cut/Priority) · Double-click to edit · Drag & drop to move.</span>
      </div>

      {/* Split Layout: Left Compact Mini Calendar + Overdue Basket | Right 5-Day Workweek Schedule */}
      <div className="relative flex flex-col lg:block -mx-4 -mb-4 border-t border-slate-200">
        {/* LEFT: Compact 2-Month Mini Calendar + Overdue Basket (matches right calendar height on desktop) */}
        <aside className="w-full lg:absolute lg:inset-y-0 lg:left-0 lg:w-[240px] flex flex-col bg-slate-50/70 text-slate-700 p-2.5 border-b lg:border-b-0 lg:border-r border-slate-200 select-none">
          <div className="shrink-0">
            {miniMonths.map((month, mIdx) => (
              <div key={month.title} className={cn(mIdx > 0 && 'mt-2 pt-2 border-t border-slate-200')}>
                <div className="flex items-center justify-between mb-1 px-1">
                  {mIdx === 0 ? (
                    <button
                      onClick={() => shiftMonth(-1)}
                      className="p-0.5 rounded hover:bg-slate-200 text-slate-600"
                      title="Previous month"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  ) : <span className="w-4" />}
                  <span className="text-[11px] font-bold tracking-wide text-slate-800">{month.title}</span>
                  {mIdx === 0 ? (
                    <button
                      onClick={() => shiftMonth(1)}
                      className="p-0.5 rounded hover:bg-slate-200 text-slate-600"
                      title="Next month"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  ) : <span className="w-4" />}
                </div>

                {/* Column header: # | MO TU WE TH FR SA SU */}
                <div className="grid grid-cols-8 text-[9px] font-semibold text-slate-500 text-center pb-0.5 border-b border-slate-200">
                  <span className="border-r border-slate-200">#</span>
                  {MINI_DAYS.map((d) => <span key={d}>{d}</span>)}
                </div>

                {/* Week rows */}
                <div className="mt-0.5 space-y-0">
                  {month.rows.map((row) => {
                    const isDisplayedWeek = displayedMondays.has(row.mondayYmd)
                    return (
                      <div
                        key={row.mondayYmd}
                        onClick={() => setBaseMonday(row.monday)}
                        title={`Click to start schedule at WW${String(row.ww).padStart(2, '0')} (${row.mondayYmd})`}
                        className="grid grid-cols-8 items-center text-center text-[10px] cursor-pointer group"
                      >
                        {/* Workweek number column */}
                        <span
                          className={cn(
                            'py-0.5 border-r border-slate-200 text-[9px] font-medium',
                            isDisplayedWeek ? 'bg-blue-100 text-blue-800 font-bold rounded-l border-y border-l border-blue-300' : 'text-slate-400 group-hover:text-slate-700',
                          )}
                        >
                          {row.ww}
                        </span>

                        {/* 7 days of the week; MO..FR highlighted when this workweek is displayed */}
                        {row.days.map((d, dIdx) => {
                          if (d.hidden) {
                            return <span key={d.ymd} className="py-0.5" />
                          }
                          const isToday = d.ymd === today
                          const inWorkweekHighlight = isDisplayedWeek && d.isWeekday
                          const hasItems = busyDates.has(d.ymd)
                          const isFirstHighlighted = inWorkweekHighlight && (dIdx === 0 || row.days[dIdx - 1]?.hidden)
                          const isLastHighlighted = inWorkweekHighlight && (dIdx === 4 || row.days[dIdx + 1]?.hidden)
                          return (
                            <span
                              key={d.ymd}
                              className={cn(
                                'py-0.5 transition-colors',
                                inWorkweekHighlight && 'bg-blue-100/75 border-y border-blue-300 text-slate-800 font-medium',
                                isFirstHighlighted && 'border-l border-blue-300',
                                isLastHighlighted && 'rounded-r border-r border-blue-300',
                                !inWorkweekHighlight && 'group-hover:bg-slate-200/70',
                                !d.inMonth && !inWorkweekHighlight && !isToday && 'text-slate-400',
                                d.inMonth && !inWorkweekHighlight && !isToday && 'text-slate-700',
                                hasItems && !isToday && 'font-bold text-slate-900',
                                isToday && '!bg-blue-600 !text-white font-semibold rounded dark:!bg-sky-400 dark:!text-slate-950 dark:font-bold dark:ring-1 dark:ring-sky-200',
                              )}
                            >
                              {d.dayNum}
                            </span>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Overdue Basket (below mini calendar, expands to match right calendar height & scrolls) */}
          <div className="flex-1 min-h-0 flex flex-col mt-2.5 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between gap-1 mb-1.5 shrink-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Overdue Basket</span>
              </div>
              <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                {overdueTasks.length}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5 max-h-72 lg:max-h-none">
              {overdueTasks.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-4">No overdue tasks</p>
              ) : (
                overdueTasks.map((t) => {
                  const ref: ItemRef = { kind: 'task', id: t.id, name: t.name }
                  const isCut = clipboard?.mode === 'cut' && clipboard.id === t.id
                  const isSelected = selectedItem?.id === t.id
                  const dimmed = isPriorityDimmed(t.priority)
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, ref)}
                      onDragEnd={onDragEnd}
                      onClick={(e) => { e.stopPropagation(); setSelectedItem(ref) }}
                      onDoubleClick={(e) => { e.stopPropagation(); setSelectedItem(ref); openTaskDrawer(t) }}
                      title={`Overdue Task: ${t.name}\nDevice: ${projectDevice(t.projectId) || '—'}\nDeliverable: ${deliverableName(t.workstreamId) || '—'}\nDue: ${t.dueDate}\nDrag to calendar or double-click to edit`}
                      className={cn(
                        'group relative cursor-grab active:cursor-grabbing rounded border px-2 py-1.5 text-[11px] shadow-sm transition-all select-none min-w-0',
                        taskCardStyle(t),
                        isSelected && 'ring-2 ring-primary',
                        dimmed && 'opacity-25 saturate-50',
                        (draggingId === t.id || isCut) && 'opacity-45 border-dashed',
                      )}
                    >
                      <div className="flex items-start gap-1 min-w-0">
                        <GripVertical className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-90 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate leading-tight">{t.name}</p>
                          <p className="text-[10px] opacity-80 truncate leading-tight mt-0.5">
                            {itemSubtitle(t.projectId, t.workstreamId)}
                          </p>
                        </div>
                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 bg-white/90 rounded px-1 py-0.5 shadow-sm" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleCopy(ref)} title="Copy task" className="p-0.5 hover:text-primary"><Copy className="h-3 w-3" /></button>
                          <button onClick={() => handleCut(ref)} title="Cut task to move" className="p-0.5 hover:text-primary"><Scissors className="h-3 w-3" /></button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT: 5-Day Workweek Schedule */}
        <div className="lg:ml-[240px] overflow-x-auto">
          <div className="min-w-[820px]">
            {/* 5-day Workweek Header */}
            <div className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-700">
              <div className="px-3 py-2 border-r border-slate-200">Workweek</div>
              {DAY_NAMES.map((day) => (
                <div key={day} className="px-3 py-2 border-r last:border-r-0 border-slate-200">{day}</div>
              ))}
            </div>

            {/* Workweek Rows */}
            {weeks.map((week) => (
              <div key={week.mondayYmd} className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] border-b last:border-b-0 border-slate-200">
                {/* Workweek Label Cell */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOverCell(`ww-${week.mondayYmd}`) }}
                  onDragLeave={() => setDragOverCell('')}
                  onDrop={(e) => onDropOnDay(e, week.mondayYmd, week.ww)}
                  className={cn(
                    'p-3 border-r border-slate-200 bg-slate-50 flex flex-col justify-between transition-colors',
                    dragOverCell === `ww-${week.mondayYmd}` && 'bg-primary-soft ring-2 ring-inset ring-primary',
                  )}
                >
                  <div>
                    <span className="inline-flex items-center rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-white">
                      WW{String(week.ww).padStart(2, '0')}
                    </span>
                    <p className="text-[11px] text-slate-600 font-medium mt-1">{week.mondayLabel} – {week.fridayLabel}</p>
                  </div>
                  {clipboard ? (
                    <button
                      onClick={() => handlePaste(week.mondayYmd, week.ww)}
                      className="mt-2 inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-hover"
                      title="Paste onto Monday of this workweek"
                    >
                      <ClipboardPaste className="h-3 w-3" /> Paste (Mon)
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400 mt-2">Drop here → Mon</span>
                  )}
                </div>

                {/* 5 Days (Mon - Fri) */}
                {week.days.map((day) => {
                  const bucket = itemsByDay.get(day.ymd)
                  const dayTasks = bucket?.tasks ?? []
                  const dayMilestones = bucket?.milestones ?? []
                  const totalDayItems = dayMilestones.length + dayTasks.length
                  const isTwoColMatrix = totalDayItems > 4
                  const isScrollableDay = totalDayItems > 8
                  const isOver = dragOverCell === day.ymd
                  const isSelectedDay = selectedDay === day.ymd
                  return (
                    <div
                      key={day.ymd}
                      onClick={() => setSelectedDay(day.ymd)}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCell !== day.ymd) setDragOverCell(day.ymd) }}
                      onDragLeave={() => setDragOverCell((c) => (c === day.ymd ? '' : c))}
                      onDrop={(e) => onDropOnDay(e, day.ymd, week.ww)}
                      className={cn(
                        'min-h-[130px] p-2 border-r last:border-r-0 border-slate-200 flex flex-col gap-1.5 transition-colors min-w-0',
                        day.isToday ? 'bg-blue-50/50' : 'bg-white',
                        isSelectedDay && 'ring-1 ring-inset ring-slate-400',
                        isOver && 'bg-primary-soft ring-2 ring-inset ring-primary',
                      )}
                    >
                      <div className="flex items-center justify-between text-xs mb-0.5 border-b border-slate-100 pb-1 shrink-0">
                        <span className={cn('font-medium', day.isToday ? 'text-primary font-bold' : 'text-slate-600')}>
                          {day.dayLabel}
                          {totalDayItems > 0 && (
                            <span className="ml-1 text-[10px] font-normal text-slate-400">({totalDayItems})</span>
                          )}
                        </span>
                        <div className="flex items-center gap-1">
                          {day.isToday && <Badge color="blue">Today</Badge>}
                          {clipboard && (
                            <button
                              onClick={(e) => { e.stopPropagation(); void handlePaste(day.ymd, week.ww) }}
                              className="inline-flex items-center gap-0.5 rounded bg-primary/10 hover:bg-primary text-primary hover:text-white px-1.5 py-0.5 text-[11px] font-medium transition-colors"
                              title={`Paste "${clipboard.name}" onto ${day.dayLabel}`}
                            >
                              <ClipboardPaste className="h-3 w-3" /> Paste
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Items container: >4 items splits into a 2x4 matrix; >8 items caps height at 4 rows and scrolls */}
                      <div
                        className={cn(
                          isTwoColMatrix ? 'grid grid-cols-2 gap-1.5 auto-rows-min' : 'flex flex-col gap-1.5',
                          isScrollableDay && 'max-h-[224px] overflow-y-auto pr-0.5',
                        )}
                      >
                        {/* Milestones on this day */}
                        {dayMilestones.map((m) => {
                          const ref: ItemRef = { kind: 'milestone', id: m.id, name: m.name }
                          const isCut = clipboard?.mode === 'cut' && clipboard.id === m.id
                          const isSelected = selectedItem?.id === m.id
                          const variance = milestoneVarianceLabel(m)
                          const msSubtitle = [projectDevice(m.projectId), variance].filter(Boolean).join(' · ') || '—'
                          return (
                            <div
                              key={m.id}
                              draggable
                              onDragStart={(e) => onDragStart(e, ref)}
                              onDragEnd={onDragEnd}
                              onClick={(e) => { e.stopPropagation(); setSelectedItem(ref); setSelectedDay(day.ymd) }}
                              onDoubleClick={(e) => { e.stopPropagation(); setSelectedItem(ref); setSelectedDay(day.ymd); openMilestoneDrawer(m) }}
                              title={`Milestone: ${m.name}\nDevice: ${projectDevice(m.projectId) || '—'}\nTarget Date: ${m.targetDate}${m.actualDate ? `\nActual Date: ${m.actualDate}` : ''}${variance ? `\n${variance}` : ''}\nSingle-click to select · Double-click to edit`}
                              className={cn(
                                'group relative cursor-grab active:cursor-grabbing rounded border shadow-sm transition-all select-none min-w-0',
                                isTwoColMatrix ? 'px-1.5 py-1 text-[11px]' : 'px-2 py-1.5 text-xs',
                                milestoneCardStyle(),
                                isSelected && 'ring-2 ring-primary',
                                (draggingId === m.id || isCut) && 'opacity-45 border-dashed',
                              )}
                            >
                              <div className="flex items-start gap-1 min-w-0">
                                {!isTwoColMatrix && <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-90 mt-0.5" />}
                                <Star className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500 fill-amber-400" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold truncate leading-tight">{m.name}</p>
                                  <p className="text-[10px] opacity-80 truncate leading-tight mt-0.5">{msSubtitle}</p>
                                </div>
                                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 bg-white/90 rounded px-1 py-0.5 shadow-sm" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => handleCopy(ref)} title="Copy milestone" className="p-0.5 hover:text-primary"><Copy className="h-3 w-3" /></button>
                                  <button onClick={() => handleCut(ref)} title="Cut milestone to move" className="p-0.5 hover:text-primary"><Scissors className="h-3 w-3" /></button>
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        {/* Tasks on this day */}
                        {dayTasks.map((t) => {
                          const ref: ItemRef = { kind: 'task', id: t.id, name: t.name }
                          const isCut = clipboard?.mode === 'cut' && clipboard.id === t.id
                          const isSelected = selectedItem?.id === t.id
                          const dimmed = isPriorityDimmed(t.priority)
                          return (
                            <div
                              key={t.id}
                              draggable
                              onDragStart={(e) => onDragStart(e, ref)}
                              onDragEnd={onDragEnd}
                              onClick={(e) => { e.stopPropagation(); setSelectedItem(ref); setSelectedDay(day.ymd) }}
                              onDoubleClick={(e) => { e.stopPropagation(); setSelectedItem(ref); setSelectedDay(day.ymd); openTaskDrawer(t) }}
                              title={`Task: ${t.name}\nDevice: ${projectDevice(t.projectId) || '—'}\nDeliverable: ${deliverableName(t.workstreamId) || '—'}\nDue: ${t.dueDate}\nSingle-click to select · Double-click to edit`}
                              className={cn(
                                'group relative cursor-grab active:cursor-grabbing rounded border shadow-sm transition-all select-none min-w-0',
                                isTwoColMatrix ? 'px-1.5 py-1 text-[11px]' : 'px-2 py-1.5 text-xs',
                                taskCardStyle(t),
                                isSelected && 'ring-2 ring-primary',
                                dimmed && 'opacity-25 saturate-50',
                                (draggingId === t.id || isCut) && 'opacity-45 border-dashed',
                              )}
                            >
                              <div className="flex items-start gap-1 min-w-0">
                                {!isTwoColMatrix && <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-90 mt-0.5" />}
                                <CheckSquare className="h-3 w-3 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <p className={cn('font-semibold truncate leading-tight', t.status === 'Completed' && 'line-through opacity-75')}>{t.name}</p>
                                  <p className="text-[10px] opacity-80 truncate leading-tight mt-0.5">
                                    {itemSubtitle(t.projectId, t.workstreamId)}
                                  </p>
                                </div>
                                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 bg-white/90 rounded px-1 py-0.5 shadow-sm" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => handleCopy(ref)} title="Copy task" className="p-0.5 hover:text-primary"><Copy className="h-3 w-3" /></button>
                                  <button onClick={() => handleCut(ref)} title="Cut task to move" className="p-0.5 hover:text-primary"><Scissors className="h-3 w-3" /></button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Left Slide-Over Edit Panel (slides in from left on double-click, no backdrop blur) */}
      <aside
        aria-hidden={!drawerOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-full max-w-md bg-white border-r border-slate-200 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none',
        )}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0">
          <h3 className="text-base font-semibold text-slate-900">
            {drawerTarget?.kind === 'milestone' ? 'Edit Milestone' : 'Edit Task'}
          </h3>
          <button
            type="button"
            onClick={closeDrawer}
            className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100"
            title="Close"
            aria-label="Close edit panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {drawerTarget?.kind === 'task' && (
            <TaskFormBody
              key={`drawer-task-${drawerTarget.task.id}-${drawerTarget.task.updatedAt}`}
              task={drawerTarget.task}
              onClose={closeDrawer}
            />
          )}
          {drawerTarget?.kind === 'milestone' && (
            <MilestoneFormBody
              key={`drawer-ms-${drawerTarget.milestone.id}-${drawerTarget.milestone.updatedAt}`}
              milestone={drawerTarget.milestone}
              onClose={closeDrawer}
            />
          )}
        </div>
      </aside>
      {/* Temporary floating pop-up toast (centered above calendar) */}
      {toast && (
        <div
          role="status"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900 shadow-lg"
        >
          {toast}
        </div>
      )}
    </Card>
  )
}

