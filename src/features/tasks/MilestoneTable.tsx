import { Pencil, Trash2 } from 'lucide-react'
import type { Milestone, Project, Workstream } from '@/types'
import { Badge, Button } from '@/components/ui'
import { daysUntil, formatDate } from '@/utils/helpers'

export const milestoneLate = (m: Milestone) => m.status !== 'Completed' && !!m.targetDate && daysUntil(m.targetDate) < 0
const color = (m: Milestone) => (m.status === 'Completed' ? 'green' : m.status === 'Delayed' || milestoneLate(m) ? 'red' : m.status === 'In Progress' ? 'blue' : 'grey')

export function MilestoneTable({ milestones, projects, showProject = true, onEdit, onDelete }:
  { milestones: Milestone[]; projects: Project[]; workstreams?: Workstream[]; showProject?: boolean; onEdit: (m: Milestone) => void; onDelete: (m: Milestone) => void }) {
  const head = [...(showProject ? ['HRS Number'] : []), 'Milestone', 'Description', 'Target', 'Actual', 'Status', '']
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500 text-left bg-slate-50"><tr>{head.map((h, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {milestones.map((m) => (
            <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
              {showProject && <td className="px-3 py-2.5 font-medium text-primary">{projects.find((p) => p.id === m.projectId)?.code ?? '—'}</td>}
              <td className="px-3 font-medium">{m.name}</td>
              <td className="px-3 text-slate-500 max-w-xs truncate">{m.description || '—'}</td>
              <td className={`px-3 whitespace-nowrap ${milestoneLate(m) ? 'text-red-600 font-medium' : ''}`}>{formatDate(m.targetDate)}</td>
              <td className="px-3 whitespace-nowrap">{formatDate(m.actualDate)}</td>
              <td className="px-3"><Badge color={color(m)}>{milestoneLate(m) && m.status !== 'Delayed' ? 'Overdue' : m.status}</Badge></td>
              <td className="px-3"><div className="flex gap-1">
                <Button variant="ghost" size="sm" aria-label="Edit milestone" onClick={() => onEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" aria-label="Delete milestone" onClick={() => onDelete(m)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
