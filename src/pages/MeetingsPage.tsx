import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import type { Meeting, MeetingAction, Project, Task } from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loading, Select } from '@/components/ui'
import { MeetingActionForm, MeetingForm } from '@/features/meetings/MeetingForms'
import { deleteMeeting, deleteMeetingAction } from '@/services/meetingService'
import { formatDate, isPast } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

export function MeetingsPage() {
  const meetings = useTable<Meeting>('meetings')
  const actions = useTable<MeetingAction>('meetingActions')
  const projects = useTable<Project>('projects')
  const tasks = useTable<Task>('tasks')
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [fProject, setFProject] = useState('')
  const [expanded, setExpanded] = useState<string>('')

  const [mOpen, setMOpen] = useState(false)
  const [mEdit, setMEdit] = useState<Meeting | undefined>()
  const [mDel, setMDel] = useState<Meeting | undefined>()

  const [aOpen, setAOpen] = useState(false)
  const [aMeeting, setAMeeting] = useState<Meeting | undefined>()
  const [aEdit, setAEdit] = useState<MeetingAction | undefined>()
  const [aDel, setADel] = useState<MeetingAction | undefined>()
  const [error, setError] = useState('')

  useEffect(() => {
    if (params.get('new')) { setMEdit(undefined); setMOpen(true); setParams({}, { replace: true }) }
  }, [params, setParams])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (meetings ?? [])
      .filter((m) => !fProject || m.projectId === fProject)
      .filter((m) => !q || `${m.title} ${m.participants} ${m.summary} ${m.decisions}`.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [meetings, fProject, search])

  if (!meetings || !actions || !projects || !tasks) return <Loading />

  const proj = (id: string) => projects.find((p) => p.id === id)
  const task = (id: string) => tasks.find((t) => t.id === id)
  const actionsFor = (mid: string) => actions.filter((a) => a.meetingId === mid)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search title, participants, summary…" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-64" />
        <Select className="!w-44" value={fProject} onChange={(e) => setFProject(e.target.value)}
          options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.code }))]} />
        <Button variant="primary" className="ml-auto" onClick={() => { setMEdit(undefined); setMOpen(true) }}><Plus className="h-4 w-4" /> Record Meeting</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {filtered.length === 0 ? (
        <Card><EmptyState title={meetings.length === 0 ? 'No meeting minutes yet' : 'No meetings match your filters'} hint="Record meeting minutes and link action items to your central task tracker." /></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => {
            const isOpen = expanded === m.id || filtered.length === 1
            const mActions = actionsFor(m.id)
            const openCount = mActions.filter((a) => a.status !== 'Completed' && a.status !== 'Cancelled').length
            const p = proj(m.projectId)
            return (
              <Card key={m.id} className="!p-0">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(isOpen && filtered.length > 1 ? '' : m.id)}>
                  {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{m.title}</span>
                      {p && <Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="text-xs font-medium text-primary hover:underline">{p.code}</Link>}
                      <Badge color={openCount > 0 ? 'amber' : 'green'}>{mActions.length} action{mActions.length === 1 ? '' : 's'}{openCount > 0 ? ` (${openCount} open)` : ''}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{formatDate(m.date)}{m.participants && ` · ${m.participants}`}</p>
                  </div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" aria-label="Edit meeting" onClick={() => { setMEdit(m); setMOpen(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" aria-label="Delete meeting" onClick={() => setMDel(m)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-4 space-y-4 text-sm">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div><p className="text-xs font-medium text-slate-500 mb-1">Discussion Summary</p><p className="text-slate-700 whitespace-pre-line">{m.summary || '—'}</p></div>
                      <div><p className="text-xs font-medium text-slate-500 mb-1">Decisions</p><p className="text-slate-700 whitespace-pre-line">{m.decisions || '—'}</p></div>
                    </div>
                    {m.remarks && <div><p className="text-xs font-medium text-slate-500 mb-1">Remarks</p><p className="text-slate-600">{m.remarks}</p></div>}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action Items</h3>
                        <Button size="sm" variant="primary" onClick={() => { setAMeeting(m); setAEdit(undefined); setAOpen(true) }}><Plus className="h-3.5 w-3.5" /> Add Action Item</Button>
                      </div>
                      {mActions.length === 0 ? <p className="text-xs text-slate-400">No action items recorded for this meeting.</p> : (
                        <div className="overflow-x-auto rounded border border-slate-100">
                          <table className="w-full text-sm">
                            <thead className="text-xs text-slate-500 text-left bg-slate-50">
                              <tr>{['Action Item', 'Assigned Person', 'Due Date', 'Status', 'Linked Task', ''].map((h, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {mActions.map((a) => {
                                const linked = task(a.taskId)
                                const late = a.dueDate && isPast(a.dueDate) && a.status !== 'Completed' && a.status !== 'Cancelled'
                                return (
                                  <tr key={a.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2 font-medium">{a.action}</td>
                                    <td className="px-3">{a.assignee || '—'}</td>
                                    <td className={`px-3 whitespace-nowrap ${late ? 'text-red-600 font-medium' : ''}`}>{formatDate(a.dueDate)}</td>
                                    <td className="px-3"><Badge color={a.status === 'Completed' ? 'green' : late ? 'red' : 'blue'}>{late ? 'Overdue' : a.status}</Badge></td>
                                    <td className="px-3">
                                      {linked ? (
                                        <Link to="/tasks" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                          <Link2 className="h-3.5 w-3.5" /> {linked.name} ({linked.status})
                                        </Link>
                                      ) : <span className="text-xs text-slate-400">—</span>}
                                    </td>
                                    <td className="px-3"><div className="flex gap-1">
                                      <Button variant="ghost" size="sm" aria-label="Edit action" onClick={() => { setAMeeting(m); setAEdit(a); setAOpen(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                                      <Button variant="ghost" size="sm" aria-label="Delete action" onClick={() => setADel(a)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                                    </div></td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <MeetingForm open={mOpen} meeting={mEdit} defaultProjectId={fProject} onClose={() => setMOpen(false)} />
      {aMeeting && <MeetingActionForm open={aOpen} meetingId={aMeeting.id} projectId={aMeeting.projectId} record={aEdit} onClose={() => setAOpen(false)} />}

      <ConfirmDialog open={!!mDel} title="Delete meeting?" onCancel={() => setMDel(undefined)}
        onConfirm={async () => { try { await deleteMeeting(mDel!.id) } catch (e) { setError(errorMessage(e)) } setMDel(undefined) }}
        message={<>Delete meeting <b>{mDel?.title}</b> and all its action items? (Linked tasks in the central task tracker are not deleted.)</>} />
      <ConfirmDialog open={!!aDel} title="Delete action item?" onCancel={() => setADel(undefined)}
        onConfirm={async () => { try { await deleteMeetingAction(aDel!.id) } catch (e) { setError(errorMessage(e)) } setADel(undefined) }}
        message={<>Delete action item <b>{aDel?.action}</b>?</>} />
    </div>
  )
}
