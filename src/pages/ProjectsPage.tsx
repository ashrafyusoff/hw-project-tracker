import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GitBranch, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import {
  ACTIVE_PROJECT_STATUSES,
  HARDWARE_STATUSES,
  HW_TYPES,
  PROJECT_STATUSES,
  WORKSTREAM_STATUSES,
  isArchivedStatus,
  type PetRecord,
  type PoRecord,
  type Project,
  type ProjectStatus,
  type Quotation,
  type Supplier,
  type Task,
  type Workstream,
  type WorkstreamStatus,
} from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loading, Select } from '@/components/ui'
import { TabSaveControls } from '@/components/TabSaveControls'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { WorkstreamForm } from '@/features/projects/WorkstreamForm'
import { DeliverableTasksModal } from '@/features/projects/DeliverableTasksModal'
import {
  CommercialBadge,
  buildDeliverableCommercialRows,
  normalizeHardwareStatus,
  rowToCommercialInput,
  type DeliverableCommercialRow,
} from '@/features/commercial/CommercialForms'
import { saveDeliverableCommercial, emptyDeliverableCommercial } from '@/services/commercialService'
import { deleteProject, updateProject } from '@/services/projectService'
import { deleteWorkstream, updateWorkstream } from '@/services/workstreamService'
import { formatDate, isPast } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

type SortKey = 'code' | 'hwType' | 'deviceName' | 'status' | 'target'
const COLLAPSED_STORAGE_KEY = 'npi.projects.collapsedIds'

