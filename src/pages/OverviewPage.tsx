import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useTable } from '@/hooks/useTable'
import type { ActivityLog, Milestone, PetRecord, PrRecord, Project, Quotation, Supplier, Task } from '@/types'
import { PROJECT_STATUSES } from '@/types'
import { Badge, Card, EmptyState, Loading, ProgressBar, Button } from '@/components/ui'
import { formatDate, formatDateTime, todayStr } from '@/utils/helpers'
import { loadSampleData } from '@/services/sampleData'
import { WorkWeekCalendar } from '@/features/overview/WorkWeekCalendar'
import { TaskForm } from '@/features/tasks/TaskForm'
import { MilestoneForm } from '@/features/tasks/MilestoneForm'

const STATUS_COLORS: Record<string, string> = {
  Planning: '#8b5cf6', 'In Progress': '#2563eb', 'On Hold': '#f59e0b', Delayed: '#ef4444', Completed: '#10b981', Cancelled: '#94a3b8',
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'red' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-0.5 ${tone === 'red' && value > 0 ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

export function OverviewPage() {
  const navigate = useNavigate()
  const projects = useTable<Project>('projects')
  const tasks = useTable<Task>('tasks')
  const milestones = useTable<Milestone>('milestones')
  const suppliers = useTable<Supplier>('suppliers')
  const quotations = useTable<Quotation>('quotations')
  const pets = useTable<PetRecord>('petRecords')
  const prs = useTable<PrRecord>('prRecords')
  const logs = useTable<ActivityLog>('activityLogs')

  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [editingMilestone, setEditingMilestone] = useState<Milestone | undefined>()
  const [showAllLogs, setShowAllLogs] = useState(false)

  if (!projects || !tasks || !milestones || !suppliers || !quotations || !pets || !prs || !logs) return <Loading />

  if (projects.length === 0) {
    return (
      <Card>
        <EmptyState title="No projects yet" hint="Create your first project, or load sample semiconductor NPI data to see how the app works."
          action={<div className="flex gap-2">
            <Button variant="primary" onClick={() => navigate('/projects?new=1')}>Create Project</Button>
            <Button onClick={() => loadSampleData()}>Load Sample Data</Button>
          </div>} />
      </Card>
    )
  }

  const today = todayStr()
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))
  const openTasks = tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled')
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today)
  const upcomingMilestones = milestones.filter((m) => m.status !== 'Completed' && m.targetDate >= today).sort((a, b) => a.targetDate.localeCompare(b.targetDate))

  const count = (s: string) => projects.filter((p) => p.status === s).length
  const chartData = PROJECT_STATUSES.filter((s) => s !== 'Cancelled').map((s) => ({ name: s, value: count(s) })).filter((d) => d.value > 0)

  // Things waiting on a supplier
  const followUps = [
    ...tasks.filter((t) => t.status === 'Waiting for Supplier').map((t) => ({ id: t.id, text: t.name, supplier: t.supplierId, project: t.projectId, tag: 'Task', date: t.dueDate })),
    ...quotations.filter((q) => !q.receivedDate).map((q) => ({ id: q.id, text: `Quotation ${q.number} awaiting quote`, supplier: q.supplierId, project: q.projectId, tag: 'Quotation', date: q.requestDate })),
    ...pets.filter((r) => !r.approvalDate).map((r) => ({ id: r.id, text: `PET ${r.reference} pending approval`, supplier: r.supplierId, project: r.projectId, tag: 'PET', date: r.submissionDate })),
    ...prs.filter((r) => !r.approvalDate).map((r) => ({ id: r.id, text: `PR ${r.number} pending approval`, supplier: r.supplierId, project: r.projectId, tag: 'PR', date: r.submissionDate })),
  ].slice(0, 6)

  const sortedLogs = [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const visibleLogs = showAllLogs ? sortedLogs : sortedLogs.slice(0, 10)
  const code = (id: string) => projectById.get(id)?.code ?? ''

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Kpi label="Total Projects" value={projects.length} />
        <Kpi label="Active Projects" value={count('In Progress')} />
        <Kpi label="Completed Projects" value={count('Completed')} />
        <Kpi label="Delayed Projects" value={count('Delayed')} tone="red" />
        <Kpi label="Open Tasks" value={openTasks.length} />
        <Kpi label="Overdue Tasks" value={overdue.length} tone="red" />
        <Kpi label="Upcoming Milestones" value={upcomingMilestones.length} />
      </div>

      <div className="grid xl:grid-cols-3 gap-5">
        <Card title="Project Overview" className="xl:col-span-2" action={<Link to="/projects" className="text-xs text-primary hover:underline">View all</Link>}>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 text-left">
                <tr><th className="px-4 py-2 font-medium">Code</th><th className="px-2 font-medium">Name</th><th className="px-2 font-medium">Device</th><th className="px-2 font-medium">Status</th><th className="px-2 font-medium">Progress</th><th className="px-4 font-medium">Target</th></tr>
              </thead>
              <tbody>
                {projects.slice(0, 6).map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium"><Link to={`/projects/${p.id}`} className="text-primary hover:underline">{p.code}</Link></td>
                    <td className="px-2">{p.name}</td>
                    <td className="px-2 text-slate-500">{p.deviceName}</td>
                    <td className="px-2"><Badge>{p.status}</Badge></td>
                    <td className="px-2 w-36"><ProgressBar value={p.progress} /></td>
                    <td className="px-4 whitespace-nowrap">{formatDate(p.revisedDate || p.baselineDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Project Status">
          <div className="h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {chartData.map((d) => <Cell key={d.name} fill={STATUS_COLORS[d.name]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid grid-cols-2 gap-1 text-xs text-slate-600 mt-2">
            {PROJECT_STATUSES.filter((s) => s !== 'Cancelled').map((s) => (
              <li key={s} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[s] }} />{s} ({count(s)})</li>
            ))}
          </ul>
        </Card>

        {/* 5-day Workweek Calendar for Tasks and Milestones with Drag-and-Drop */}
        <WorkWeekCalendar
          tasks={tasks}
          milestones={milestones}
          projects={projects}
          onEditTask={(t) => setEditingTask(t)}
          onEditMilestone={(m) => setEditingMilestone(m)}
        />

        <Card title="Supplier Follow-ups">
          {followUps.length === 0 ? <EmptyState title="Nothing pending" /> : (
            <ul className="space-y-2.5">
              {followUps.map((f) => (
                <li key={f.tag + f.id} className="text-sm">
                  <div className="flex items-center gap-2"><Badge color="amber">{f.tag}</Badge><span className="truncate">{f.text}</span></div>
                  <p className="text-xs text-slate-500 mt-0.5">{supplierById.get(f.supplier)?.name ?? 'No supplier'} · {code(f.project)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={`Recent Activities (${sortedLogs.length})`}
          className="xl:col-span-2"
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
      </div>

      <TaskForm open={!!editingTask} task={editingTask} onClose={() => setEditingTask(undefined)} />
      <MilestoneForm open={!!editingMilestone} milestone={editingMilestone} onClose={() => setEditingMilestone(undefined)} />
    </div>
  )
}
