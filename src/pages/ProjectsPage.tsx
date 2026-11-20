import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Archive, CheckSquare, ChevronDown, ChevronRight, CornerDownRight, FileSpreadsheet, GitBranch, GripVertical, Layers, ListChecks, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import { useSmoothDrag } from '@/hooks/useSmoothDrag'
import {
  ACTIVE_PROJECT_STATUSES,
  HARDWARE_STATUSES,
  HW_TYPES,
  MILESTONE_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
  TASK_STATUSES,
  isArchivedProject,
  type Milestone,
  type MilestoneStatus,
  type PetRecord,
  type PoRecord,
  type Priority,
  type Project,
  type ProjectStatus,
  type Quotation,
  type Supplier,
  type Task,
  type TaskStatus,
  type Workstream,
} from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loading, Select } from '@/components/ui'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { WorkstreamForm } from '@/features/projects/WorkstreamForm'
import { TaskForm } from '@/features/tasks/TaskForm'
import { MilestoneForm } from '@/features/tasks/MilestoneForm'
import { DeadlineBadge, isOverdueTask } from '@/features/tasks/TaskTable'
import {
  CommercialBadge,
  buildDeliverableCommercialRows,
  normalizeHardwareStatus,
  rowToCommercialInput,
  type DeliverableCommercialRow,
} from '@/features/commercial/CommercialForms'
import { saveDeliverableCommercial, emptyDeliverableCommercial } from '@/services/commercialService'
import { createTasksFromDeliverableTemplate } from '@/services/deliverableTemplateService'
import { exportSingleProjectReport } from '@/services/exportService'
import { archiveProject, deleteProject, updateProject } from '@/services/projectService'
import { deleteWorkstream } from '@/services/workstreamService'
import { deleteTask, updateTask } from '@/services/taskService'
import { deleteMilestone, updateMilestone } from '@/services/milestoneService'
import { cn, formatDate, isPast, todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { notify } from '@/services/toastService'

const EXPANDED_DELIV_TASKS_KEY = 'npi.projects.expandedDeliverableTasks'
const EXPANDED_PROJ_TASKS_KEY = 'npi.projects.expandedProjectTasks'
const PROJECT_ORDER_KEY = 'npi.projects.buttonOrder'
const SELECTED_PROJECT_KEY = 'npi.projects.selectedId'

export const PROJECT_BUTTON_STYLE: Record<ProjectStatus, { pill: string; dot: string }> = {
  Planning: {
    pill: 'border-violet-400 bg-violet-50 text-violet-900 hover:bg-violet-100',
    dot: 'bg-violet-500',
  },
  'In Progress': {
    pill: 'border-blue-400 bg-blue-50 text-blue-900 hover:bg-blue-100',
    dot: 'bg-blue-500',
  },
  'In Validation': {
    pill: 'border-cyan-400 bg-cyan-100/90 text-cyan-950 hover:bg-cyan-200/80',
    dot: 'bg-cyan-500',
  },
  'On Hold': {
    pill: 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100',
    dot: 'bg-amber-500',
  },
  Delayed: {
    pill: 'border-red-400 bg-red-50 text-red-900 hover:bg-red-100',
    dot: 'bg-red-500',
  },
  Completed: {
    pill: 'border-emerald-400 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
    dot: 'bg-emerald-500',
  },
  Cancelled: {
    pill: 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200',
    dot: 'bg-slate-400',
  },
}

export function ProjectsPage() {
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')
  const tasks = useTable<Task>('tasks')
  const milestones = useTable<Milestone>('milestones')
  const suppliers = useTable<Supplier>('suppliers')
  const quotations = useTable<Quotation>('quotations')
  const pets = useTable<PetRecord>('petRecords')
  const pos = useTable<PoRecord>('poRecords')

  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = usePersistedState<string>('npi.projects.search', '')
  const [hwType, setHwType] = usePersistedState<string>('npi.projects.hwType', '')
  const [status, setStatus] = usePersistedState<string>('npi.projects.status', '')

  // Persist user's left-to-right project button order & selected project across reloads
  const [projectOrder, setProjectOrder] = usePersistedState<string[]>(PROJECT_ORDER_KEY, [])
  const [selectedProjectId, setSelectedProjectId] = usePersistedState<string>(SELECTED_PROJECT_KEY, '')
  const projStripRef = useRef<HTMLDivElement>(null)

  // Persist expand/collapse memory across tab switches & reloads
  const [expandedDelivTasks, setExpandedDelivTasks] = usePersistedState<Record<string, boolean>>(EXPANDED_DELIV_TASKS_KEY, {})
  const [expandedProjTasks, setExpandedProjTasks] = usePersistedState<Record<string, boolean>>(EXPANDED_PROJ_TASKS_KEY, {})

  // Modals for Project and Deliverable + Commercial (combined)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | undefined>()
  const [deleting, setDeleting] = useState<Project | undefined>()
  const [archivingProject, setArchivingProject] = useState<Project | undefined>()

  const [wsOpen, setWsOpen] = useState(false)
  const [wsProjectId, setWsProjectId] = useState('')
  const [wsEditing, setWsEditing] = useState<Workstream | undefined>()
  const [wsDeleting, setWsDeleting] = useState<Workstream | undefined>()

  // Left dual-island slide-over drawer for Add / Edit Task & Milestone
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskEditing, setTaskEditing] = useState<Task | undefined>()
  const [taskDeleting, setTaskDeleting] = useState<Task | undefined>()
  const [taskProjectId, setTaskProjectId] = useState('')
  const [taskWorkstreamId, setTaskWorkstreamId] = useState('')

  const [msOpen, setMsOpen] = useState(false)
  const [msEditing, setMsEditing] = useState<Milestone | undefined>()
  const [msDeleting, setMsDeleting] = useState<Milestone | undefined>()

  const setError = (m: string) => { if (m) notify(m, 'err') }

  // "Quick Add → New Project" arrives here with ?new=1; "?project=ID" selects that project button
  useEffect(() => {
    if (params.get('new')) {
      setEditing(undefined)
      setFormOpen(true)
      setParams({}, { replace: true })
    } else if (params.get('project')) {
      setSelectedProjectId(params.get('project') || '')
      setParams({}, { replace: true })
    }
  }, [params, setParams, setSelectedProjectId])

  const commercialRows = useMemo(() => {
    if (!workstreams || !quotations || !pets || !pos || !projects || !suppliers) return []
    return buildDeliverableCommercialRows(workstreams, quotations, pets, pos, projects, suppliers)
  }, [workstreams, quotations, pets, pos, projects, suppliers])

  const commByDeliverable = useMemo(() => {
    const map = new Map<string, DeliverableCommercialRow>()
    for (const r of commercialRows) map.set(r.workstream.id, r)
    return map
  }, [commercialRows])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const orderMap = new Map(projectOrder.map((id, idx) => [id, idx]))
    return (projects ?? [])
      .filter((p) => !p.isNonNpi)
      .filter((p) => !isArchivedProject(p))
      .filter((p) => !hwType || (p.hwType || 'FT') === hwType)
      .filter((p) => !status || p.status === status)
      .filter((p) => {
        if (!q) return true
        const pDeliverables = (workstreams ?? []).filter((w) => w.projectId === p.id)
        const delivText = pDeliverables
          .map((w) => {
            const c = commByDeliverable.get(w.id)
            return `${w.name} ${w.category} ${w.mpn ?? ''} ${c?.supplierName ?? ''} ${c?.quotation?.number ?? ''} ${c?.pet?.reference ?? ''} ${c?.po?.number ?? ''}`
          })
          .join(' ')
        return `${p.code} ${p.hwType ?? 'FT'} ${p.deviceName} ${p.description} ${delivText}`.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        const ia = orderMap.get(a.id) ?? 99999
        const ib = orderMap.get(b.id) ?? 99999
        if (ia !== ib) return ia - ib
        return a.code.localeCompare(b.code)
      })
  }, [projects, workstreams, commByDeliverable, search, hwType, status, projectOrder])

  const activeProject = useMemo(() => {
    if (rows.length === 0) return undefined
    return rows.find((p) => p.id === selectedProjectId) ?? rows[0]
  }, [rows, selectedProjectId])

  const {
    draggingId: draggingProjId,
    setItemRef: setProjBtnRef,
    onPointerDown: handleProjPointerDown,
    onPointerMove: handleProjPointerMove,
    onPointerEnd: handleProjPointerEnd,
  } = useSmoothDrag<HTMLButtonElement>({
    ids: rows.map((p) => p.id),
    axis: 'horizontal',
    activationDistance: 6,
    scrollContainerRef: projStripRef,
    onClickItem: (id) => setSelectedProjectId(id),
    onReorder: (fromIdx, toIdx) => {
      const currentIds = rows.map((p) => p.id)
      const next = [...currentIds]
      const [moved] = next.splice(fromIdx, 1)
      if (!moved) return
      next.splice(toIdx, 0, moved)
      const remaining = projectOrder.filter((id) => !next.includes(id))
      setProjectOrder([...next, ...remaining])
    },
  })

  async function confirmDelete() {
    if (!deleting) return
    try { await deleteProject(deleting.id); setDeleting(undefined) } catch (e) { setError(errorMessage(e)); setDeleting(undefined) }
  }

  async function confirmArchiveProject() {
    if (!archivingProject) return
    try {
      await archiveProject(archivingProject.id)
      setArchivingProject(undefined)
    } catch (e) {
      setError(errorMessage(e))
      setArchivingProject(undefined)
    }
  }

  async function confirmDeleteDeliverable() {
    if (!wsDeleting) return
    try { await deleteWorkstream(wsDeleting.id); setWsDeleting(undefined) } catch (e) { setError(errorMessage(e)); setWsDeleting(undefined) }
  }

  if (!projects || !workstreams || !suppliers || !quotations || !pets || !pos) return <Loading />

  return (
    <div className="space-y-4">
      {/* Filters & Action Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search HRS, device, deliverable, MPN, PO…" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-72" />
        <Select className="!w-36" value={hwType} onChange={(e) => setHwType(e.target.value)} options={[{ value: '', label: 'All HW types' }, ...HW_TYPES]} />
        <Select className="!w-40" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'All statuses' }, ...ACTIVE_PROJECT_STATUSES]} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              setTaskEditing(undefined)
              setTaskProjectId(activeProject?.id ?? '')
              setTaskWorkstreamId('')
              setTaskOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Add Task
          </Button>
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }}>
            <Plus className="h-4 w-4" /> Create Project
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="!p-0">
          <EmptyState
            title={projects.length === 0 ? 'No projects yet' : 'No projects match your filters'}
            hint={projects.length === 0 ? 'Click "Create Project" to add your first one.' : 'Try clearing the search or filters.'}
          />
        </Card>
      ) : (
        <>
          {/* Horizontal Project Capsule Buttons (Single Row, Expands Right & Slides Horizontally, Fluid Drag) */}
          <Card
            title={`Available Projects (${rows.length})`}
            action={
              <span className="text-[11px] text-slate-400">
                Click to select · Hold & drag left/right to arrange · Scroll or slide horizontally
              </span>
            }
          >
            <div
              ref={projStripRef}
              className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 px-0.5"
            >
              {rows.map((p) => {
                const isSelected = activeProject?.id === p.id
                const style = PROJECT_BUTTON_STYLE[p.status] ?? PROJECT_BUTTON_STYLE.Planning
                const label = `${p.code}${p.deviceName ? ` · ${p.deviceName}` : ''}`
                return (
                  <button
                    key={p.id}
                    ref={setProjBtnRef(p.id)}
                    type="button"
                    onPointerDown={(e) => handleProjPointerDown(e, p.id)}
                    onPointerMove={handleProjPointerMove}
                    onPointerUp={(e) => handleProjPointerEnd(e, p.id)}
                    onPointerCancel={(e) => handleProjPointerEnd(e, p.id)}
                    style={{ touchAction: 'none' }}
                    title={`HRS ${label}\nStatus: ${p.status} · HW Type: ${p.hwType || 'FT'}${p.baselineDate ? ` · HW Required: ${formatDate(p.baselineDate)}` : ''}\nClick to select · Drag left/right to rearrange`}
                    className={cn(
                      'group relative inline-flex h-9 w-52 shrink-0 items-center justify-between gap-1.5 rounded-full border px-3 text-xs font-semibold select-none cursor-pointer',
                      style.pill,
                      isSelected && 'ring-2 ring-primary ring-offset-1 shadow-md',
                      draggingProjId === p.id && 'shadow-xl ring-2 ring-primary cursor-grabbing',
                    )}
                  >
                    <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-40 group-hover:opacity-80 cursor-grab active:cursor-grabbing" />
                    <span className={cn('h-2 w-2 rounded-full shrink-0', style.dot)} />
                    <span className="truncate flex-1 text-left">{label}</span>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Active Selected Project Workspace (Clean Card Hierarchy — No Cramped Table) */}
          {activeProject && (
            <ProjectWithDeliverablesGroup
              key={activeProject.id}
              project={activeProject}
              deliverables={workstreams.filter((w) => w.projectId === activeProject.id)}
              tasks={(tasks ?? []).filter((t) => t.projectId === activeProject.id)}
              milestones={(milestones ?? []).filter((m) => m.projectId === activeProject.id)}
              commByDeliverable={commByDeliverable}
              projTasksExpanded={!!expandedProjTasks[activeProject.id]}
              onToggleProjTasks={() =>
                setExpandedProjTasks((prev) => ({ ...prev, [activeProject.id]: !prev[activeProject.id] }))
              }
              expandedDelivTasks={expandedDelivTasks}
              onToggleDeliverableTasks={(wId) =>
                setExpandedDelivTasks((prev) => ({ ...prev, [wId]: !prev[wId] }))
              }
              onNavigate={() => navigate(`/projects/${activeProject.id}`)}
              onEditProject={() => { setEditing(activeProject); setFormOpen(true) }}
              onDeleteProject={() => setDeleting(activeProject)}
              onExportExcel={() => void exportSingleProjectReport(activeProject.id)}
              onRequestArchive={() => setArchivingProject(activeProject)}
              onAddDeliverable={() => { setWsProjectId(activeProject.id); setWsEditing(undefined); setWsOpen(true) }}
              onEditDeliverable={(w) => { setWsProjectId(activeProject.id); setWsEditing(w); setWsOpen(true) }}
              onDeleteDeliverable={(w) => setWsDeleting(w)}
              onAddTask={(w) => {
                setTaskEditing(undefined)
                setTaskProjectId(activeProject.id)
                setTaskWorkstreamId(w?.id ?? '')
                setTaskOpen(true)
              }}
              onEditTask={(t) => {
                setTaskEditing(t)
                setTaskProjectId(t.projectId)
                setTaskWorkstreamId(t.workstreamId)
                setTaskOpen(true)
              }}
              onDeleteTask={(t) => setTaskDeleting(t)}
              onEditMilestone={(m) => {
                setMsEditing(m)
                setMsOpen(true)
              }}
              onDeleteMilestone={(m) => setMsDeleting(m)}
              onError={(msg) => setError(msg)}
            />
          )}
        </>
      )}

      <ProjectForm open={formOpen} project={editing} onClose={() => setFormOpen(false)} />
      <WorkstreamForm open={wsOpen} projectId={wsProjectId} workstream={wsEditing} suppliers={suppliers} onClose={() => setWsOpen(false)} />
      <TaskForm
        open={taskOpen}
        task={taskEditing}
        defaultProjectId={taskProjectId || undefined}
        defaultWorkstreamId={taskWorkstreamId || undefined}
        onClose={() => { setTaskOpen(false); setTaskEditing(undefined) }}
      />
      <MilestoneForm
        open={msOpen}
        milestone={msEditing}
        onClose={() => { setMsOpen(false); setMsEditing(undefined) }}
      />

      <ConfirmDialog
        open={!!taskDeleting}
        title="Delete task?"
        onCancel={() => setTaskDeleting(undefined)}
        onConfirm={async () => {
          if (!taskDeleting) return
          try { await deleteTask(taskDeleting.id); setTaskDeleting(undefined) } catch (e) { setError(errorMessage(e)); setTaskDeleting(undefined) }
        }}
        message={<>Delete task <b>{taskDeleting?.name}</b>?</>}
      />
      <ConfirmDialog
        open={!!msDeleting}
        title="Delete milestone?"
        onCancel={() => setMsDeleting(undefined)}
        onConfirm={async () => {
          if (!msDeleting) return
          try { await deleteMilestone(msDeleting.id); setMsDeleting(undefined) } catch (e) { setError(errorMessage(e)); setMsDeleting(undefined) }
        }}
        message={<>Delete milestone <b>{msDeleting?.name}</b>?</>}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Delete project?"
        onCancel={() => setDeleting(undefined)}
        onConfirm={confirmDelete}
        message={<>This permanently deletes <b>HRS {deleting?.code}</b> and everything linked to it (deliverables, tasks, milestones, commercial records, and history). This cannot be undone.</>}
      />
      <ConfirmDialog
        open={!!wsDeleting}
        title="Delete deliverable?"
        onCancel={() => setWsDeleting(undefined)}
        onConfirm={confirmDeleteDeliverable}
        message={<>Delete deliverable <b>{wsDeleting?.name || wsDeleting?.category}</b>? Linked commercial records will be removed, and tasks/milestones will be detached from this deliverable.</>}
      />
      <ConfirmDialog
        open={!!archivingProject}
        title={`Archive HRS ${archivingProject?.code ?? ''}?`}
        confirmLabel="Confirm & Archive"
        onCancel={() => setArchivingProject(undefined)}
        onConfirm={confirmArchiveProject}
        message={
          <>
            Move <b>HRS {archivingProject?.code}{archivingProject?.deviceName ? ` · ${archivingProject.deviceName}` : ''}</b> and all its deliverables, tasks, and milestones to the <b>Archived</b> tab? <b>This action cannot be undone.</b>
          </>
        }
      />
    </div>
  )
}

