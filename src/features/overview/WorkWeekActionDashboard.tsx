import { useMemo } from 'react'
import { AlertCircle, Flag } from 'lucide-react'
import {
  MILESTONE_STATUSES,
  PRIORITIES,
  TASK_STATUSES,
  type Milestone,
  type MilestoneStatus,
  type Priority,
  type Project,
  type Task,
  type TaskStatus,
  type Workstream,
} from '@/types'
import { Card } from '@/components/ui'
import { InlineStatusSelect } from '@/pages/ProjectsPage'
import { updateTask } from '@/services/taskService'
import { updateMilestone } from '@/services/milestoneService'
import { formatDate, todayStr } from '@/utils/helpers'
import { addDays, getIsoWeek, getMondayOfWeek, parseYmd, toYmd } from './WorkWeekCalendar'

interface ActionItem {
  kind: 'task' | 'milestone'
  id: string
  name: string
  projectId: string
  workstreamId: string
  date: string
  status: string
  priority?: Priority
  isCarryOver: boolean
  itemWw: number
  task?: Task
  milestone?: Milestone
}

export function WorkWeekActionDashboard({
  tasks,
  milestones,
  projects,
  workstreams,
  onEditTask,
  onEditMilestone,
}: {
  tasks: Task[]
  milestones: Milestone[]
  projects: Project[]
  workstreams: Workstream[]
  onEditTask: (t: Task) => void
  onEditMilestone: (m: Milestone) => void
}) {
  const today = todayStr()
  const currentMonday = getMondayOfWeek(parseYmd(today))
  const mondayYmd = toYmd(currentMonday)
  const sundayYmd = toYmd(addDays(currentMonday, 6))
  const currentWw = getIsoWeek(currentMonday)

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const wsMap = useMemo(() => new Map(workstreams.map((w) => [w.id, w])), [workstreams])

  const items = useMemo(() => {
    const list: ActionItem[] = []

    for (const t of tasks) {
      // Completed or Cancelled items are never shown
      if (t.status === 'Completed' || t.status === 'Cancelled') continue
      const effDate = t.dueDate || t.startDate
      if (!effDate) continue

      const itemWw = getIsoWeek(parseYmd(effDate))
      const isCarryOver = effDate < mondayYmd
      const inThisWeek =
        (effDate >= mondayYmd && effDate <= sundayYmd) ||
        (!!t.startDate && !!t.dueDate && t.startDate <= sundayYmd && t.dueDate >= mondayYmd)

      if (isCarryOver || inThisWeek) {
        list.push({
          kind: 'task',
          id: t.id,
          name: t.name,
          projectId: t.projectId,
          workstreamId: t.workstreamId,
          date: effDate,
          status: t.status,
          priority: t.priority,
          isCarryOver,
          itemWw,
          task: t,
        })
      }
    }

    for (const m of milestones) {
      if (m.status === 'Completed') continue
      if (!m.targetDate) continue

      const itemWw = getIsoWeek(parseYmd(m.targetDate))
      const isCarryOver = m.targetDate < mondayYmd
      const inThisWeek = m.targetDate >= mondayYmd && m.targetDate <= sundayYmd

      if (isCarryOver || inThisWeek) {
        list.push({
          kind: 'milestone',
          id: m.id,
          name: m.name,
          projectId: m.projectId,
          workstreamId: m.workstreamId,
          date: m.targetDate,
          status: m.status,
          isCarryOver,
          itemWw,
          milestone: m,
        })
      }
    }

    return list.sort((a, b) => {
      if (a.isCarryOver !== b.isCarryOver) return a.isCarryOver ? -1 : 1
      return a.date.localeCompare(b.date)
    })
  }, [tasks, milestones, mondayYmd, sundayYmd])

  return (
    <Card
      title="This Week Activities"
      action={<span className="text-xs font-medium text-slate-400">WW{String(currentWw).padStart(2, '0')}</span>}
      className="[&>div]:!p-3"
    >
      {items.length === 0 ? (
        <div className="flex items-center justify-center h-44 text-xs text-slate-400">
          No pending activities for this week.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-52 overflow-y-auto -mx-3">
          <table className="w-full text-xs">
            <thead className="text-[11px] text-slate-500 text-left sticky top-0 bg-white z-10">
              <tr>
                <th className="px-3 py-1.5 font-medium">Task / Activity</th>
                <th className="px-2 py-1.5 font-medium">HRS / Work</th>
                <th className="px-2 py-1.5 font-medium">Due</th>
                <th className="px-2 py-1.5 font-medium">Priority</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const proj = projectMap.get(item.projectId)
                const ws = wsMap.get(item.workstreamId)
                const isOverdue = item.date < today
                return (
                  <tr
                    key={`${item.kind}-${item.id}`}
                    onClick={() => {
                      if (item.kind === 'task' && item.task) onEditTask(item.task)
                      else if (item.kind === 'milestone' && item.milestone) onEditMilestone(item.milestone)
                    }}
                    title="Click to update activity/task"
                    className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.kind === 'milestone' && <Flag className="h-3 w-3 text-purple-600 shrink-0" />}
                        <span className="font-semibold text-slate-800 truncate max-w-[180px]">{item.name}</span>
                        {item.isCarryOver && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.2 text-[10px] font-semibold text-amber-800 shrink-0">
                            <AlertCircle className="h-2.5 w-2.5" /> WW{String(item.itemWw).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      {ws && <div className="text-[10px] text-slate-400 truncate">{ws.name || ws.category}</div>}
                    </td>
                    <td className="px-2 py-1.5 font-semibold text-primary whitespace-nowrap">
                      {proj?.code ?? '—'}
                    </td>
                    <td className={`px-2 py-1.5 whitespace-nowrap ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                      {formatDate(item.date)}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {item.kind === 'task' && item.task ? (
                        <InlineStatusSelect
                          value={item.task.priority}
                          options={PRIORITIES}
                          onChange={async (next) => {
                            await updateTask(item.task!.id, { ...item.task!, priority: next as Priority })
                          }}
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {item.kind === 'task' && item.task ? (
                        <InlineStatusSelect
                          value={item.task.status}
                          options={TASK_STATUSES}
                          onChange={async (next) => {
                            await updateTask(item.task!.id, { ...item.task!, status: next as TaskStatus })
                          }}
                        />
                      ) : item.kind === 'milestone' && item.milestone ? (
                        <InlineStatusSelect
                          value={item.milestone.status}
                          options={MILESTONE_STATUSES}
                          onChange={async (next) => {
                            await updateMilestone(item.milestone!.id, { ...item.milestone!, status: next as MilestoneStatus })
                          }}
                        />
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
