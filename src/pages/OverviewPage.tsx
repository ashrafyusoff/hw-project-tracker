import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTable } from '@/hooks/useTable'
import type { ActivityLog, Milestone, Project, Supplier, Task, Workstream } from '@/types'
import { isArchivedStatus } from '@/types'
import { Badge, Card, EmptyState, Loading, ProgressBar, Button } from '@/components/ui'
import { formatDate, formatDateTime } from '@/utils/helpers'
import { loadSampleData } from '@/services/sampleData'
import { WorkWeekCalendar } from '@/features/overview/WorkWeekCalendar'
import { WorkWeekActionDashboard } from '@/features/overview/WorkWeekActionDashboard'
import { TaskForm } from '@/features/tasks/TaskForm'
import { MilestoneForm } from '@/features/tasks/MilestoneForm'

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
  const [showAllLogs, setShowAllLogs] = useState(false)

  if (!projects || !workstreams || !tasks || !milestones || !suppliers || !logs) return <Loading />

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

  const npiProjects = projects.filter((p) => !p.isNonNpi)
  const activeNpiProjects = npiProjects.filter((p) => !isArchivedStatus(p.status))

  const sortedLogs = [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const visibleLogs = showAllLogs ? sortedLogs : sortedLogs.slice(0, 10)

  return (
    <div className="space-y-4">
      <div className="grid xl:grid-cols-2 gap-4 items-stretch">
        {/* 1. Left: This Week Activities (compact, uncompleted only + previous week carry-over, inline Priority & Status edit) */}
        <WorkWeekActionDashboard
          tasks={tasks}
          milestones={milestones}
          projects={projects}
          workstreams={workstreams}
          onEditTask={(t) => { setEditingTask(t); setTaskModalOpen(true) }}
          onEditMilestone={(m) => { setEditingMilestone(m); setMilestoneModalOpen(true) }}
        />

        {/* 2. Right: Project Overview (compact) */}
        <Card
          title="Project Overview"
          className="[&>div]:!p-3"
          action={<Link to="/projects" className="text-xs text-primary hover:underline">View all</Link>}
        >
          <div className="overflow-x-auto max-h-52 overflow-y-auto -mx-3">
            <table className="w-full text-xs">
              <thead className="text-[11px] text-slate-500 text-left sticky top-0 bg-white">
                <tr>
                  <th className="px-3 py-1.5 font-medium">HRS</th>
                  <th className="px-2 py-1.5 font-medium">HW Type</th>
                  <th className="px-2 py-1.5 font-medium">Device</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Progress</th>
                  <th className="px-3 py-1.5 font-medium">HW Req</th>
                </tr>
              </thead>
              <tbody>
                {(activeNpiProjects.length ? activeNpiProjects : npiProjects).slice(0, 6).map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-semibold whitespace-nowrap">
                      <Link to={`/projects/${p.id}`} className="text-primary hover:underline">{p.code}</Link>
                    </td>
                    <td className="px-2 py-1.5"><Badge color="blue">{p.hwType || 'FT'}</Badge></td>
                    <td className="px-2 py-1.5 text-slate-700 truncate max-w-[110px]">{p.deviceName || '—'}</td>
                    <td className="px-2 py-1.5"><Badge>{p.status}</Badge></td>
                    <td className="px-2 py-1.5 w-28"><ProgressBar value={p.progress} /></td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-500">{formatDate(p.baselineDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        {/* 5-day Workweek Calendar for Tasks and Milestones with Drag-and-Drop */}
        <WorkWeekCalendar
          tasks={tasks}
          milestones={milestones}
          projects={projects}
          onEditTask={(t) => { setEditingTask(t); setTaskModalOpen(true) }}
          onEditMilestone={(m) => { setEditingMilestone(m); setMilestoneModalOpen(true) }}
        />

        <Card
          title={`Recent Activities (${sortedLogs.length})`}
          className="xl:col-span-3"
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

      <TaskForm open={taskModalOpen} task={editingTask} onClose={() => { setTaskModalOpen(false); setEditingTask(undefined) }} />
      <MilestoneForm open={milestoneModalOpen} milestone={editingMilestone} onClose={() => { setMilestoneModalOpen(false); setEditingMilestone(undefined) }} />
    </div>
  )
}
