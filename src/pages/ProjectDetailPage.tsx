import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArrowLeft, Calendar, Cpu, FileSpreadsheet, GitBranch, Layers, ListChecks, Pencil, Plus, Server, Trash2, X } from 'lucide-react'
import { db } from '@/database/db'
import { isArchivedStatus, type Milestone, type Supplier, type Task, type Workstream } from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Loading, Select } from '@/components/ui'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { WorkstreamForm } from '@/features/projects/WorkstreamForm'
import { DeliverableTasksModal } from '@/features/projects/DeliverableTasksModal'
import { ProjectGanttChart } from '@/features/projects/ProjectGanttChart'
import { TaskForm } from '@/features/tasks/TaskForm'
import { MilestoneForm } from '@/features/tasks/MilestoneForm'
import { TaskTable } from '@/features/tasks/TaskTable'
import { MilestoneTable } from '@/features/tasks/MilestoneTable'
import { CommercialBadge, buildDeliverableCommercialRows, normalizeHardwareStatus } from '@/features/commercial/CommercialForms'
import { InlineCommercialCell } from './ProjectsPage'
import { exportSingleProjectReport } from '@/services/exportService'
import { deleteTask } from '@/services/taskService'
import { deleteMilestone } from '@/services/milestoneService'
import { deleteProject } from '@/services/projectService'
import { deleteWorkstream, updateWorkstream } from '@/services/workstreamService'
import { linkSupplierToProject, unlinkSupplierFromProject } from '@/services/supplierService'
import { daysUntil, formatDate, formatDateTime, isPast } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

const TABS = ['Overview', 'Deliverables & Commercial', 'Tasks', 'Suppliers', 'Milestones', 'Activity History'] as const
type Tab = (typeof TABS)[number]

