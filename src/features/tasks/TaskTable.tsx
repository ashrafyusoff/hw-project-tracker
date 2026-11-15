import { Pencil, Trash2 } from 'lucide-react'
import type { Project, Supplier, Task, Workstream } from '@/types'
import { Badge, Button, ProgressBar } from '@/components/ui'
import { daysUntil, formatDate } from '@/utils/helpers'

export const isOpenTask = (t: Task) => t.status !== 'Completed' && t.status !== 'Cancelled'
export const isOverdueTask = (t: Task) => isOpenTask(t) && !!t.dueDate && daysUntil(t.dueDate) < 0

// Deadline indicator: Overdue / Due today / Due in N days (within a week)
export function DeadlineBadge({ task }: { task: Task }) {
  if (!isOpenTask(task) || !task.dueDate) return null
  const d = daysUntil(task.dueDate)
  if (d < 0) return <Badge color="red">Overdue {-d}d</Badge>
  if (d === 0) return <Badge color="amber">Due today</Badge>
  if (d <= 7) return <Badge color="amber">Due in {d}d</Badge>
  return null
}

const statusColor = (s: string) =>
  s === 'Completed' ? 'green' : s === 'In Progress' ? 'blue' : s === 'Waiting for Supplier' ? 'amber' : s === 'Under Review' ? 'violet' : 'grey'

interface Props {
  tasks: Task[]
  projects: Project[]
  workstreams: Workstream[]
  suppliers: Supplier[]
  showProject?: boolean
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
}

export function TaskTable({ tasks, projects, workstreams, suppliers, showProject = true, onEdit, onDelete }: Props) {
  const proj = (id: string) => projects.find((p) => p.id === id)?.code ?? '—'
  const ws = (id: string) => workstreams.find((w) => w.id === id)?.name ?? '—'
  const sup = (id: string) => suppliers.find((s) => s.id === id)?.name ?? '—'
  const head = [...(showProject ? ['HRS Number'] : []), 'Task', 'Deliverable', 'Supplier', 'Start', 'Due', 'Priority', 'Status', 'Progress', '']
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500 text-left bg-slate-50"><tr>{head.map((h, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
              {showProject && <td className="px-3 py-2.5 font-medium text-primary whitespace-nowrap">{proj(t.projectId)}</td>}
              <td className="px-3 font-medium min-w-[200px]">{t.name}</td>
              <td className="px-3 text-slate-500">{ws(t.workstreamId)}</td>
              <td className="px-3">{sup(t.supplierId)}</td>
              <td className="px-3 whitespace-nowrap">{formatDate(t.startDate)}</td>
              <td className="px-3 whitespace-nowrap">
                <div className={isOverdueTask(t) ? 'text-red-600 font-medium' : ''}>{formatDate(t.dueDate)}</div>
                <DeadlineBadge task={t} />
              </td>
              <td className="px-3"><Badge>{t.priority}</Badge></td>
              <td className="px-3"><Badge color={statusColor(t.status)}>{t.status}</Badge></td>
              <td className="px-3 w-32"><ProgressBar value={t.progress} /></td>
              <td className="px-3"><div className="flex gap-1">
                <Button variant="ghost" size="sm" aria-label="Edit task" onClick={() => onEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" aria-label="Delete task" onClick={() => onDelete(t)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