export function ProjectsPage() {
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')
  const tasks = useTable<Task>('tasks')
  const suppliers = useTable<Supplier>('suppliers')
  const quotations = useTable<Quotation>('quotations')
  const pets = useTable<PetRecord>('petRecords')
  const pos = useTable<PoRecord>('poRecords')

  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = usePersistedState<string>('npi.projects.search', '')
  const [hwType, setHwType] = usePersistedState<string>('npi.projects.hwType', '')
  const [status, setStatus] = usePersistedState<string>('npi.projects.status', '')
  const [sort, setSort] = usePersistedState<{ key: SortKey; dir: 1 | -1 }>('npi.projects.sort', { key: 'code', dir: 1 })

  // Persist expand/collapse memory across tab switches & reloads
  const [collapsedIds, setCollapsedIds] = usePersistedState<Record<string, boolean>>(COLLAPSED_STORAGE_KEY, {})

  // Modals for Project and Deliverable + Commercial (combined)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | undefined>()
  const [deleting, setDeleting] = useState<Project | undefined>()
  const [archiving, setArchiving] = useState<{ project: Project; nextStatus: ProjectStatus } | undefined>()

  const [wsOpen, setWsOpen] = useState(false)
  const [wsProjectId, setWsProjectId] = useState('')
  const [wsEditing, setWsEditing] = useState<Workstream | undefined>()
  const [wsDeleting, setWsDeleting] = useState<Workstream | undefined>()
  const [wsTasksTarget, setWsTasksTarget] = useState<Workstream | undefined>()

  const [error, setError] = useState('')

  // "Quick Add → New Project" arrives here with ?new=1
  useEffect(() => {
    if (params.get('new')) {
      setEditing(undefined)
      setFormOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

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
    const val = (p: Project): string | number => {
      switch (sort.key) {
        case 'target': return p.baselineDate || '9999'
        case 'status': return PROJECT_STATUSES.indexOf(p.status)
        case 'hwType': return (p.hwType || 'FT').toLowerCase()
        case 'deviceName': return (p.deviceName || '').toLowerCase()
        default: return p.code.toLowerCase()
      }
    }
    return (projects ?? [])
      .filter((p) => !p.isNonNpi)
      .filter((p) => !isArchivedStatus(p.status))
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
      .sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
  }, [projects, workstreams, commByDeliverable, search, hwType, status, sort])

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))
  const Th = ({ k, children }: { k?: SortKey; children: string }) => (
    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
      {k ? (
        <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-slate-900">
          {children}{sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      ) : children}
    </th>
  )

  async function confirmDelete() {
    if (!deleting) return
    try { await deleteProject(deleting.id); setDeleting(undefined) } catch (e) { setError(errorMessage(e)); setDeleting(undefined) }
  }

  async function confirmArchive() {
    if (!archiving) return
    try {
      await updateProject(archiving.project.id, { ...archiving.project, status: archiving.nextStatus })
      setArchiving(undefined)
    } catch (e) {
      setError(errorMessage(e))
      setArchiving(undefined)
    }
  }

  async function confirmDeleteDeliverable() {
    if (!wsDeleting) return
    try { await deleteWorkstream(wsDeleting.id); setWsDeleting(undefined) } catch (e) { setError(errorMessage(e)); setWsDeleting(undefined) }
  }

  if (!projects || !workstreams || !suppliers || !quotations || !pets || !pos) return <Loading />

  const projectsFingerprint = JSON.stringify({
    projects: projects.filter((p) => !p.isNonNpi),
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

      <Card className="!p-0">
        {rows.length === 0 ? (
          <EmptyState
            title={projects.length === 0 ? 'No projects yet' : 'No projects match your filters'}
            hint={projects.length === 0 ? 'Click "Create Project" to add your first one.' : 'Try clearing the search or filters.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-600 text-left bg-slate-100">
                <tr>
                  <Th k="code">HRS Number / Deliverable</Th>
                  <Th k="hwType">HW Type / MPN</Th>
                  <Th k="deviceName">Device / Supplier</Th>
                  <Th k="status">Status / HW Status</Th>
                  <Th k="target">HW Required / Delivery</Th>
                  <Th>Quote · PET · PO</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const pDeliverables = workstreams.filter((w) => w.projectId === p.id)
                  const isCollapsed = !!collapsedIds[p.id]
                  return (
                    <ProjectWithDeliverablesGroup
                      key={p.id}
                      project={p}
                      deliverables={pDeliverables}
                      tasks={tasks ?? []}
                      commByDeliverable={commByDeliverable}
                      collapsed={isCollapsed}
                      onToggleCollapse={() => setCollapsedIds((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                      onNavigate={() => navigate(`/projects/${p.id}`)}
                      onEditProject={() => { setEditing(p); setFormOpen(true) }}
                      onDeleteProject={() => setDeleting(p)}
                      onRequestArchive={(nextStatus) => setArchiving({ project: p, nextStatus })}
                      onAddDeliverable={() => { setWsProjectId(p.id); setWsEditing(undefined); setWsOpen(true) }}
                      onEditDeliverable={(w) => { setWsProjectId(p.id); setWsEditing(w); setWsOpen(true) }}
                      onDeleteDeliverable={(w) => setWsDeleting(w)}
                      onOpenDeliverableTasks={(w) => setWsTasksTarget(w)}
                      onError={(msg) => setError(msg)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ProjectForm open={formOpen} project={editing} onClose={() => setFormOpen(false)} />
      <WorkstreamForm open={wsOpen} projectId={wsProjectId} workstream={wsEditing} suppliers={suppliers} onClose={() => setWsOpen(false)} />
      <DeliverableTasksModal
        open={!!wsTasksTarget}
        workstream={wsTasksTarget}
        project={projects.find((p) => p.id === wsTasksTarget?.projectId)}
        onClose={() => setWsTasksTarget(undefined)}
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
        open={!!archiving}
        title={`Move HRS ${archiving?.project.code ?? ''} to Archived?`}
        confirmLabel={`Confirm & Archive (${archiving?.nextStatus ?? ''})`}
        onCancel={() => setArchiving(undefined)}
        onConfirm={confirmArchive}
        message={
          <>
            Changing the status of <b>HRS {archiving?.project.code}</b> to <b>{archiving?.nextStatus}</b> will move all project data to the <b>Archived</b> tab. <b>This action is non-returnable.</b> Do you want to proceed?
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
  commByDeliverable,
  collapsed,
  onToggleCollapse,
  onNavigate,
  onEditProject,
  onDeleteProject,
  onRequestArchive,
  onAddDeliverable,
  onEditDeliverable,
  onDeleteDeliverable,
  onOpenDeliverableTasks,
  onError,
}: {
  project: Project
  deliverables: Workstream[]
  tasks: Task[]
  commByDeliverable: Map<string, DeliverableCommercialRow>
  collapsed: boolean
  onToggleCollapse: () => void
  onNavigate: () => void
  onEditProject: () => void
  onDeleteProject: () => void
  onRequestArchive: (nextStatus: ProjectStatus) => void
  onAddDeliverable: () => void
  onEditDeliverable: (w: Workstream) => void
  onDeleteDeliverable: (w: Workstream) => void
  onOpenDeliverableTasks: (w: Workstream) => void
  onError: (msg: string) => void
}) {
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
              title={collapsed ? 'Expand deliverables' : 'Collapse deliverables'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <span className="font-bold text-primary">{p.code}</span>
            <span className="text-[11px] font-normal text-slate-400">({deliverables.length})</span>
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
              if (isArchivedStatus(nextStatus)) {
                onRequestArchive(nextStatus)
                return
              }
              try { await updateProject(p.id, { ...p, status: nextStatus }) } catch (e) { onError(errorMessage(e)) }
            }}
          />
        </td>
        <td className="px-3 whitespace-nowrap text-xs">{formatDate(p.baselineDate)}</td>
        <td className="px-3 text-xs text-slate-500" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" className="!py-1 !px-2 text-xs text-primary" onClick={onAddDeliverable}>
            <Plus className="h-3 w-3" /> Add Deliverable
          </Button>
        </td>
        <td className="px-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" aria-label="Edit project" onClick={onEditProject}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" aria-label="Delete project" onClick={onDeleteProject}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
          </div>
        </td>
      </tr>

      {/* Deliverable & Commercial Sub-Items Displayed as Branches Under Main Project */}
      {!collapsed && deliverables.map((w, idx) => {
        const isLast = idx === deliverables.length - 1
        const comm = commByDeliverable.get(w.id)
        const po = comm?.po
        const hwStatus = normalizeHardwareStatus(po)
        const late = po && !po.actualDelivery && isPast(po.expectedDelivery) && hwStatus !== 'Delivered'
        return (
          <tr key={w.id} className="border-t border-slate-100 bg-slate-50/75 hover:bg-blue-50/40 text-xs">
            <td className="pl-7 pr-2 py-2 whitespace-nowrap text-slate-700 select-none">
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-slate-400 font-bold text-sm leading-none">{isLast ? '└─' : '├─'}</span>
                <GitBranch className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                <button onClick={onNavigate} className="font-semibold text-slate-800 hover:text-primary hover:underline">
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
                  variant="secondary"
                  size="sm"
                  className="!h-7 !px-2 text-[11px]"
                  title="View & manage tasks for this deliverable"
                  onClick={() => onOpenDeliverableTasks(w)}
                >
                  <ListChecks className="h-3.5 w-3.5 text-primary" />
                  Tasks ({tasks.filter((t) => t.workstreamId === w.id).length})
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
        )
      })}
    </>
  )
}
