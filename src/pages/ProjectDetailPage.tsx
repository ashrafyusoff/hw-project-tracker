import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, GitBranch, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react'
import { db } from '@/database/db'
import type { Milestone, Supplier, Task, Workstream } from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Loading, ProgressBar, Select } from '@/components/ui'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { WorkstreamForm } from '@/features/projects/WorkstreamForm'
import { TaskForm } from '@/features/tasks/TaskForm'
import { MilestoneForm } from '@/features/tasks/MilestoneForm'
import { TaskTable } from '@/features/tasks/TaskTable'
import { MilestoneTable } from '@/features/tasks/MilestoneTable'
import {
  CommercialBadge,
  DeliverableCommercialModal,
  UnifiedCommercialTable,
  buildDeliverableCommercialRows,
  rowToCommercialInput,
} from '@/features/commercial/CommercialForms'
import type { DeliverableCommercialInput } from '@/services/commercialService'
import { deleteTask } from '@/services/taskService'
import { deleteMilestone } from '@/services/milestoneService'
import { deleteProject } from '@/services/projectService'
import { deleteWorkstream } from '@/services/workstreamService'
import { linkSupplierToProject, unlinkSupplierFromProject } from '@/services/supplierService'
import { formatDate, formatDateTime } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

const TABS = ['Overview', 'Deliverables', 'Commercial', 'Tasks', 'Suppliers', 'Milestones', 'Activity History'] as const
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

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const data = useProjectData(id)
  const [tab, setTab] = useState<Tab>('Overview')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [wsOpen, setWsOpen] = useState(false)
  const [wsEditing, setWsEditing] = useState<Workstream | undefined>()
  const [wsDeleting, setWsDeleting] = useState<Workstream | undefined>()
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskEditing, setTaskEditing] = useState<Task | undefined>()
  const [taskDeleting, setTaskDeleting] = useState<Task | undefined>()
  const [msOpen, setMsOpen] = useState(false)
  const [msEditing, setMsEditing] = useState<Milestone | undefined>()
  const [msDeleting, setMsDeleting] = useState<Milestone | undefined>()

  const [commOpen, setCommOpen] = useState(false)
  const [commInitial, setCommInitial] = useState<DeliverableCommercialInput | undefined>()
  const [commDefaultWs, setCommDefaultWs] = useState('')

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
    Deliverables: workstreams.length,
    Commercial: commercialRows.length,
    Tasks: tasks.length,
    Suppliers: linkedSuppliers.length,
    Milestones: milestones.length,
  })[t as string]

  const Field = ({ label, value }: { label: string; value: ReactNode }) => (
    <div><dt className="text-xs text-slate-500">{label}</dt><dd className="text-sm mt-0.5">{value || '—'}</dd></div>
  )

  function openCommercialForDeliverable(ws: Workstream) {
    const row = commercialRows.find((r) => r.workstream.id === ws.id)
    if (row) {
      setCommInitial(rowToCommercialInput(row))
    } else {
      setCommInitial(undefined)
      setCommDefaultWs(ws.id)
    }
    setCommOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Link to="/projects" className="mt-1 text-slate-400 hover:text-slate-700" aria-label="Back to projects"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{p.code} · {p.name}</h2><Badge>{p.status}</Badge><Badge>{p.priority}</Badge></div>
          <p className="text-sm text-slate-500">{p.deviceName}{p.atePlatform && ` · ${p.atePlatform}`}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>
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
        <Card>
          <div className="mb-4 max-w-sm"><p className="text-xs text-slate-500 mb-1">Overall progress</p><ProgressBar value={p.progress} /></div>
          <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Start Date" value={formatDate(p.startDate)} />
            <Field label="Baseline Completion" value={formatDate(p.baselineDate)} />
            <Field label="Revised Completion" value={formatDate(p.revisedDate)} />
            <Field label="Actual Completion" value={formatDate(p.actualDate)} />
          </dl>
          <dl className="grid gap-4 mt-4">
            <Field label="Description" value={p.description} />
            <Field label="Objectives" value={p.objectives} />
            <Field label="Remarks" value={p.remarks} />
          </dl>
        </Card>
      )}

      {tab === 'Deliverables' && (
        <Card
          title={`Project Deliverables (Branches of ${p.code})`}
          action={
            <Button size="sm" variant="primary" onClick={() => { setWsEditing(undefined); setWsOpen(true) }}>
              <Plus className="h-3.5 w-3.5" /> Add Deliverable
            </Button>
          }
        >
          {workstreams.length === 0 ? (
            <EmptyState title="No deliverables yet" hint="Add PCB, test socket or handler kit deliverables as sub-items for this project." />
          ) : (
            <Table head={['Deliverable Branch', 'Category', 'Supplier', 'Status', 'Progress', 'Start', 'Target', 'Actual', 'Commercial Pipeline', '']}>
              {workstreams.map((w, idx) => {
                const isLast = idx === workstreams.length - 1
                const comm = commercialRows.find((r) => r.workstream.id === w.id)
                const q = comm?.quotation
                const pet = comm?.pet
                const po = comm?.po
                return (
                  <tr key={w.id}>
                    <td className="font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-slate-400 font-bold">{isLast ? '└─' : '├─'}</span>
                        <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{w.name}</span>
                      </span>
                    </td>
                    <td className="text-slate-500">{w.category}</td>
                    <td>{supName(w.supplierId)}</td>
                    <td><Badge>{w.status}</Badge></td>
                    <td className="w-36"><ProgressBar value={w.progress} /></td>
                    <td className="whitespace-nowrap">{formatDate(w.startDate)}</td>
                    <td className="whitespace-nowrap">{formatDate(w.targetDate)}</td>
                    <td className="whitespace-nowrap">{formatDate(w.actualDate)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        {q ? <Badge color="blue">Quote: {q.number}</Badge> : <span className="text-slate-400">Quote: —</span>}
                        {pet ? <Badge color="violet">PET: {pet.reference}</Badge> : <span className="text-slate-400">· PET: —</span>}
                        {po ? <CommercialBadge status={po.deliveryStatus || po.status} /> : <span className="text-slate-400">· PO: —</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" title="Edit Deliverable Commercial" onClick={() => openCommercialForDeliverable(w)}>
                          <Wallet className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button variant="ghost" size="sm" aria-label="Edit deliverable" onClick={() => { setWsEditing(w); setWsOpen(true) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" aria-label="Delete deliverable" onClick={() => setWsDeleting(w)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
        </Card>
      )}

      {tab === 'Commercial' && (
        <Card
          title="Deliverable Commercial & Delivery Tracking (Quotation · PET · PO · Delivery)"
          className="[&>div]:!p-0"
          action={
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setCommInitial(undefined)
                setCommDefaultWs(workstreams[0]?.id ?? '')
                setCommOpen(true)
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Update Commercial
            </Button>
          }
        >
          <UnifiedCommercialTable
            rows={commercialRows}
            showProject={false}
            onEditRow={(r) => {
              setCommInitial(rowToCommercialInput(r))
              setCommOpen(true)
            }}
            onAddCommercial={() => {
              setCommInitial(undefined)
              setCommDefaultWs(workstreams[0]?.id ?? '')
              setCommOpen(true)
            }}
          />
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
                  <td>{workstreams.filter((w) => w.supplierId === s.id).map((w) => w.name).join(', ') || '—'}</td>
                  <td><Button variant="ghost" size="sm" aria-label="Remove supplier" onClick={() => run(() => unlinkSupplierFromProject(p.id, s.id))}><X className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === 'Milestones' && (
        <Card title="Milestones" className="[&>div]:!p-0" action={<Button size="sm" variant="primary" onClick={() => { setMsEditing(undefined); setMsOpen(true) }}><Plus className="h-3.5 w-3.5" /> Add Milestone</Button>}>
          {milestones.length === 0 ? <EmptyState title="No milestones" hint="Add milestones such as Design Freeze or Hardware Delivery." /> : (
            <MilestoneTable milestones={[...milestones].sort((x, y) => x.targetDate.localeCompare(y.targetDate))} projects={[p]} workstreams={workstreams} showProject={false}
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

      <DeliverableCommercialModal
        open={commOpen}
        initial={commInitial}
        defaultProjectId={p.id}
        defaultWorkstreamId={commDefaultWs}
        onClose={() => setCommOpen(false)}
      />
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
      <ConfirmDialog open={!!wsDeleting} title="Delete deliverable?" onCancel={() => setWsDeleting(undefined)}
        onConfirm={() => run(async () => { await deleteWorkstream(wsDeleting!.id); setWsDeleting(undefined) })}
        message={<>Delete deliverable <b>{wsDeleting?.name}</b>? Tasks and milestones linked to it are kept but no longer assigned to a deliverable.</>} />
      <ConfirmDialog open={deleteOpen} title="Delete project?" onCancel={() => setDeleteOpen(false)}
        onConfirm={() => run(async () => { await deleteProject(p.id); navigate('/projects') })}
        message={<>This permanently deletes <b>{p.code} – {p.name}</b> and everything linked to it. This cannot be undone.</>} />
    </div>
  )
}