// Everything about ONE project, loaded live from the database.
function useProjectData(id: string) {
  return useLiveQuery(async () => {
    const [project, workstreams, tasks, milestones, quotations, pets, pos, logs, links, suppliers] = await Promise.all([
      db.projects.get(id),
      db.workstreams.where('projectId').equals(id).toArray(),
      db.tasks.where('projectId').equals(id).toArray(),
      db.milestones.where('projectId').equals(id).toArray(),
      db.quotations.where('projectId').equals(id).toArray(),
      db.petRecords.where('projectId').equals(id).toArray(),
      db.poRecords.where('projectId').equals(id).toArray(),
      db.activityLogs.where('projectId').equals(id).toArray(),
      db.projectSuppliers.where('projectId').equals(id).toArray(),
      db.suppliers.toArray(),
    ])
    return { project, workstreams, tasks, milestones, quotations, pets, pos, logs, links, suppliers }
  }, [id])
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 -mb-4">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500 text-left bg-slate-50"><tr>{head.map((h) => <th key={h} className="px-4 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-slate-100 [&_td]:px-4 [&_td]:py-2">{children}</tbody>
      </table>
    </div>
  )
}

function deliverableDisplayName(w: Workstream) {
  if (w.category === 'Others' && w.name && w.name !== 'Others') return `Others (${w.name})`
  return w.name || w.category
}

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const data = useProjectData(id)
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get('tab') === 'deliverables' ? 'Deliverables & Commercial' : 'Overview',
  )

  useEffect(() => {
    if (searchParams.get('tab') === 'deliverables') {
      setTab('Deliverables & Commercial')
    }
  }, [searchParams])
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [wsOpen, setWsOpen] = useState(false)
  const [wsEditing, setWsEditing] = useState<Workstream | undefined>()
  const [wsDeleting, setWsDeleting] = useState<Workstream | undefined>()
  const [wsTasksTarget, setWsTasksTarget] = useState<Workstream | undefined>()
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskEditing, setTaskEditing] = useState<Task | undefined>()
  const [taskDeleting, setTaskDeleting] = useState<Task | undefined>()
  const [msOpen, setMsOpen] = useState(false)
  const [msEditing, setMsEditing] = useState<Milestone | undefined>()
  const [msDeleting, setMsDeleting] = useState<Milestone | undefined>()

  const [linkId, setLinkId] = useState('')
  const [error, setError] = useState('')

  const commercialRows = useMemo(() => {
    if (!data?.project) return []
    return buildDeliverableCommercialRows(
      data.workstreams,
      data.quotations,
      data.pets,
      data.pos,
      [data.project],
      data.suppliers,
    )
  }, [data])

  if (!data) return <Loading />
  const { project: p, workstreams, tasks, milestones, logs, links, suppliers } = data
  if (!p) {
    return <Card><EmptyState title="Project not found" hint="It may have been deleted." action={<Button onClick={() => navigate('/projects')}>Back to Projects</Button>} /></Card>
  }

  const supName = (sid: string) => suppliers.find((s) => s.id === sid)?.name ?? '—'
  const linkedSuppliers = links.map((l) => suppliers.find((s) => s.id === l.supplierId)).filter((s): s is Supplier => !!s)
  const unlinked = suppliers.filter((s) => !links.some((l) => l.supplierId === s.id))
  const run = async (fn: () => Promise<void>) => { try { setError(''); await fn() } catch (e) { setError(errorMessage(e)) } }
  const count = (t: Tab) => ({
    'Deliverables & Commercial': workstreams.length,
    Tasks: tasks.length,
    Suppliers: linkedSuppliers.length,
    Milestones: milestones.length,
  })[t as string]

  const archived = isArchivedStatus(p.status)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Link to={archived ? '/archived' : '/projects'} className="mt-1 text-slate-400 hover:text-slate-700" aria-label={archived ? 'Back to archived' : 'Back to projects'}><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">HRS {p.code}{p.deviceName ? ` · ${p.deviceName}` : ''}</h2>
            <Badge color="blue">{p.hwType || 'FT'}</Badge>
            <Badge>{p.status}</Badge>
            {archived && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                <Archive className="h-3 w-3" /> Archived
              </span>
            )}
          </div>
          {p.atePlatform && <p className="text-sm text-slate-500">ATE Platform: {p.atePlatform}</p>}
        </div>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => run(() => exportSingleProjectReport(p.id))}>
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export to Excel
          </Button>
          {!archived && <Button onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
          <Button onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4 text-red-500" /> Delete</Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-primary text-primary font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t}{count(t) !== undefined && <span className="ml-1.5 text-xs text-slate-400">{count(t)}</span>}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="space-y-3">
          {/* Compact, attractive executive summary ribbon */}
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500" />
            <div className="p-3 space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {/* 1. HRS & HW Type */}
                <div className="rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-2">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                    <span>HRS / HW Type</span>
                    <Layers className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900">{p.code}</span>
                    <Badge color="blue">{p.hwType || 'FT'}</Badge>
                  </div>
                </div>

                {/* 2. Device Name */}
                <div className="rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-2 min-w-0">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                    <span>Device Name</span>
                    <Cpu className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-800 truncate" title={p.deviceName || '—'}>
                    {p.deviceName || '—'}
                  </div>
                </div>

                {/* 3. ATE Platform */}
                <div className="rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-2 min-w-0">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                    <span>ATE Platform</span>
                    <Server className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-800 truncate" title={p.atePlatform || '—'}>
                    {p.atePlatform || '—'}
                  </div>
                </div>

                {/* 4. Schedule (Start → HW Required) */}
                <div className="rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-2">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                    <span>Start → HW Required</span>
                    <Calendar className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-800 whitespace-nowrap">
                    {formatDate(p.startDate)} → <span className="text-primary">{formatDate(p.baselineDate)}</span>
                  </div>
                </div>

                {/* 5. Breakdown Counts */}
                <div className="rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-2">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                    <span>Items Tracked</span>
                    <GitBranch className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                    <span>{workstreams.length} Deliv</span>
                    <span className="text-slate-300">·</span>
                    <span>{tasks.length} Tasks</span>
                    <span className="text-slate-300">·</span>
                    <span>{milestones.length} MS</span>
                  </div>
                </div>
              </div>

              {/* Compact single-line description & deadline indicator */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-3 py-1.5 text-xs border border-slate-100">
                <div className="min-w-0 flex-1 text-slate-600">
                  <span className="font-semibold text-slate-700 mr-1.5">Description:</span>
                  <span>{p.description || 'No description provided.'}</span>
                </div>
                {p.baselineDate && !archived && (
                  <span className="shrink-0">
                    {daysUntil(p.baselineDate) < 0 ? (
                      <Badge color="red">Overdue by {-daysUntil(p.baselineDate)}d</Badge>
                    ) : (
                      <Badge color="green">{daysUntil(p.baselineDate)}d until HW Required</Badge>
                    )}
                  </span>
                )}
              </div>
            </div>
          </section>

          <Card title={`NPI / HRS ${p.code} Master Gantt Chart`}>
            <ProjectGanttChart
              project={p}
              workstreams={workstreams}
              commercialRows={commercialRows}
              milestones={milestones}
              tasks={tasks}
            />
          </Card>
        </div>
      )}

      {tab === 'Deliverables & Commercial' && (
        <Card
          title={`Deliverables & Commercial Tracking (Branches of HRS ${p.code})`}
          action={
            !archived ? (
              <Button size="sm" variant="primary" onClick={() => { setWsEditing(undefined); setWsOpen(true) }}>
                <Plus className="h-3.5 w-3.5" /> Add Deliverable
              </Button>
            ) : undefined
          }
        >
          {workstreams.length === 0 ? (
            <EmptyState title="No deliverables yet" hint="Add PCB, Socket, Handler Kit, Stiffener, Probe Card, Probe Head, or Others deliverables for this project." />
          ) : (
            <Table head={['Deliverable Branch', 'MPN', 'Supplier', 'Delivery Dates', 'Hardware Status (Quote · PET · PO)', 'Remarks', ...(archived ? [] : ['Actions'])]}>
              {workstreams.map((w, idx) => {
                const isLast = idx === workstreams.length - 1
                const comm = commercialRows.find((r) => r.workstream.id === w.id)
                const q = comm?.quotation
                const pet = comm?.pet
                const po = comm?.po
                const hwStatus = normalizeHardwareStatus(po)
                const late = po && !po.actualDelivery && isPast(po.expectedDelivery) && hwStatus !== 'Delivered'
                return (
                  <tr key={w.id}>
                    <td className="font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-slate-400 font-bold">{isLast ? '└─' : '├─'}</span>
                        <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{deliverableDisplayName(w)}</span>
                      </span>
                    </td>
                    <td className="font-mono text-xs text-slate-600 whitespace-nowrap">{w.mpn || '—'}</td>
                    <td>{supName(w.supplierId)}</td>
                    <td className="whitespace-nowrap text-xs">
                      {po && (po.expectedDelivery || po.actualDelivery) ? (
                        <div className={late ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                          Exp: {formatDate(po.expectedDelivery)}
                          {po.actualDelivery && <span className="block text-[11px] text-emerald-700">Act: {formatDate(po.actualDelivery)}</span>}
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      {archived ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {q?.number && <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-900"><b>Quote:</b> {q.number}</span>}
                          {pet?.reference && <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-900"><b>PET:</b> {pet.reference}</span>}
                          {po?.number && <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-900"><b>PO:</b> {po.number}</span>}
                          <CommercialBadge status={hwStatus} />
                        </div>
                      ) : (
                        <InlineCommercialCell workstream={w} comm={comm} onError={setError} />
                      )}
                    </td>
                    <td className="text-slate-500 max-w-xs truncate">{w.remarks || po?.remarks || '—'}</td>
                    {!archived && (
                      <td>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="!h-7 !px-2 text-[11px]"
                            title="View & manage tasks for this deliverable"
                            onClick={() => setWsTasksTarget(w)}
                          >
                            <ListChecks className="h-3.5 w-3.5 text-primary" />
                            Tasks ({tasks.filter((t) => t.workstreamId === w.id).length})
                          </Button>
                          <Button variant="ghost" size="sm" title="Edit Deliverable & Commercial" onClick={() => { setWsEditing(w); setWsOpen(true) }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" aria-label="Delete deliverable" onClick={() => setWsDeleting(w)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </Table>
          )}
        </Card>
      )}

      {tab === 'Tasks' && (
        <Card title="Tasks" className="[&>div]:!p-0" action={<Button size="sm" variant="primary" onClick={() => { setTaskEditing(undefined); setTaskOpen(true) }}><Plus className="h-3.5 w-3.5" /> Add Task</Button>}>
          {tasks.length === 0 ? <EmptyState title="No tasks for this project" hint="Add a task to start tracking work." /> : (
            <TaskTable tasks={[...tasks].sort((x, y) => (x.dueDate || '9999').localeCompare(y.dueDate || '9999'))} projects={[p]} workstreams={workstreams} suppliers={suppliers} showProject={false}
              onEdit={(t) => { setTaskEditing(t); setTaskOpen(true) }} onDelete={setTaskDeleting} />
          )}
        </Card>
      )}

      {tab === 'Suppliers' && (
        <Card title="Suppliers on this project" action={
          <div className="flex gap-2">
            <Select className="!w-52 !py-1 text-xs" value={linkId} onChange={(e) => setLinkId(e.target.value)}
              options={[{ value: '', label: unlinked.length ? 'Select supplier…' : 'All suppliers assigned' }, ...unlinked.map((s) => ({ value: s.id, label: s.name }))]} />
            <Button size="sm" variant="primary" disabled={!linkId} onClick={() => run(async () => { await linkSupplierToProject(p.id, linkId); setLinkId('') })}>Assign</Button>
          </div>}>
          {linkedSuppliers.length === 0 ? <EmptyState title="No suppliers assigned" hint="Use the dropdown above to assign a supplier from your directory." /> : (
            <Table head={['Supplier', 'Category', 'Contact', 'Deliverables', '']}>
              {linkedSuppliers.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td><td className="text-slate-500">{s.category}</td><td>{s.contactPerson}</td>
                  <td>{workstreams.filter((w) => w.supplierId === s.id).map((w) => deliverableDisplayName(w)).join(', ') || '—'}</td>
                  <td><Button variant="ghost" size="sm" aria-label="Remove supplier" onClick={() => run(() => unlinkSupplierFromProject(p.id, s.id))}><X className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === 'Milestones' && (
        <Card title="Milestones" className="[&>div]:!p-0" action={<Button size="sm" variant="primary" onClick={() => { setMsEditing(undefined); setMsOpen(true) }}><Plus className="h-3.5 w-3.5" /> Add Milestone</Button>}>
          {milestones.length === 0 ? <EmptyState title="No milestones" hint="Add milestones such as Tape Out Date or Drawing Approval Cut-off." /> : (
            <MilestoneTable milestones={[...milestones].sort((x, y) => x.targetDate.localeCompare(y.targetDate))} projects={[p]} showProject={false}
              onEdit={(m) => { setMsEditing(m); setMsOpen(true) }} onDelete={setMsDeleting} />
          )}
        </Card>
      )}

      {tab === 'Activity History' && (
        <Card title="Activity History">
          {logs.length === 0 ? <EmptyState title="No activity yet" /> : (
            <ul className="divide-y divide-slate-100">
              {[...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <Badge color={l.action === 'Deleted' ? 'red' : l.action === 'Status Changed' ? 'blue' : 'grey'}>{l.action}</Badge>
                    <Badge color="violet">{l.entity === 'Workstream' ? 'Deliverable' : l.entity}</Badge>
                    <span className="truncate">{l.message}</span>
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{formatDateTime(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <TaskForm open={taskOpen} task={taskEditing} defaultProjectId={p.id} onClose={() => setTaskOpen(false)} />
      <MilestoneForm open={msOpen} milestone={msEditing} defaultProjectId={p.id} onClose={() => setMsOpen(false)} />
      <ConfirmDialog open={!!taskDeleting} title="Delete task?" onCancel={() => setTaskDeleting(undefined)}
        onConfirm={() => run(async () => { await deleteTask(taskDeleting!.id); setTaskDeleting(undefined) })}
        message={<>Delete <b>{taskDeleting?.name}</b>?</>} />
      <ConfirmDialog open={!!msDeleting} title="Delete milestone?" onCancel={() => setMsDeleting(undefined)}
        onConfirm={() => run(async () => { await deleteMilestone(msDeleting!.id); setMsDeleting(undefined) })}
        message={<>Delete milestone <b>{msDeleting?.name}</b>?</>} />
      <ProjectForm open={editOpen} project={p} onClose={() => setEditOpen(false)} />
      <WorkstreamForm open={wsOpen} projectId={p.id} workstream={wsEditing} suppliers={suppliers} onClose={() => setWsOpen(false)} />
      <DeliverableTasksModal open={!!wsTasksTarget} workstream={wsTasksTarget} project={p} onClose={() => setWsTasksTarget(undefined)} />
      <ConfirmDialog open={!!wsDeleting} title="Delete deliverable?" onCancel={() => setWsDeleting(undefined)}
        onConfirm={() => run(async () => { await deleteWorkstream(wsDeleting!.id); setWsDeleting(undefined) })}
        message={<>Delete deliverable <b>{wsDeleting ? deliverableDisplayName(wsDeleting) : ''}</b>? Tasks and milestones linked to it are kept but no longer assigned to a deliverable.</>} />
      <ConfirmDialog open={deleteOpen} title="Delete project?" onCancel={() => setDeleteOpen(false)}
        onConfirm={() => run(async () => { await deleteProject(p.id); navigate(archived ? '/archived' : '/projects') })}
        message={<>This permanently deletes <b>HRS {p.code}</b> and everything linked to it. This cannot be undone.</>} />
    </div>
  )
}
