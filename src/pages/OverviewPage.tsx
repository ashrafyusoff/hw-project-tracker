import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { ActivityLog, Milestone, Project, Supplier, Task, Workstream } from '@/types'
import { HW_TYPES, PROJECT_STATUSES, isArchivedStatus } from '@/types'
import { Badge, Card, EmptyState, Loading, Button } from '@/components/ui'
import { daysFromToday, formatDate, formatDateTime, todayStr } from '@/utils/helpers'
import { loadSampleData } from '@/services/sampleData'
import { WorkWeekCalendar, addDays, getIsoWeek, getMondayOfWeek, parseYmd, toYmd } from '@/features/overview/WorkWeekCalendar'
import { WorkWeekActionDashboard } from '@/features/overview/WorkWeekActionDashboard'
import { TaskForm } from '@/features/tasks/TaskForm'
import { MilestoneForm } from '@/features/tasks/MilestoneForm'

const STATUS_COLORS: Record<string, string> = {
  Planning: '#8b5cf6',
  'In Progress': '#2563eb',
  'On Hold': '#f59e0b',
  Delayed: '#ef4444',
  Completed: '#10b981',
  Cancelled: '#94a3b8',
}

type HwRequiredFilter = 'all' | 'asc' | 'desc' | 'overdue' | '30d' | '60d'

export function OverviewPage() {
  const navigate = useNavigate()
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')
  const tasks = useTable<Task>('tasks')
  const milestones = useTable<Milestone>('milestones')
  const suppliers = useTable<Supplier>('suppliers')
  const logs = useTable<ActivityLog>('activityLogs')

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | undefined>()
  const [showAllLogs, setShowAllLogs] = usePersistedState<boolean>('npi.overview.showAllLogs', false)

  // Saved filters for Project Overview ("HW Type" and "HW Required")
  const [overviewHwType, setOverviewHwType] = usePersistedState<string>('npi.overview.hwType', 'ALL')
  const [overviewHwRequired, setOverviewHwRequired] = usePersistedState<HwRequiredFilter>('npi.overview.hwRequired', 'all')

  // 3-week workload data (Past 2 weeks + Current week) for Tasks (NPI Projects vs Non-NPI Work)
  const workloadData = useMemo(() => {
    if (!tasks || !projects) return []
    const projMap = new Map(projects.map((p) => [p.id, p]))
    const currentMon = getMondayOfWeek(parseYmd(todayStr()))

    return [-2, -1, 0].map((offset) => {
      const mon = addDays(currentMon, offset * 7)
      const sun = addDays(mon, 6)
      const monYmd = toYmd(mon)
      const sunYmd = toYmd(sun)
      const ww = getIsoWeek(mon)
      const shortRange = `${mon.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}–${addDays(mon, 4).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`

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
        week: offset === 0 ? `WW${String(ww).padStart(2, '0')} (Current)` : `WW${String(ww).padStart(2, '0')}`,
        range: shortRange,
        'NPI Project Tasks': npiTasks,
        'Non-NPI Work Tasks': nonNpiTasks,
        total: npiTasks + nonNpiTasks,
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

  if (!projects || !workstreams || !tasks || !milestones || !suppliers || !logs) return <Loading />

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

  const sortedLogs = [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const visibleLogs = showAllLogs ? sortedLogs : sortedLogs.slice(0, 10)

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

      {/* Below Workweek Schedule: 2 Side-by-Side Analytics Sections */}
      <div className="grid xl:grid-cols-2 gap-4 items-stretch">
        {/* Section 1: 3-Week Task Workload Bar Chart (Past 2 Weeks + Current Week) */}
        <Card
          title="3-Week Task Workload (Past 2 Weeks + Current Week)"
          action={<span className="text-xs text-slate-400">NPI Projects vs Non-NPI Work</span>}
          className="[&>div]:!p-3"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadData} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip
                  formatter={(value, name) => [`${value ?? 0} task(s)`, String(name ?? '')]}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as { range?: string } | undefined
                    return row?.range ? `${label} · ${row.range}` : String(label)
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="NPI Project Tasks" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={28} />
                <Bar dataKey="Non-NPI Work Tasks" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Section 2: Project Status Pie-Donut Charts + Status Tables (NPI Projects & Non-NPI Work) */}
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
                <div className="h-36 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={npiChartData.length ? npiChartData : [{ name: 'None', value: 1 }]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={28}
                        outerRadius={46}
                        paddingAngle={2}
                      >
                        {(npiChartData.length ? npiChartData : [{ name: 'None', value: 1 }]).map((d) => (
                          <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? '#e2e8f0'} />
                        ))}
                      </Pie>
                      <Tooltip />
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
                <div className="h-36 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={nonNpiChartData.length ? nonNpiChartData : [{ name: 'None', value: 1 }]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={28}
                        outerRadius={46}
                        paddingAngle={2}
                      >
                        {(nonNpiChartData.length ? nonNpiChartData : [{ name: 'None', value: 1 }]).map((d) => (
                          <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? '#e2e8f0'} />
                        ))}
                      </Pie>
                      <Tooltip />
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

      <Card
        title={`Recent Activities (${sortedLogs.length})`}
        action={
          sortedLogs.length > 10 ? (
            <button onClick={() => setShowAllLogs((s) => !s)} className="text-xs text-primary hover:underline">
              {showAllLogs ? 'Show latest 10' : `Show all (${sortedLogs.length})`}
            </button>
          ) : null
        }
      >
        {visibleLogs.length === 0 ? <EmptyState title="No activity yet" /> : (
          <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
            {visibleLogs.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <Badge color={l.action === 'Deleted' ? 'red' : l.action === 'Status Changed' ? 'blue' : 'grey'}>{l.action}</Badge>
                  <Badge color="violet">{l.entity}</Badge>
                  <span className="truncate">{l.message}</span>
                </span>
                <span className="text-xs text-slate-400 shrink-0">{formatDateTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TaskForm open={taskModalOpen} task={editingTask} onClose={() => { setTaskModalOpen(false); setEditingTask(undefined) }} />
      <MilestoneForm open={milestoneModalOpen} milestone={editingMilestone} onClose={() => { setMilestoneModalOpen(false); setEditingMilestone(undefined) }} />
    </div>
  )
}