function deliverableDisplayName(w: Workstream) {
  if (w.category === 'Others' && w.name && w.name !== 'Others') return `Others (${w.name})`
  return w.name || w.category
}

/**
 * Inline hover/click Status selector (renders Badge, opens native select on click/hover).
 */
export function InlineStatusSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly string[]
  onChange: (next: string) => void
}) {
  return (
    <div
      className="relative inline-flex items-center group/status cursor-pointer rounded hover:ring-2 hover:ring-primary/30 transition-shadow"
      onClick={(e) => e.stopPropagation()}
      title="Click to change status directly"
    >
      <Badge>{value}</Badge>
      <ChevronDown className="h-3 w-3 text-slate-400 opacity-0 group-hover/status:opacity-100 ml-0.5 transition-opacity" />
      <select
        aria-label="Change status"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

/**
 * Inline hover/click editor for Deliverable Commercial & Hardware Status (Quote · PET · PO · Hardware Status).
 */
export function InlineCommercialCell({
  workstream: w,
  comm,
  onError,
  hwOnly = false,
  hideHw = false,
}: {
  workstream: Workstream
  comm?: DeliverableCommercialRow
  onError: (msg: string) => void
  hwOnly?: boolean
  hideHw?: boolean
}) {
  const [editingField, setEditingField] = useState<'quote' | 'pet' | 'po' | null>(null)
  const [draft, setDraft] = useState('')

  const q = comm?.quotation
  const pet = comm?.pet
  const po = comm?.po
  const hwStatus = normalizeHardwareStatus(po)

  function buildInput(overrides: Partial<ReturnType<typeof emptyDeliverableCommercial>>) {
    const base = comm
      ? rowToCommercialInput(comm)
      : emptyDeliverableCommercial(w.projectId, w.id, w.supplierId)
    return { ...base, ...overrides }
  }

  async function saveField(field: 'quote' | 'pet' | 'po', val: string) {
    setEditingField(null)
    try {
      const next =
        field === 'quote'
          ? buildInput({ quotationNumber: val.trim() })
          : field === 'pet'
            ? buildInput({ petReference: val.trim() })
            : buildInput({ poNumber: val.trim() })
      await saveDeliverableCommercial(next, true)
    } catch (e) {
      onError(errorMessage(e))
    }
  }

  async function saveHwStatus(nextStatus: string) {
    try {
      const next = buildInput({ deliveryStatus: nextStatus })
      await saveDeliverableCommercial(next, true)
    } catch (e) {
      onError(errorMessage(e))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {!hwOnly && (<>
      {/* Quote # inline edit */}
      {editingField === 'quote' ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-400 bg-white px-2.5 py-0.5 text-[11px] whitespace-nowrap">
          <b className="text-blue-900">Quote:</b>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => saveField('quote', draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveField('quote', draft)
              if (e.key === 'Escape') setEditingField(null)
            }}
            placeholder="Q-..."
            className="w-24 text-[11px] bg-transparent focus:outline-none"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(q?.number ?? ''); setEditingField('quote') }}
          title="Click to edit Quotation Number directly"
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] whitespace-nowrap transition-colors ${
            q?.number
              ? 'border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-400'
              : 'border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/40'
          }`}
        >
          <b>Quote:</b> {q?.number || '+ Add'}
        </button>
      )}

      {/* PET # inline edit */}
      {editingField === 'pet' ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-400 bg-white px-2.5 py-0.5 text-[11px] whitespace-nowrap">
          <b className="text-indigo-900">PET:</b>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => saveField('pet', draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveField('pet', draft)
              if (e.key === 'Escape') setEditingField(null)
            }}
            placeholder="PET-..."
            className="w-24 text-[11px] bg-transparent focus:outline-none"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(pet?.reference ?? ''); setEditingField('pet') }}
          title="Click to edit PET Number directly"
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] whitespace-nowrap transition-colors ${
            pet?.reference
              ? 'border-indigo-200 bg-indigo-50 text-indigo-900 hover:border-indigo-400'
              : 'border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50/40'
          }`}
        >
          <b>PET:</b> {pet?.reference || '+ Add'}
        </button>
      )}

      {/* PO # inline edit */}
      {editingField === 'po' ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400 bg-white px-2.5 py-0.5 text-[11px] whitespace-nowrap">
          <b className="text-emerald-900">PO:</b>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => saveField('po', draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveField('po', draft)
              if (e.key === 'Escape') setEditingField(null)
            }}
            placeholder="PO-..."
            className="w-24 text-[11px] bg-transparent focus:outline-none"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(po?.number ?? ''); setEditingField('po') }}
          title="Click to edit PO Number directly"
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] whitespace-nowrap transition-colors ${
            po?.number
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-400'
              : 'border-dashed border-slate-300 text-slate-400 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/40'
          }`}
        >
          <b>PO:</b> {po?.number ? `${po.number}${po.amount ? ` (${po.currency} ${po.amount.toLocaleString()})` : ''}` : '+ Add'}
        </button>
      )}
      </>)}

      {/* Hardware Status inline dropdown */}
      {!hideHw && (
      <div
        className="relative inline-flex items-center group/hw cursor-pointer rounded hover:ring-2 hover:ring-primary/30 transition-shadow"
        title="Click to change Hardware Status directly"
      >
        <CommercialBadge status={hwStatus} />
        <ChevronDown className="h-3 w-3 text-slate-400 opacity-0 group-hover/hw:opacity-100 ml-0.5 transition-opacity" />
        <select
          aria-label="Change Hardware Status"
          value={HARDWARE_STATUSES.includes(hwStatus as (typeof HARDWARE_STATUSES)[number]) ? hwStatus : 'Not Started'}
          onChange={(e) => saveHwStatus(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          {HARDWARE_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      )}
    </div>
  )
}

function ProjectWithDeliverablesGroup({
  project: p,
  deliverables,
  tasks,
  milestones,
  commByDeliverable,
  projTasksExpanded,
  onToggleProjTasks,
  expandedDelivTasks,
  onToggleDeliverableTasks,
  onNavigate,
  onEditProject,
  onDeleteProject,
  onExportExcel,
  onRequestArchive,
  onAddDeliverable,
  onEditDeliverable,
  onDeleteDeliverable,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onEditMilestone,
  onDeleteMilestone,
  onError,
}: {
  project: Project
  deliverables: Workstream[]
  tasks: Task[]
  milestones: Milestone[]
  commByDeliverable: Map<string, DeliverableCommercialRow>
  projTasksExpanded: boolean
  onToggleProjTasks: () => void
  expandedDelivTasks: Record<string, boolean>
  onToggleDeliverableTasks: (wId: string) => void
  onNavigate: () => void
  onEditProject: () => void
  onDeleteProject: () => void
  onExportExcel: () => void
  onRequestArchive: () => void
  onAddDeliverable: () => void
  onEditDeliverable: (w: Workstream) => void
  onDeleteDeliverable: (w: Workstream) => void
  onAddTask: (w?: Workstream) => void
  onEditTask: (t: Task) => void
  onDeleteTask: (t: Task) => void
  onEditMilestone: (m: Milestone) => void
  onDeleteMilestone: (m: Milestone) => void
  onError: (msg: string) => void
}) {
  const deliverableIds = new Set(deliverables.map((w) => w.id))
  const projectOnlyTasks = tasks
    .filter((t) => !t.workstreamId || !deliverableIds.has(t.workstreamId))
    .sort((a, b) => (a.startDate || a.dueDate || '9999').localeCompare(b.startDate || b.dueDate || '9999'))
  const projectOnlyMilestones = milestones
    .filter((m) => !m.workstreamId || !deliverableIds.has(m.workstreamId))
    .sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'))
  const totalProjectItems = tasks.length + milestones.length
  const generalProjectItemsCount = projectOnlyTasks.length + projectOnlyMilestones.length

  async function handleGenerateFromTemplate(w: Workstream) {
    try {
      await createTasksFromDeliverableTemplate({
        projectId: w.projectId,
        workstreamId: w.id,
        supplierId: w.supplierId,
        categoryOrName: w.name || w.category,
        startDate: todayStr(),
      })
    } catch (e) {
      onError(errorMessage(e))
    }
  }

  return (
    <div className="space-y-3">
      {/* 1. Project Header Card */}
      <div className="rounded-2xl liquid-glass overflow-hidden">
        <div
          onClick={onNavigate}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 liquid-card-header cursor-pointer hover:bg-slate-100/70 transition-colors"
        >
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <span className="text-base font-bold text-primary">{p.code}</span>
            <Badge color="blue">{p.hwType || 'FT'}</Badge>
            <span className="text-sm font-semibold text-slate-900 truncate">
              {p.deviceName || '—'}
            </span>
            <InlineStatusSelect
              value={p.status}
              options={PROJECT_STATUSES}
              onChange={async (next) => {
                const nextStatus = next as ProjectStatus
                try { await updateProject(p.id, { ...p, status: nextStatus }) } catch (e) { onError(errorMessage(e)) }
              }}
            />
            {p.baselineDate && (
              <span className="inline-flex items-center gap-1 rounded-full liquid-glass-pill px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                HW Required: <b className="text-slate-800">{formatDate(p.baselineDate)}</b>
              </span>
            )}
            <span className="text-xs text-slate-400">
              {deliverables.length} Deliverables · {totalProjectItems} Tasks
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" onClick={onAddDeliverable}>
              <Plus className="h-3.5 w-3.5 text-primary" /> Add Deliverable
            </Button>
            <Button size="sm" onClick={() => onAddTask()}>
              <Plus className="h-3.5 w-3.5 text-primary" /> Add Task
            </Button>
            <Button
              variant={projTasksExpanded ? 'primary' : 'secondary'}
              size="sm"
              title="Show or hide general project-level tasks & milestones"
              onClick={onToggleProjTasks}
            >
              <ListChecks className="h-3.5 w-3.5" />
              Project Tasks ({generalProjectItemsCount})
              {projTasksExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
            <Button size="sm" onClick={onExportExcel} title="Export this project to Excel">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export to Excel
            </Button>
            <Button size="sm" onClick={onRequestArchive} title="Archive this project permanently">
              <Archive className="h-3.5 w-3.5 text-amber-600" /> Archive
            </Button>
            <Button variant="ghost" size="sm" aria-label="Edit project" onClick={onEditProject}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Delete project" onClick={onDeleteProject}>
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        </div>

        {/* Project-Level Tasks & Milestones (when expanded) */}
        {projTasksExpanded && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/40 space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Project-Level Tasks & Milestones
              </span>
              <Button size="sm" variant="secondary" className="!h-6 !px-2.5 text-[11px]" onClick={() => onAddTask()}>
                <Plus className="h-3 w-3" /> Add Project Task / Milestone
              </Button>
            </div>
            {generalProjectItemsCount === 0 ? (
              <p className="text-xs text-slate-400 py-1">
                No general project-level tasks or milestones (deliverable tasks are shown inside each deliverable card below).
              </p>
            ) : (
              <div className="space-y-1.5 pl-3 border-l-2 border-primary/30">
                {projectOnlyMilestones.map((m) => (
                  <div
                    key={`ms-${m.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-purple-200 bg-purple-50/30 hover:bg-purple-50/60 px-3 py-2 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CornerDownRight className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 shrink-0" />
                      <button
                        type="button"
                        onClick={() => onEditMilestone(m)}
                        className="font-semibold text-slate-800 hover:text-primary hover:underline truncate text-left"
                      >
                        {m.name}
                      </button>
                      <span className="inline-flex items-center rounded-full border border-purple-500 bg-purple-100/95 px-2 py-0.5 text-[10px] font-semibold text-purple-950">
                        Milestone · 1d
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-slate-600">
                        Target: <b className="text-slate-800">{formatDate(m.targetDate)}</b>
                      </span>
                      <InlineStatusSelect
                        value={m.status}
                        options={MILESTONE_STATUSES}
                        onChange={async (next) => {
                          try { await updateMilestone(m.id, { ...m, status: next as MilestoneStatus }) } catch (e) { onError(errorMessage(e)) }
                        }}
                      />
                      <Button variant="ghost" size="sm" title="Edit milestone" onClick={() => onEditMilestone(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Delete milestone" onClick={() => onDeleteMilestone(m)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}

                {projectOnlyTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/90 hover:bg-blue-50/40 px-3 py-2 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CornerDownRight className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                      <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                      <button
                        type="button"
                        onClick={() => onEditTask(t)}
                        className="font-semibold text-slate-800 hover:text-primary hover:underline truncate text-left"
                      >
                        {t.name}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <InlineStatusSelect
                        value={t.priority}
                        options={PRIORITIES}
                        onChange={async (next) => {
                          try { await updateTask(t.id, { ...t, priority: next as Priority }) } catch (e) { onError(errorMessage(e)) }
                        }}
                      />
                      <span className="text-[11px] font-medium text-slate-400">{t.workingDays ?? 1}d</span>
                      <span className={isOverdueTask(t) ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                        {formatDate(t.startDate)} → <b className="text-slate-800">{formatDate(t.dueDate)}</b>
                      </span>
                      <DeadlineBadge task={t} />
                      <InlineStatusSelect
                        value={t.status}
                        options={TASK_STATUSES}
                        onChange={async (next) => {
                          try { await updateTask(t.id, { ...t, status: next as TaskStatus }) } catch (e) { onError(errorMessage(e)) }
                        }}
                      />
                      <Button variant="ghost" size="sm" title="Edit task" onClick={() => onEditTask(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Delete task" onClick={() => onDeleteTask(t)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Deliverables Cards + Clear Arrow-Connected Tasks */}
      {deliverables.length === 0 ? (
        <div className="rounded-2xl liquid-glass p-6 text-center text-xs text-slate-500">
          No deliverables yet for <b>HRS {p.code}</b>. Click <b>+ Add Deliverable</b> above to add one.
        </div>
      ) : (
        <div className="space-y-3">
          {deliverables.map((w) => {
            const comm = commByDeliverable.get(w.id)
            const po = comm?.po
            const hwStatus = normalizeHardwareStatus(po)
            const late = po && !po.actualDelivery && isPast(po.expectedDelivery) && hwStatus !== 'Delivered'
            const wTasks = tasks
              .filter((t) => t.workstreamId === w.id)
              .sort((a, b) => (a.startDate || a.dueDate || '9999').localeCompare(b.startDate || b.dueDate || '9999') || a.createdAt.localeCompare(b.createdAt))
            const wMilestones = milestones
              .filter((m) => m.workstreamId === w.id)
              .sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'))
            const wTotalItems = wTasks.length + wMilestones.length
            const isDelivTasksExpanded = !!expandedDelivTasks[w.id]

            return (
              <div key={w.id} className="rounded-2xl liquid-glass overflow-hidden">
                {/* Deliverable Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50/60">
                  <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onToggleDeliverableTasks(w.id)}
                      className="p-1 rounded-full hover:bg-slate-200/70 text-slate-500 transition-colors"
                      title={isDelivTasksExpanded ? 'Hide deliverable tasks' : 'Show deliverable tasks'}
                    >
                      {isDelivTasksExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <GitBranch className="h-4 w-4 text-primary shrink-0" />
                    <button
                      type="button"
                      onClick={() => onToggleDeliverableTasks(w.id)}
                      className="text-sm font-bold text-slate-800 hover:text-primary hover:underline"
                    >
                      {deliverableDisplayName(w)}
                    </button>
                    {w.mpn && (
                      <span className="rounded-full liquid-glass-pill px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                        MPN: {w.mpn}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      {comm?.supplierName ?? 'No supplier'}
                    </span>
                    <InlineCommercialCell workstream={w} comm={comm} onError={onError} hwOnly />
                    {(po?.expectedDelivery || po?.actualDelivery) && (
                      <span className={cn('text-xs whitespace-nowrap', late ? 'text-red-600 font-semibold' : 'text-slate-600')}>
                        Exp: <b>{formatDate(po.expectedDelivery)}</b>
                        {po.actualDelivery && <span className="ml-2 text-emerald-700">Act: <b>{formatDate(po.actualDelivery)}</b></span>}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <InlineCommercialCell workstream={w} comm={comm} onError={onError} hideHw />
                    <Button
                      variant={isDelivTasksExpanded ? 'primary' : 'secondary'}
                      size="sm"
                      title="Show or hide tasks linked to this deliverable"
                      onClick={() => onToggleDeliverableTasks(w.id)}
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                      Tasks ({wTotalItems})
                      {isDelivTasksExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary"
                      title="Add task to this deliverable"
                      onClick={() => onAddTask(w)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Edit Deliverable & Commercial" onClick={() => onEditDeliverable(w)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Delete Deliverable" onClick={() => onDeleteDeliverable(w)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>

                {/* Linked Tasks & Milestones with Clear Arrow Connector to Parent Deliverable */}
                {isDelivTasksExpanded && (
                  <div className="px-4 py-3 border-t border-slate-200 bg-white/40">
                    {wTotalItems === 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 pl-4 border-l-2 border-primary/35 py-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <CornerDownRight className="h-3.5 w-3.5 text-primary" />
                          No tasks linked to <b>{deliverableDisplayName(w)}</b> yet.
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="secondary" className="!h-7 !px-3 text-[11px]" onClick={() => void handleGenerateFromTemplate(w)}>
                            <Layers className="h-3 w-3" /> Load Template Tasks
                          </Button>
                          <Button size="sm" variant="primary" className="!h-7 !px-3 text-[11px]" onClick={() => onAddTask(w)}>
                            <Plus className="h-3 w-3" /> Add Task
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 pl-4 border-l-2 border-primary/40">
                        {wMilestones.map((m) => (
                          <div
                            key={`deliv-ms-${m.id}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-purple-200 bg-purple-50/30 hover:bg-purple-50/60 px-3 py-2 text-xs transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                title={`Linked to ${deliverableDisplayName(w)}`}
                                className="inline-flex items-center gap-1 text-primary font-semibold shrink-0"
                              >
                                <CornerDownRight className="h-4 w-4 text-purple-500" />
                              </span>
                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 shrink-0" />
                              <button
                                type="button"
                                onClick={() => onEditMilestone(m)}
                                className="font-semibold text-slate-800 hover:text-primary hover:underline truncate text-left"
                              >
                                {m.name}
                              </button>
                              <span className="inline-flex items-center rounded-full border border-purple-500 bg-purple-100/95 px-2 py-0.5 text-[10px] font-semibold text-purple-950">
                                Milestone · 1d
                              </span>
                              <span className="text-[11px] text-slate-400 hidden sm:inline">
                                → {deliverableDisplayName(w)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                              <span className="text-slate-600">
                                Target: <b className="text-slate-800">{formatDate(m.targetDate)}</b>
                              </span>
                              <InlineStatusSelect
                                value={m.status}
                                options={MILESTONE_STATUSES}
                                onChange={async (next) => {
                                  try { await updateMilestone(m.id, { ...m, status: next as MilestoneStatus }) } catch (e) { onError(errorMessage(e)) }
                                }}
                              />
                              <Button variant="ghost" size="sm" title="Edit milestone" onClick={() => onEditMilestone(m)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" title="Delete milestone" onClick={() => onDeleteMilestone(m)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))}

                        {wTasks.map((t, tIdx) => (
                          <div
                            key={t.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/90 hover:bg-blue-50/40 px-3 py-2 text-xs transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                title={`Linked to ${deliverableDisplayName(w)}`}
                                className="inline-flex items-center gap-1 text-primary shrink-0"
                              >
                                <CornerDownRight className="h-4 w-4 text-primary" />
                              </span>
                              <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="text-[10px] font-semibold text-slate-400">#{tIdx + 1}</span>
                              <button
                                type="button"
                                onClick={() => onEditTask(t)}
                                className="font-semibold text-slate-800 hover:text-primary hover:underline truncate text-left"
                              >
                                {t.name}
                              </button>
                              <span className="text-[11px] text-slate-400 hidden sm:inline">
                                → {deliverableDisplayName(w)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                              <InlineStatusSelect
                                value={t.priority}
                                options={PRIORITIES}
                                onChange={async (next) => {
                                  try { await updateTask(t.id, { ...t, priority: next as Priority }) } catch (e) { onError(errorMessage(e)) }
                                }}
                              />
                              <span className="text-[11px] font-medium text-slate-400">{t.workingDays ?? 1}d</span>
                              <span className={isOverdueTask(t) ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                                {formatDate(t.startDate)} → <b className="text-slate-800">{formatDate(t.dueDate)}</b>
                              </span>
                              <DeadlineBadge task={t} />
                              <InlineStatusSelect
                                value={t.status}
                                options={TASK_STATUSES}
                                onChange={async (next) => {
                                  try { await updateTask(t.id, { ...t, status: next as TaskStatus }) } catch (e) { onError(errorMessage(e)) }
                                }}
                              />
                              <Button variant="ghost" size="sm" title="Edit task" onClick={() => onEditTask(t)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" title="Delete task" onClick={() => onDeleteTask(t)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
