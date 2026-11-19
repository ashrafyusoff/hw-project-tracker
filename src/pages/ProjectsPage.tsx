import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Archive, CheckSquare, ChevronDown, ChevronRight, FileSpreadsheet, GitBranch, GripVertical, Layers, ListChecks, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
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
import { TabSaveControls } from '@/components/TabSaveControls'
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

const EXPANDED_DELIV_TASKS_KEY = 'npi.projects.expandedDeliverableTasks'
const EXPANDED_PROJ_TASKS_KEY = 'npi.projects.expandedProjectTasks'
const PROJECT_ORDER_KEY = 'npi.projects.buttonOrder'
const SELECTED_PROJECT_KEY = 'npi.projects.selectedId'

const PROJECT_BUTTON_STYLE: Record<ProjectStatus, { pill: string; dot: string }> = {
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
  const [draggingProjId, setDraggingProjId] = useState<string>('')
  const [dragOverProjId, setDragOverProjId] = useState<string>('')
  const projBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const prevProjRects = useRef<Map<string, DOMRect>>(new Map())
  const lastSwapRef = useRef<{ targetId: string; time: number }>({ targetId: '', time: 0 })

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

  const [error, setError] = useState('')

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

  function captureProjRects() {
    const rects = new Map<string, DOMRect>()
    projBtnRefs.current.forEach((el, id) => {
      rects.set(id, el.getBoundingClientRect())
    })
    prevProjRects.current = rects
  }

  // Smooth Apple-style FLIP animation when project buttons shift left/right to make space
  useLayoutEffect(() => {
    if (prevProjRects.current.size === 0) return
    const prev = prevProjRects.current
    prevProjRects.current = new Map()
    projBtnRefs.current.forEach((el, id) => {
      if (id === draggingProjId) return
      const oldRect = prev.get(id)
      if (!oldRect) return
      const newRect = el.getBoundingClientRect()
      const dx = oldRect.left - newRect.left
      const dy = oldRect.top - newRect.top
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        el.getAnimations().forEach((a) => a.cancel())
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: 'translate(0, 0)' },
          ],
          {
            duration: 400,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          },
        )
      }
    })
  }, [rows, draggingProjId])

  function moveProjectButton(fromId: string, toId: string) {
    if (!fromId || !toId || fromId === toId) return
    const currentIds = rows.map((p) => p.id)
    const fromIdx = currentIds.indexOf(fromId)
    const toIdx = currentIds.indexOf(toId)
    if (fromIdx < 0 || toIdx < 0) return
    captureProjRects()
    const next = [...currentIds]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    // Preserve any hidden project IDs that were filtered out
    const remaining = projectOrder.filter((id) => !next.includes(id))
    setProjectOrder([...next, ...remaining])
  }

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

  const projectsFingerprint = JSON.stringify({
    projects: projects.filter((p) => !p.isNonNpi && !isArchivedProject(p)),
    workstreams,
    tasks: tasks ?? [],
    quotations,
    pets,
    pos,
  })

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
          <TabSaveControls
            tabKey="projects"
            tabLabel="Projects"
            buttonLabel="Save Projects"
            fingerprint={projectsFingerprint}
            currentPathPrefix="/projects"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <Card className="!p-0">
          <EmptyState
            title={projects.length === 0 ? 'No projects yet' : 'No projects match your filters'}
            hint={projects.length === 0 ? 'Click "Create Project" to add your first one.' : 'Try clearing the search or filters.'}
          />
        </Card>
      ) : (
        <>
          {/* Horizontal Project Capsule Buttons (Fixed Width, Status-Coloured, Drag Left/Right to Rearrange) */}
          <Card
            title={`Available Projects (${rows.length})`}
            action={
              <span className="text-[11px] text-slate-400">
                Click a project button to view · Drag buttons left or right to arrange order · Button colour = Project Status
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {rows.map((p) => {
                const isSelected = activeProject?.id === p.id
                const style = PROJECT_BUTTON_STYLE[p.status] ?? PROJECT_BUTTON_STYLE.Planning
                const label = `${p.code}${p.deviceName ? ` · ${p.deviceName}` : ''}`
                return (
                  <button
                    key={p.id}
                    ref={(el) => {
                      if (el) projBtnRefs.current.set(p.id, el)
                      else projBtnRefs.current.delete(p.id)
                    }}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', p.id)
                      setDraggingProjId(p.id)
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (dragOverProjId !== p.id) setDragOverProjId(p.id)
                      if (draggingProjId && draggingProjId !== p.id) {
                        const now = performance.now()
                        if (lastSwapRef.current.targetId !== p.id || now - lastSwapRef.current.time > 250) {
                          lastSwapRef.current = { targetId: p.id, time: now }
                          moveProjectButton(draggingProjId, p.id)
                        }
                      }
                    }}
                    onDragLeave={() => setDragOverProjId((cur) => (cur === p.id ? '' : cur))}
                    onDrop={(e) => {
                      e.preventDefault()
                      const fromId = e.dataTransfer.getData('text/plain') || draggingProjId
                      if (fromId && fromId !== p.id) moveProjectButton(fromId, p.id)
                      setDraggingProjId('')
                      setDragOverProjId('')
                    }}
                    onDragEnd={() => {
                      setDraggingProjId('')
                      setDragOverProjId('')
                    }}
                    onClick={() => setSelectedProjectId(p.id)}
                    title={`HRS ${label}\nStatus: ${p.status} · HW Type: ${p.hwType || 'FT'}${p.baselineDate ? ` · HW Required: ${formatDate(p.baselineDate)}` : ''}\nClick to select · Drag left/right to rearrange`}
                    className={cn(
                      'group relative inline-flex h-9 w-52 shrink-0 items-center justify-between gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all duration-200 select-none cursor-pointer',
                      style.pill,
                      isSelected && 'ring-2 ring-primary ring-offset-1 shadow-md scale-[1.01]',
                      draggingProjId === p.id && 'opacity-65 scale-[1.03] shadow-lg ring-2 ring-primary z-10',
                      dragOverProjId === p.id && draggingProjId !== p.id && 'ring-2 ring-primary',
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

          {/* Active Selected Project Workspace */}
          {activeProject && (
            <Card className="!p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-600 text-left bg-slate-100">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">HRS Number / Deliverable / Tasks</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">HW Type / MPN</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Device / Supplier</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Status / HW Status</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">HW Required / Delivery</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Quote · PET · PO</th>
                      <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <ProjectWithDeliverablesGroup
                      key={activeProject.id}
                      project={activeProject}
                      deliverables={workstreams.filter((w) => w.projectId === activeProject.id)}
                      tasks={(tasks ?? []).filter((t) => t.projectId === activeProject.id)}
                      milestones={(milestones ?? []).filter((m) => m.projectId === activeProject.id)}
                      commByDeliverable={commByDeliverable}
                      collapsed={false}
                      onToggleCollapse={() => {}}
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
                  </tbody>
                </table>
              </div>
            </Card>
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
        <span className="inline-flex items-center gap-1 rounded border border-blue-400 bg-white px-1.5 py-0.5 text-[11px]">
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
            className="w-24 text-[11px] focus:outline-none"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(q?.number ?? ''); setEditingField('quote') }}
          title="Click to edit Quotation Number directly"
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors ${
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
        <span className="inline-flex items-center gap-1 rounded border border-indigo-400 bg-white px-1.5 py-0.5 text-[11px]">
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
            className="w-24 text-[11px] focus:outline-none"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(pet?.reference ?? ''); setEditingField('pet') }}
          title="Click to edit PET Number directly"
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors ${
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
        <span className="inline-flex items-center gap-1 rounded border border-emerald-400 bg-white px-1.5 py-0.5 text-[11px]">
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
            className="w-24 text-[11px] focus:outline-none"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(po?.number ?? ''); setEditingField('po') }}
          title="Click to edit PO Number directly"
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors ${
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
  collapsed,
  onToggleCollapse,
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
  collapsed: boolean
  onToggleCollapse: () => void
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
    <>
      {/* Main Project Row */}
      <tr onClick={onNavigate} className="border-t border-slate-200 bg-white hover:bg-slate-50 cursor-pointer font-medium">
        <td className="px-3 py-2.5 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-600"
              title={collapsed ? 'Expand deliverables & tasks' : 'Collapse deliverables & tasks'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <span className="font-bold text-primary">{p.code}</span>
            <span className="text-[11px] font-normal text-slate-400">
              ({deliverables.length} Deliv · {totalProjectItems} Tasks)
            </span>
          </div>
        </td>
        <td className="px-3"><Badge color="blue">{p.hwType || 'FT'}</Badge></td>
        <td className="px-3 font-semibold text-slate-900">{p.deviceName || '—'}</td>
        <td className="px-3">
          <InlineStatusSelect
            value={p.status}
            options={PROJECT_STATUSES}
            onChange={async (next) => {
              const nextStatus = next as ProjectStatus
              try { await updateProject(p.id, { ...p, status: nextStatus }) } catch (e) { onError(errorMessage(e)) }
            }}
          />
        </td>
        <td className="px-3 whitespace-nowrap text-xs">{formatDate(p.baselineDate)}</td>
        <td className="px-3 text-xs text-slate-500" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="ghost" className="!py-1 !px-2 text-xs text-primary" onClick={onAddDeliverable}>
              <Plus className="h-3 w-3" /> Add Deliverable
            </Button>
            <Button size="sm" variant="ghost" className="!py-1 !px-2 text-xs text-primary" onClick={() => onAddTask()}>
              <Plus className="h-3 w-3" /> Add Task
            </Button>
          </div>
        </td>
        <td className="px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <Button
              variant={projTasksExpanded ? 'primary' : 'secondary'}
              size="sm"
              className="!h-7 !px-2.5 text-[11px]"
              title="Show or hide project-level tasks & milestones directly under this project"
              onClick={onToggleProjTasks}
            >
              <ListChecks className="h-3.5 w-3.5" />
              Project Tasks ({generalProjectItemsCount})
              {projTasksExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
            <Button size="sm" className="!h-7 !px-2.5 text-[11px]" onClick={onExportExcel} title="Export this project to Excel">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export to Excel
            </Button>
            <Button size="sm" className="!h-7 !px-2.5 text-[11px]" onClick={onRequestArchive} title="Archive this project permanently">
              <Archive className="h-3.5 w-3.5 text-amber-600" /> Archive
            </Button>
            <Button variant="ghost" size="sm" aria-label="Edit project" onClick={onEditProject}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" aria-label="Delete project" onClick={onDeleteProject}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
          </div>
        </td>
      </tr>

      {/* Inline Project-Level Tasks & Milestones (not tied to a specific deliverable) */}
      {!collapsed && projTasksExpanded && (
        <>
          {generalProjectItemsCount === 0 ? (
            <tr className="border-t border-slate-100 bg-slate-50/40 text-xs">
              <td colSpan={7} className="pl-11 pr-3 py-2 text-slate-500">
                <div className="flex items-center justify-between">
                  <span>No general project-level tasks or milestones (deliverable tasks are shown under each deliverable below).</span>
                  <Button size="sm" variant="secondary" className="!h-6 !px-2.5 text-[11px]" onClick={() => onAddTask()}>
                    <Plus className="h-3 w-3" /> Add Project Task / Milestone
                  </Button>
                </div>
              </td>
            </tr>
          ) : (
            <>
              {projectOnlyMilestones.map((m) => (
                <tr key={`ms-${m.id}`} className="border-t border-slate-100 bg-purple-50/30 hover:bg-purple-50/60 text-xs">
                  <td className="pl-11 pr-2 py-1.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-slate-400 text-xs leading-none">├─</span>
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 shrink-0" />
                      <button
                        type="button"
                        onClick={() => onEditMilestone(m)}
                        className="font-semibold text-slate-800 hover:text-primary hover:underline text-left"
                      >
                        {m.name}
                      </button>
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-purple-500 bg-purple-100/95 px-2 py-0.5 text-[10px] font-semibold text-purple-950">
                      Milestone · 1d
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-500 truncate max-w-[180px]">{m.description || m.remarks || 'Project Milestone'}</td>
                  <td className="px-3 py-1.5">
                    <InlineStatusSelect
                      value={m.status}
                      options={MILESTONE_STATUSES}
                      onChange={async (next) => {
                        try { await updateMilestone(m.id, { ...m, status: next as MilestoneStatus }) } catch (e) { onError(errorMessage(e)) }
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">
                    Target: <span className="font-semibold text-slate-800">{formatDate(m.targetDate)}</span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-400 text-[11px]">Project Milestone</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" title="Edit milestone" onClick={() => onEditMilestone(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Delete milestone" onClick={() => onDeleteMilestone(m)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {projectOnlyTasks.map((t, tIdx) => {
                const isLastTask = tIdx === projectOnlyTasks.length - 1 && deliverables.length === 0
                return (
                  <tr key={t.id} className="border-t border-slate-100 bg-slate-50/45 hover:bg-blue-50/40 text-xs">
                    <td className="pl-11 pr-2 py-1.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-slate-400 text-xs leading-none">{isLastTask ? '└─' : '├─'}</span>
                        <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                        <button
                          type="button"
                          onClick={() => onEditTask(t)}
                          className="font-semibold text-slate-800 hover:text-primary hover:underline text-left"
                        >
                          {t.name}
                        </button>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <InlineStatusSelect
                          value={t.priority}
                          options={PRIORITIES}
                          onChange={async (next) => {
                            try { await updateTask(t.id, { ...t, priority: next as Priority }) } catch (e) { onError(errorMessage(e)) }
                          }}
                        />
                        <span className="text-[11px] text-slate-400 font-medium">{t.workingDays ?? 1}d</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-slate-500 truncate max-w-[180px]">{t.remarks || 'Project Task'}</td>
                    <td className="px-3 py-1.5">
                      <InlineStatusSelect
                        value={t.status}
                        options={TASK_STATUSES}
                        onChange={async (next) => {
                          try { await updateTask(t.id, { ...t, status: next as TaskStatus }) } catch (e) { onError(errorMessage(e)) }
                        }}
                      />
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className={isOverdueTask(t) ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                        {formatDate(t.startDate)} → <span className="font-semibold text-slate-800">{formatDate(t.dueDate)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <DeadlineBadge task={t} />
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" title="Edit task" onClick={() => onEditTask(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Delete task" onClick={() => onDeleteTask(t)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </>
          )}
        </>
      )}

      {/* Deliverable & Commercial Sub-Items Displayed as Branches Under Main Project */}
      {!collapsed && deliverables.map((w, idx) => {
        const isLast = idx === deliverables.length - 1
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
          <Fragment key={w.id}>
            <tr className="border-t border-slate-100 bg-slate-50/75 hover:bg-blue-50/40 text-xs">
              <td className="pl-7 pr-2 py-2 whitespace-nowrap text-slate-700 select-none">
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-mono text-slate-400 font-bold text-sm leading-none">{isLast && !isDelivTasksExpanded ? '└─' : '├─'}</span>
                  <button
                    type="button"
                    onClick={() => onToggleDeliverableTasks(w.id)}
                    className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
                    title={isDelivTasksExpanded ? 'Hide deliverable tasks' : 'Show deliverable tasks inline'}
                  >
                    {isDelivTasksExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  <GitBranch className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                  <button onClick={() => onToggleDeliverableTasks(w.id)} className="font-semibold text-slate-800 hover:text-primary hover:underline">
                    {deliverableDisplayName(w)}
                  </button>
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{w.mpn || '—'}</td>
              <td className="px-3 py-2 text-slate-600">{comm?.supplierName ?? '—'}</td>
              <td className="px-3 py-2">
                <InlineCommercialCell workstream={w} comm={comm} onError={onError} hwOnly />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {po?.expectedDelivery || po?.actualDelivery ? (
                  <div className={late ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                    Exp: {formatDate(po.expectedDelivery)}
                    {po.actualDelivery && <span className="block text-[11px] text-emerald-700">Act: {formatDate(po.actualDelivery)}</span>}
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <InlineCommercialCell workstream={w} comm={comm} onError={onError} hideHw />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="flex items-center gap-1">
                  <Button
                    variant={isDelivTasksExpanded ? 'primary' : 'secondary'}
                    size="sm"
                    className="!h-7 !px-2.5 text-[11px]"
                    title="Show or hide tasks for this deliverable directly below"
                    onClick={() => onToggleDeliverableTasks(w.id)}
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    Tasks ({wTotalItems})
                    {isDelivTasksExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="!h-7 !px-1.5 text-[11px] text-primary"
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
              </td>
            </tr>

            {/* Inline Deliverable Tasks & Milestones nested directly under this Deliverable */}
            {isDelivTasksExpanded && (
              <>
                {wTotalItems === 0 ? (
                  <tr className="border-t border-slate-100 bg-white/70 text-xs">
                    <td colSpan={7} className="pl-14 pr-3 py-2 text-slate-500">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>No tasks for <b>{deliverableDisplayName(w)}</b> yet.</span>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="secondary" className="!h-6 !px-2.5 text-[11px]" onClick={() => void handleGenerateFromTemplate(w)}>
                            <Layers className="h-3 w-3" /> Load Template Tasks
                          </Button>
                          <Button size="sm" variant="primary" className="!h-6 !px-2.5 text-[11px]" onClick={() => onAddTask(w)}>
                            <Plus className="h-3 w-3" /> Add Task
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {wMilestones.map((m) => (
                      <tr key={`deliv-ms-${m.id}`} className="border-t border-slate-100 bg-purple-50/25 hover:bg-purple-50/50 text-xs">
                        <td className="pl-14 pr-2 py-1.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono text-slate-300 text-xs leading-none">├─</span>
                            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 shrink-0" />
                            <button
                              type="button"
                              onClick={() => onEditMilestone(m)}
                              className="font-semibold text-slate-800 hover:text-primary hover:underline text-left"
                            >
                              {m.name}
                            </button>
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-purple-500 bg-purple-100/95 px-2 py-0.5 text-[10px] font-semibold text-purple-950">
                            Milestone · 1d
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">{comm?.supplierName ?? '—'}</td>
                        <td className="px-3 py-1.5">
                          <InlineStatusSelect
                            value={m.status}
                            options={MILESTONE_STATUSES}
                            onChange={async (next) => {
                              try { await updateMilestone(m.id, { ...m, status: next as MilestoneStatus }) } catch (e) { onError(errorMessage(e)) }
                            }}
                          />
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">
                          Target: <span className="font-semibold text-slate-800">{formatDate(m.targetDate)}</span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-400 text-[11px]">{deliverableDisplayName(w)}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" title="Edit milestone" onClick={() => onEditMilestone(m)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Delete milestone" onClick={() => onDeleteMilestone(m)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {wTasks.map((t, tIdx) => {
                      const isLastTask = tIdx === wTasks.length - 1
                      return (
                        <tr key={t.id} className="border-t border-slate-100 bg-white/80 hover:bg-blue-50/40 text-xs">
                          <td className="pl-14 pr-2 py-1.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-mono text-slate-300 text-xs leading-none">{isLastTask ? '└─' : '├─'}</span>
                              <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="text-[10px] font-semibold text-slate-400">#{tIdx + 1}</span>
                              <button
                                type="button"
                                onClick={() => onEditTask(t)}
                                className="font-semibold text-slate-800 hover:text-primary hover:underline text-left"
                              >
                                {t.name}
                              </button>
                            </span>
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <InlineStatusSelect
                                value={t.priority}
                                options={PRIORITIES}
                                onChange={async (next) => {
                                  try { await updateTask(t.id, { ...t, priority: next as Priority }) } catch (e) { onError(errorMessage(e)) }
                                }}
                              />
                              <span className="text-[11px] text-slate-400 font-medium">{t.workingDays ?? 1}d</span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-slate-500 truncate max-w-[180px]">{t.remarks || comm?.supplierName || '—'}</td>
                          <td className="px-3 py-1.5">
                            <InlineStatusSelect
                              value={t.status}
                              options={TASK_STATUSES}
                              onChange={async (next) => {
                                try { await updateTask(t.id, { ...t, status: next as TaskStatus }) } catch (e) { onError(errorMessage(e)) }
                              }}
                            />
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <span className={isOverdueTask(t) ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                              {formatDate(t.startDate)} → <span className="font-semibold text-slate-800">{formatDate(t.dueDate)}</span>
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            <DeadlineBadge task={t} />
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" title="Edit task" onClick={() => onEditTask(t)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" title="Delete task" onClick={() => onDeleteTask(t)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </>
                )}
              </>
            )}
          </Fragment>
        )
      })}
    </>
  )
}
