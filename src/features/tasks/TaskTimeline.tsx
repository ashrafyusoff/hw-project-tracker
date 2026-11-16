import { useMemo } from 'react'
import type { Project, Task } from '@/types'
import { EmptyState } from '@/components/ui'
import { formatDate, todayStr } from '@/utils/helpers'
import { isOverdueTask } from './TaskTable'

const DAY = 86400000
const ms = (s: string) => new Date(s).getTime()

const barColor = (t: Task) =>
  t.status === 'Completed' ? 'bg-emerald-500' : t.status === 'Cancelled' ? 'bg-slate-300' : isOverdueTask(t) ? 'bg-red-500' : 'bg-primary'

// Simple Gantt-style chart: one row per task, grouped by project.
export function TaskTimeline({ tasks, projects }: { tasks: Task[]; projects: Project[] }) {
  const { start, end, months, groups, undated } = useMemo(() => {
    const dated = tasks.filter((t) => t.startDate || t.dueDate)
    const undated = tasks.filter((t) => !t.startDate && !t.dueDate)
    const from = (t: Task) => t.startDate || t.dueDate
    const to = (t: Task) => t.dueDate || t.startDate
    const all = [...dated.flatMap((t) => [ms(from(t)), ms(to(t))]), ms(todayStr())]
    const start = Math.min(...all) - 3 * DAY
    const end = Math.max(...all) + 3 * DAY
    // month tick marks
    const months: { label: string; left: number }[] = []
    const d = new Date(start); d.setDate(1); d.setMonth(d.getMonth() + 1)
    for (; d.getTime() < end; d.setMonth(d.getMonth() + 1)) {
      months.push({ label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), left: ((d.getTime() - start) / (end - start)) * 100 })
    }
    const groups = projects
      .map((p) => ({ project: p, tasks: dated.filter((t) => t.projectId === p.id).sort((a, b) => from(a).localeCompare(from(b))) }))
      .filter((g) => g.tasks.length > 0)
    return { start, end, months, groups, undated }
  }, [tasks, projects])

  if (groups.length === 0) return <EmptyState title="No tasks with dates to show" hint="Add start or due dates to tasks to see them on the timeline." />

  const pos = (s: string) => ((ms(s) - start) / (end - start)) * 100
  const todayLeft = pos(todayStr())

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        {/* header with months */}
        <div className="flex border-b border-slate-200 text-xs text-slate-500">
          <div className="w-64 shrink-0 px-3 py-2 font-medium">Task</div>
          <div className="relative flex-1 h-8">
            {months.map((m) => <span key={m.label + m.left} className="absolute top-2 -translate-x-1/2 whitespace-nowrap" style={{ left: `${m.left}%` }}>{m.label}</span>)}
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.project.id}>
            <div className="bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 border-b border-slate-100">{g.project.code} · {g.project.name}</div>
            {g.tasks.map((t) => {
              const s = t.startDate || t.dueDate
              const e = t.dueDate || t.startDate
              const left = pos(s)
              const width = Math.max(((ms(e) - ms(s)) / (end - start)) * 100, 0.8)
              return (
                <div key={t.id} className="flex items-center border-b border-slate-50 hover:bg-slate-50">
                  <div className="w-64 shrink-0 px-3 py-1.5 truncate text-sm" title={t.name}>{t.name}</div>
                  <div className="relative flex-1 h-8">
                    {months.map((m) => <span key={m.label + m.left} className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${m.left}%` }} />)}
                    <span className="absolute inset-y-0 border-l-2 border-red-300 z-10" style={{ left: `${todayLeft}%` }} title="Today" />
                    <div className={`absolute top-2 h-4 rounded ${barColor(t)} opacity-90`} style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${t.name}\n${formatDate(t.startDate)} → ${formatDate(t.dueDate)}\n${t.status}`}>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <p className="px-3 py-2 text-xs text-slate-400">Red line = today. Red bar = overdue, green = completed. Hover a bar for dates.</p>
        {undated.length > 0 && <p className="px-3 pb-2 text-xs text-slate-400">{undated.length} task(s) have no dates and are not shown.</p>}
      </div>
    </div>
  )
}

