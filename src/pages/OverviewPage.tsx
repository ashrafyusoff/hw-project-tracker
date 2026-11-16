import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { CheckSquare, Cpu, Plus, Square, StickyNote, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { ActivityLog, Milestone, PetRecord, PoRecord, Project, Quotation, Supplier, Task, Workstream } from '@/types'
import { HARDWARE_STATUSES, HW_TYPES, PROJECT_STATUSES, isArchivedStatus } from '@/types'
import { Badge, Card, EmptyState, Loading, Button } from '@/components/ui'
import { daysFromToday, formatDate, formatDateTime, isPast, newId, todayStr } from '@/utils/helpers'
import { loadSampleData } from '@/services/sampleData'
import { WorkWeekCalendar, addDays, getIsoWeek, getMondayOfWeek, parseYmd, toYmd } from '@/features/overview/WorkWeekCalendar'
import { WorkWeekActionDashboard } from '@/features/overview/WorkWeekActionDashboard'
import { TaskForm } from '@/features/tasks/TaskForm'
import { MilestoneForm } from '@/features/tasks/MilestoneForm'
import { CommercialBadge, buildDeliverableCommercialRows, normalizeHardwareStatus, rowToCommercialInput } from '@/features/commercial/CommercialForms'
import { emptyDeliverableCommercial, saveDeliverableCommercial } from '@/services/commercialService'

const STATUS_COLORS: Record<string, string> = {
  Planning: '#8b5cf6',
  'In Progress': '#2563eb',
  'On Hold': '#f59e0b',
  Delayed: '#ef4444',
  Completed: '#10b981',
  Cancelled: '#94a3b8',
}

type HwRequiredFilter = 'all' | 'asc' | 'desc' | 'overdue' | '30d' | '60d'
type RadarFilter = 'all' | 'need_po' | 'in_transit' | 'delivered'

interface QuickNoteItem {
  id: string
  text: string
  done: boolean
  createdAt: string
}

export function OverviewPage() {
  const navigate = useNavigate()
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')
  const tasks = useTable<Task>('tasks')
  const milestones = useTable<Milestone>('milestones')
  const suppliers = useTable<Supplier>('suppliers')
  const quotations = useTable<Quotation>('quotations')
  const pets = useTable<PetRecord>('petRecords')
  const pos = useTable<PoRecord>('poRecords')
  const logs = useTable<ActivityLog>('activityLogs')

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | undefined>()

  // Saved filters for Project Overview ("HW Type" and "HW Required")
  const [overviewHwType, setOverviewHwType] = usePersistedState<string>('npi.overview.hwType', 'ALL')
  const [overviewHwRequired, setOverviewHwRequired] = usePersistedState<HwRequiredFilter>('npi.overview.hwRequired', 'all')

  // Interactive left-slot widget state (Hardware Delivery Radar + Quick Engineering Pinboard)
  const [leftWidgetTab, setLeftWidgetTab] = usePersistedState<'radar' | 'notes'>('npi.overview.leftWidgetTab', 'radar')
  const [radarFilter, setRadarFilter] = usePersistedState<RadarFilter>('npi.overview.radarFilter', 'all')
  const [quickNotes, setQuickNotes] = usePersistedState<QuickNoteItem[]>('npi.overview.quickNotes', [
    { id: 'sample-note-1', text: 'Verify socket pin pitch drawing before Friday release', done: false, createdAt: todayStr() },
    { id: 'sample-note-2', text: 'Follow up PCB impedance coupon report with vendor', done: false, createdAt: todayStr() },
  ])
  const [newNoteText, setNewNoteText] = useState('')

  // Past 8 weeks + Current week + Next 8 weeks (17 workweeks total) Line Chart data
  const workloadData = useMemo(() => {
    if (!tasks || !projects) return []
    const projMap = new Map(projects.map((p) => [p.id, p]))
    const currentMon = getMondayOfWeek(parseYmd(todayStr()))

    return Array.from({ length: 17 }, (_, idx) => idx - 8).map((offset) => {
      const mon = addDays(currentMon, offset * 7)
      const sun = addDays(mon, 6)
      const monYmd = toYmd(mon)
      const sunYmd = toYmd(sun)
      const ww = getIsoWeek(mon)
      const wwLabel = offset === 0 ? `WW${String(ww).padStart(2, '0')}*` : `WW${String(ww).padStart(2, '0')}`

      let npiTasks = 0
      let nonNpiTasks = 0

      for (const t of tasks) {
        if (t.status === 'Cancelled') continue
        const effDate = t.dueDate || t.startDate
        if (!effDate) continue
        const inWeek =
          (effDate >= monYmd && effDate <= sunYmd) ||
          (!!t.startDate && !!t.dueDate && t.startDate <= sunYmd && t.dueDate >= monYmd)
        if (!inWeek) continue

        const p = projMap.get(t.projectId)
        if (p?.isNonNpi) nonNpiTasks++
        else npiTasks++
      }

      return {
        week: wwLabel,
        isCurrent: offset === 0,
        'NPI Project Tasks': npiTasks,
        'Non-NPI Work Tasks': nonNpiTasks,
      }
    })
  }, [tasks, projects])

  const npiProjects = useMemo(() => (projects ?? []).filter((p) => !p.isNonNpi), [projects])
  const nonNpiProjects = useMemo(() => (projects ?? []).filter((p) => !!p.isNonNpi), [projects])
  const activeNpiProjects = useMemo(() => npiProjects.filter((p) => !isArchivedStatus(p.status)), [npiProjects])

  const filteredOverviewProjects = useMemo(() => {
    const baseList = activeNpiProjects.length ? activeNpiProjects : npiProjects
    const today = todayStr()
    const in30 = daysFromToday(30)
    const in60 = daysFromToday(60)

    const filtered = baseList.filter((p) => {
      const pHwType = p.hwType || 'FT'
      if (overviewHwType !== 'ALL' && pHwType !== overviewHwType) return false

      if (overviewHwRequired === 'overdue') {
        return !!p.baselineDate && p.baselineDate < today
      }
      if (overviewHwRequired === '30d') {
        return !!p.baselineDate && p.baselineDate >= today && p.baselineDate <= in30
      }
      if (overviewHwRequired === '60d') {
        return !!p.baselineDate && p.baselineDate >= today && p.baselineDate <= in60
      }
      return true
    })

    return [...filtered].sort((a, b) => {
      if (overviewHwRequired === 'desc') {
        return (b.baselineDate || '0000-00-00').localeCompare(a.baselineDate || '0000-00-00')
      }
      return (a.baselineDate || '9999-99-99').localeCompare(b.baselineDate || '9999-99-99')
    })
  }, [activeNpiProjects, npiProjects, overviewHwType, overviewHwRequired])

  const commercialRows = useMemo(() => {
    if (!workstreams || !quotations || !pets || !pos || !projects || !suppliers) return []
    const activeProjectIds = new Set(activeNpiProjects.map((p) => p.id))
    const activeWs = workstreams.filter((w) => activeProjectIds.has(w.projectId))
    const from = daysFromToday(-14)
    const to = daysFromToday(14)
    // Need PO / Design-Fab-Delivery: all active NPI deliverables, any timeline.
    // Delivered: only if delivery date is within the past 2 weeks to next 2 weeks (incl. pull-in).
    return buildDeliverableCommercialRows(activeWs, quotations, pets, pos, projects, suppliers).filter((r) => {
      if (normalizeHardwareStatus(r.po) !== 'Delivered') return true
      const date = r.po?.actualDelivery || r.po?.expectedDelivery
      return !!date && date >= from && date <= to
    })
  }, [workstreams, quotations, pets, pos, projects, suppliers, activeNpiProjects])

  const filteredRadarRows = useMemo(() => {
    return commercialRows.filter((r) => {
      const hwStatus = normalizeHardwareStatus(r.po)
      if (radarFilter === 'need_po') {
        return !r.po?.number
      }
      if (radarFilter === 'in_transit') {
        return hwStatus === 'Design' || hwStatus === 'Fabrication' || hwStatus === 'In Delivery'
      }
      if (radarFilter === 'delivered') {
        return hwStatus === 'Delivered'
      }
      return true
    })
  }, [commercialRows, radarFilter])

  if (!projects || !workstreams || !tasks || !milestones || !suppliers || !quotations || !pets || !pos || !logs) return <Loading />

  if (projects.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No projects yet"
          hint="Create your first project, or load sample semiconductor NPI data to see how the app works."
          action={
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => navigate('/projects?new=1')}>Create Project</Button>
              <Button onClick={() => loadSampleData()}>Load Sample Data</Button>
            </div>
          }
        />
      </Card>
    )
  }

  const statusVisible = PROJECT_STATUSES.filter((s) => s !== 'Cancelled')
  const npiStatusRows = statusVisible.map((s) => ({
    name: s,
    value: npiProjects.filter((p) => p.status === s).length,
  }))
  const nonNpiStatusRows = statusVisible.map((s) => ({
    name: s,
    value: nonNpiProjects.filter((p) => p.status === s).length,
  }))
  const npiChartData = npiStatusRows.filter((d) => d.value > 0)
  const nonNpiChartData = nonNpiStatusRows.filter((d) => d.value > 0)

  const currentWeekTick = workloadData.find((d) => d.isCurrent)?.week

  // Past 15 activities only
  const latest15Logs = [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15)

  function addQuickNote(e: React.FormEvent) {
    e.preventDefault()
    const text = newNoteText.trim()
    if (!text) return
    setQuickNotes((prev) => [{ id: newId(), text, done: false, createdAt: todayStr() }, ...prev])
    setNewNoteText('')
  }

  return (
    <div className="space-y-4">
      {/* Top Row: Wider "This Week Activities" (7 cols) + Reduced width "Project Overview" (5 cols) */}
      <div className="grid xl:grid-cols-12 gap-4 items-stretch">
        {/* 1. Left (Wider): This Week Activities */}
        <div className="xl:col-span-7 flex flex-col [&>section]:flex-1">
          <WorkWeekActionDashboard
            tasks={tasks}
            milestones={milestones}
            projects={projects}
            workstreams={workstreams}
            onEditTask={(t) => { setEditingTask(t); setTaskModalOpen(true) }}
            onEditMilestone={(m) => { setEditingMilestone(m); setMilestoneModalOpen(true) }}
          />
        </div>

        {/* 2. Right (Reduced width): Project Overview with HW Type & HW Required filters */}
        <div className="xl:col-span-5 flex flex-col [&>section]:flex-1">
          <Card
            title="Project Overview"
            className="[&>div]:!p-3 h-full"
            action={
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  aria-label="Filter Project Overview by HW Type"
                  value={overviewHwType}
                  onChange={(e) => setOverviewHwType(e.target.value)}
                  className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                  <option value="ALL">All HW Type</option>
                  {HW_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                <select
                  aria-label="Filter Project Overview by HW Required"
                  value={overviewHwRequired}
                  onChange={(e) => setOverviewHwRequired(e.target.value as HwRequiredFilter)}
                  className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                  <option value="all">HW Required: All</option>
                  <option value="asc">HW Required: Nearest ↑</option>
                  <option value="desc">HW Required: Latest ↓</option>
                  <option value="overdue">HW Required: Overdue</option>
                  <option value="30d">HW Required: ≤ 30 Days</option>
                  <option value="60d">HW Required: ≤ 60 Days</option>
                </select>

                <Link to="/projects" className="text-xs text-primary hover:underline ml-1 whitespace-nowrap">
                  View all
                </Link>
              </div>
            }
          >
            <div className="overflow-x-auto max-h-52 overflow-y-auto -mx-3">
              {filteredOverviewProjects.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">No projects match the selected HW Type / HW Required filter.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-[11px] text-slate-500 text-left sticky top-0 bg-white border-b border-slate-100">
                    <tr className="whitespace-nowrap">
                      <th className="px-3 py-1.5 font-semibold whitespace-nowrap">HRS</th>
                      <th className="px-2 py-1.5 font-semibold whitespace-nowrap">HW Type</th>
                      <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Device</th>
                      <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Status</th>
                      <th
                        className="px-3 py-1.5 font-semibold whitespace-nowrap cursor-pointer select-none hover:text-primary"
                        onClick={() => setOverviewHwRequired((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                        title="Click to toggle HW Required date sort"
                      >
                        HW Required {overviewHwRequired === 'desc' ? '↓' : '↑'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOverviewProjects.slice(0, 8).map((p) => (
                      <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-semibold whitespace-nowrap">
                          <Link to={`/projects/${p.id}`} className="text-primary hover:underline">{p.code}</Link>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap"><Badge color="blue">{p.hwType || 'FT'}</Badge></td>
                        <td className="px-2 py-1.5 text-slate-700 truncate max-w-[120px]">{p.deviceName || '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap"><Badge>{p.status}</Badge></td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{formatDate(p.baselineDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* 5-day Workweek Calendar for Tasks and Milestones with Drag-and-Drop */}
      <div className="grid xl:grid-cols-3 gap-4">
        <WorkWeekCalendar
          tasks={tasks}
          milestones={milestones}
          projects={projects}
          onEditTask={(t) => { setEditingTask(t); setTaskModalOpen(true) }}
          onEditMilestone={(m) => { setEditingMilestone(m); setMilestoneModalOpen(true) }}
        />
      </div>

      {/* Below Workweek Schedule: 2 Side-by-Side Analytics Sections (Non-Hoverable Charts) */}
      <div className="grid xl:grid-cols-2 gap-4 items-stretch">
        {/* Section 1: Task Workload Line Graph (Past 8 Weeks + Current Week + Next 8 Weeks) */}
        <Card
          title="Task Workload — Past 8 Weeks & Next 8 Weeks"
          action={<span className="text-xs text-slate-400">NPI Projects vs Non-NPI Work (* = Current WW)</span>}
          className="[&>div]:!p-3"
        >
          <div className="h-56 pointer-events-none select-none">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={workloadData} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#475569' }} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                {currentWeekTick && (
                  <ReferenceLine x={currentWeekTick} stroke="#94a3b8" strokeDasharray="3 3" />
                )}
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line
                  type="monotone"
                  dataKey="NPI Project Tasks"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#2563eb' }}
                  activeDot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="Non-NPI Work Tasks"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#8b5cf6' }}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Section 2: Project Status Pie-Donut Charts + Status Tables (Non-Hoverable Charts) */}
        <Card
          title="Project Status — NPI Projects & Non-NPI Work"
          className="[&>div]:!p-3"
        >
          <div className="grid sm:grid-cols-2 gap-3">
            {/* Sub-panel A: NPI Projects Status */}
            <div className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">NPI / HRS Projects</span>
                <span className="text-[11px] font-medium text-slate-400">Total: {npiProjects.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-36 w-32 shrink-0 pointer-events-none select-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={npiChartData.length ? npiChartData : [{ name: 'None', value: 1 }]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={28}
                        outerRadius={46}
                        paddingAngle={2}
                        isAnimationActive={false}
                      >
                        {(npiChartData.length ? npiChartData : [{ name: 'None', value: 1 }]).map((d) => (
                          <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? '#e2e8f0'} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-200/70">
                      <th className="py-1 text-left font-medium">Status</th>
                      <th className="py-1 text-right font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {npiStatusRows.map((r) => (
                      <tr key={r.name} className="border-b last:border-b-0 border-slate-100">
                        <td className="py-1 flex items-center gap-1.5 text-slate-700 whitespace-nowrap">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[r.name] }} />
                          {r.name}
                        </td>
                        <td className="py-1 text-right font-semibold text-slate-800">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sub-panel B: Non-NPI Work Status */}
            <div className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">Non-NPI Work</span>
                <span className="text-[11px] font-medium text-slate-400">Total: {nonNpiProjects.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-36 w-32 shrink-0 pointer-events-none select-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={nonNpiChartData.length ? nonNpiChartData : [{ name: 'None', value: 1 }]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={28}
                        outerRadius={46}
                        paddingAngle={2}
                        isAnimationActive={false}
                      >
                        {(nonNpiChartData.length ? nonNpiChartData : [{ name: 'None', value: 1 }]).map((d) => (
                          <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? '#e2e8f0'} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-200/70">
                      <th className="py-1 text-left font-medium">Status</th>
                      <th className="py-1 text-right font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonNpiStatusRows.map((r) => (
                      <tr key={r.name} className="border-b last:border-b-0 border-slate-100">
                        <td className="py-1 flex items-center gap-1.5 text-slate-700 whitespace-nowrap">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[r.name] }} />
                          {r.name}
                        </td>
                        <td className="py-1 text-right font-semibold text-slate-800">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom Row: Interactive Hardware Delivery Radar & Pinboard (Left) + Recent Activities Latest 15 (Right) */}
      <div className="grid xl:grid-cols-2 gap-4 items-stretch">
        {/* LEFT SLOT: Interactive Hardware Delivery Radar & Quick Engineering Pinboard */}
        <Card
          title="Hardware Delivery Radar & Quick Pinboard"
          className="[&>div]:!p-3"
          action={
            <div className="inline-flex items-center rounded border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setLeftWidgetTab('radar')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
                  leftWidgetTab === 'radar' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Cpu className="h-3 w-3" /> HW Delivery Radar ({commercialRows.length})
              </button>
              <button
                type="button"
                onClick={() => setLeftWidgetTab('notes')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
                  leftWidgetTab === 'notes' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <StickyNote className="h-3 w-3" /> Quick Pinboard ({quickNotes.filter((n) => !n.done).length})
              </button>
            </div>
          }
        >
          {leftWidgetTab === 'radar' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  {(
                    [
                      { id: 'all', label: `All (${commercialRows.length})` },
                      { id: 'need_po', label: `Need PO (${commercialRows.filter((r) => !r.po?.number).length})` },
                      {
                        id: 'in_transit',
                        label: `Design / Fab / Delivery (${
                          commercialRows.filter((r) => {
                            const s = normalizeHardwareStatus(r.po)
                            return s === 'Design' || s === 'Fabrication' || s === 'In Delivery'
                          }).length
                        })`,
                      },
                      {
                        id: 'delivered',
                        label: `Delivered (${commercialRows.filter((r) => normalizeHardwareStatus(r.po) === 'Delivered').length})`,
                      },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setRadarFilter(f.id)}
                      className={`rounded-full px-2 py-0.5 font-medium border transition-colors ${
                        radarFilter === f.id
                          ? 'border-primary bg-primary-soft text-primary'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400">Click status badges to update live</span>
              </div>

              <div className="overflow-x-auto max-h-60 overflow-y-auto -mx-3">
                {filteredRadarRows.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">No hardware deliverables match this filter.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-[11px] text-slate-500 text-left sticky top-0 bg-white border-b border-slate-100 z-10">
                      <tr className="whitespace-nowrap">
                        <th className="px-3 py-1.5 font-semibold">HRS.Deliverable</th>
                        <th className="px-2 py-1.5 font-semibold">Supplier</th>
                        <th className="px-2 py-1.5 font-semibold">Quote / PO</th>
                        <th className="px-2 py-1.5 font-semibold">Exp. Delivery</th>
                        <th className="px-3 py-1.5 font-semibold">HW Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRadarRows.map((row) => {
                        const w = row.workstream
                        const po = row.po
                        const hwStatus = normalizeHardwareStatus(po)
                        const late = po && !po.actualDelivery && isPast(po.expectedDelivery) && hwStatus !== 'Delivered'
                        const delivName = w.category === 'Others' && w.name !== 'Others' ? `Others (${w.name})` : w.name || w.category
                        return (
                          <tr key={w.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              <Link
                                to={`/projects/${w.projectId}?tab=deliverables`}
                                className="font-semibold text-primary hover:underline"
                                title={`Open Deliverables & Commercial tab for ${row.projectCode}.${delivName}`}
                              >
                                {row.projectCode}.{delivName}
                              </Link>
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 truncate max-w-[110px]">{row.supplierName}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              {po?.number ? (
                                <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">
                                  PO: {po.number}
                                </span>
                              ) : row.quotation?.number ? (
                                <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-900">
                                  Q: {row.quotation.number}
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-600 font-medium">Pending Quote/PO</span>
                              )}
                            </td>
                            <td className={`px-2 py-1.5 whitespace-nowrap ${late ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                              {formatDate(po?.expectedDelivery || '')}
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              <div className="relative inline-flex items-center cursor-pointer" title="Click to update Hardware Status for this deliverable">
                                <CommercialBadge status={hwStatus} />
                                <select
                                  aria-label={`Update Hardware Status for ${row.projectCode}.${delivName}`}
                                  value={HARDWARE_STATUSES.includes(hwStatus as (typeof HARDWARE_STATUSES)[number]) ? hwStatus : 'Not Started'}
                                  onChange={async (e) => {
                                    const nextHw = e.target.value
                                    const base = rowToCommercialInput(row)
                                    await saveDeliverableCommercial(
                                      {
                                        ...emptyDeliverableCommercial(w.projectId, w.id, w.supplierId),
                                        ...base,
                                        deliveryStatus: nextHw,
                                      },
                                      true,
                                    )
                                  }}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                >
                                  {HARDWARE_STATUSES.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-slate-500">
                <b className="text-slate-600">Remarks:</b> Need PO and Design / Fab / Delivery show all active NPI; Delivered shows past 2 weeks to next 2 weeks only.
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <form onSubmit={addQuickNote} className="flex gap-1.5">
                <input
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Add a quick engineering reminder or follow-up note…"
                  className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button type="submit" size="sm" variant="primary">
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </form>

              <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
                {quickNotes.length === 0 ? (
                  <li className="py-8 text-center text-xs text-slate-400">No pinned notes yet. Add a quick reminder above.</li>
                ) : (
                  quickNotes.map((note) => (
                    <li key={note.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setQuickNotes((prev) =>
                            prev.map((n) => (n.id === note.id ? { ...n, done: !n.done } : n)),
                          )
                        }
                        className="flex items-center gap-2 min-w-0 text-left flex-1 hover:text-primary"
                      >
                        {note.done ? (
                          <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span className={note.done ? 'line-through text-slate-400 truncate' : 'text-slate-700 font-medium truncate'}>
                          {note.text}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickNotes((prev) => prev.filter((n) => n.id !== note.id))}
                        className="p-1 text-slate-400 hover:text-red-500 rounded"
                        title="Delete note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </Card>

        {/* RIGHT SLOT: Recent Activities (Past 15 Activities Only) */}
        <Card
          title={`Recent Activities (Latest ${latest15Logs.length})`}
          action={<span className="text-xs text-slate-400">Past 15 activities</span>}
          className="[&>div]:!p-3"
        >
          {latest15Logs.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
              {latest15Logs.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Badge color={l.action === 'Deleted' ? 'red' : l.action === 'Status Changed' ? 'blue' : 'grey'}>{l.action}</Badge>
                    <Badge color="violet">{l.entity}</Badge>
                    <span className="truncate text-slate-700">{l.message}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 shrink-0">{formatDateTime(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <TaskForm open={taskModalOpen} task={editingTask} onClose={() => { setTaskModalOpen(false); setEditingTask(undefined) }} />
      <MilestoneForm open={milestoneModalOpen} milestone={editingMilestone} onClose={() => { setMilestoneModalOpen(false); setEditingMilestone(undefined) }} />
    </div>
  )
}
