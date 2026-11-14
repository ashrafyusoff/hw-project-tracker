import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FolderTree, GitBranch, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { PRIORITIES, PROJECT_STATUSES, type PetRecord, type PoRecord, type Project, type Quotation, type Supplier, type Workstream } from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loading, ProgressBar, Select } from '@/components/ui'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { WorkstreamForm } from '@/features/projects/WorkstreamForm'
import {
  CommercialBadge,
  DeliverableCommercialModal,
  UnifiedCommercialTable,
  buildDeliverableCommercialRows,
  rowToCommercialInput,
  type DeliverableCommercialRow,
} from '@/features/commercial/CommercialForms'
import type { DeliverableCommercialInput } from '@/services/commercialService'
import { deleteProject } from '@/services/projectService'
import { deleteWorkstream } from '@/services/workstreamService'
import { formatDate } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

type SortKey = 'code' | 'name' | 'priority' | 'status' | 'progress' | 'target'
const targetOf = (p: Project) => p.revisedDate || p.baselineDate

export function ProjectsPage() {
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')
  const suppliers = useTable<Supplier>('suppliers')
  const quotations = useTable<Quotation>('quotations')
  const pets = useTable<PetRecord>('petRecords')
  const pos = useTable<PoRecord>('poRecords')

  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [viewTab, setViewTab] = useState<'hierarchy' | 'commercial'>('hierarchy')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [fProject, setFProject] = useState('')
  const [fSupplier, setFSupplier] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'code', dir: 1 })
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({})

  // Modals for Project, Deliverable, and Commercial
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | undefined>()
  const [deleting, setDeleting] = useState<Project | undefined>()

  const [wsOpen, setWsOpen] = useState(false)
  const [wsProjectId, setWsProjectId] = useState('')
  const [wsEditing, setWsEditing] = useState<Workstream | undefined>()
  const [wsDeleting, setWsDeleting] = useState<Workstream | undefined>()

  const [commOpen, setCommOpen] = useState(false)
  const [commInitial, setCommInitial] = useState<DeliverableCommercialInput | undefined>()
  const [commDefaultProj, setCommDefaultProj] = useState('')
  const [commDefaultWs, setCommDefaultWs] = useState('')

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
    const prio = (p: Project) => PRIORITIES.indexOf(p.priority)
    const val = (p: Project): string | number => {
      switch (sort.key) {
        case 'priority': return prio(p)
        case 'progress': return p.progress
        case 'target': return targetOf(p) || '9999'
        case 'status': return PROJECT_STATUSES.indexOf(p.status)
        default: return p[sort.key].toLowerCase()
      }
    }
    return (projects ?? [])
      .filter((p) => !status || p.status === status)
      .filter((p) => !priority || p.priority === priority)
      .filter((p) => {
        if (!q) return true
        const pDeliverables = (workstreams ?? []).filter((w) => w.projectId === p.id)
        const delivText = pDeliverables.map((w) => `${w.name} ${w.category}`).join(' ')
        return `${p.code} ${p.name} ${p.deviceName} ${p.atePlatform} ${delivText}`.toLowerCase().includes(q)
      })
      .sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
  }, [projects, workstreams, search, status, priority, sort])

  const filteredCommercialRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return commercialRows
      .filter((r) => !fProject || r.projectId === fProject)
      .filter((r) => !fSupplier || r.supplierId === fSupplier)
      .filter((r) => {
        if (!q) return true
        const text = `${r.projectCode} ${r.projectName} ${r.workstream.name} ${r.supplierName} ${r.quotation?.number ?? ''} ${r.pet?.reference ?? ''} ${r.po?.number ?? ''}`
        return text.toLowerCase().includes(q)
      })
  }, [commercialRows, fProject, fSupplier, search])

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

  async function confirmDeleteDeliverable() {
    if (!wsDeleting) return
    try { await deleteWorkstream(wsDeleting.id); setWsDeleting(undefined) } catch (e) { setError(errorMessage(e)); setWsDeleting(undefined) }
  }

  function openCommercialForDeliverable(ws: Workstream) {
    const existingRow = commByDeliverable.get(ws.id)
    if (existingRow) {
      setCommInitial(rowToCommercialInput(existingRow))
    } else {
      setCommInitial(undefined)
      setCommDefaultProj(ws.projectId)
      setCommDefaultWs(ws.id)
    }
    setCommOpen(true)
  }

  if (!projects || !workstreams || !suppliers || !quotations || !pets || !pos) return <Loading />

  return (
    <div className="space-y-4">
      {/* Combined Project & Commercial View Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setViewTab('hierarchy')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
            viewTab === 'hierarchy' ? 'border-primary text-primary font-semibold' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <FolderTree className="h-4 w-4" />
          Projects & Deliverables
          <span className="text-xs text-slate-400">({projects.length} projects · {workstreams.length} deliverables)</span>
        </button>
        <button
          onClick={() => setViewTab('commercial')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
            viewTab === 'commercial' ? 'border-primary text-primary font-semibold' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Wallet className="h-4 w-4" />
          Commercial & Delivery Pipeline
          <span className="text-xs text-slate-400">({commercialRows.length})</span>
        </button>
      </div>

      {/* Filters & Action Bar */}
      {viewTab === 'hierarchy' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search project, deliverable, device…" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-64" />
          <Select className="!w-40" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'All statuses' }, ...PROJECT_STATUSES]} />
          <Select className="!w-36" value={priority} onChange={(e) => setPriority(e.target.value)} options={[{ value: '', label: 'All priorities' }, ...PRIORITIES]} />
          <Button variant="primary" className="ml-auto" onClick={() => { setEditing(undefined); setFormOpen(true) }}>
            <Plus className="h-4 w-4" /> Create Project
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search deliverable, quote, PET, PO…" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-64" />
          <Select
            className="!w-44"
            value={fProject}
            onChange={(e) => setFProject(e.target.value)}
            options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: `${p.code} – ${p.name}` }))]}
          />
          <Select
            className="!w-48"
            value={fSupplier}
            onChange={(e) => setFSupplier(e.target.value)}
            options={[{ value: '', label: 'All suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          />
          <Button
            variant="primary"
            className="ml-auto"
            onClick={() => {
              setCommInitial(undefined)
              setCommDefaultProj(fProject)
              setCommDefaultWs('')
              setCommOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> Update Deliverable Commercial
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {viewTab === 'hierarchy' ? (
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
                    <Th k="code">Code / Deliverable Branch</Th>
                    <Th k="name">Project / Deliverable Details</Th>
                    <Th>Supplier / Device</Th>
                    <Th k="priority">Priority / Category</Th>
                    <Th k="status">Status</Th>
                    <Th k="progress">Progress</Th>
                    <Th k="target">Target Date</Th>
                    <Th>Commercial (Quote · PET · PO · Delivery)</Th>
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
                        commByDeliverable={commByDeliverable}
                        collapsed={isCollapsed}
                        onToggleCollapse={() => setCollapsedIds((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                        onNavigate={() => navigate(`/projects/${p.id}`)}
                        onEditProject={() => { setEditing(p); setFormOpen(true) }}
                        onDeleteProject={() => setDeleting(p)}
                        onAddDeliverable={() => { setWsProjectId(p.id); setWsEditing(undefined); setWsOpen(true) }}
                        onEditDeliverable={(w) => { setWsProjectId(p.id); setWsEditing(w); setWsOpen(true) }}
                        onDeleteDeliverable={(w) => setWsDeleting(w)}
                        onEditCommercial={(w) => openCommercialForDeliverable(w)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="!p-0">
          <UnifiedCommercialTable
            rows={filteredCommercialRows}
            showProject={true}
            onEditRow={(r) => {
              setCommInitial(rowToCommercialInput(r))
              setCommOpen(true)
            }}
            onAddCommercial={() => {
              setCommInitial(undefined)
              setCommDefaultProj(fProject)
              setCommDefaultWs('')
              setCommOpen(true)
            }}
          />
        </Card>
      )}

      <ProjectForm open={formOpen} project={editing} onClose={() => setFormOpen(false)} />
      <WorkstreamForm open={wsOpen} projectId={wsProjectId} workstream={wsEditing} suppliers={suppliers} onClose={() => setWsOpen(false)} />
      <DeliverableCommercialModal
        open={commOpen}
        initial={commInitial}
        defaultProjectId={commDefaultProj}
        defaultWorkstreamId={commDefaultWs}
        onClose={() => setCommOpen(false)}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Delete project?"
        onCancel={() => setDeleting(undefined)}
        onConfirm={confirmDelete}
        message={<>This permanently deletes <b>{deleting?.code} – {deleting?.name}</b> and everything linked to it (deliverables, tasks, milestones, commercial records, and history). This cannot be undone.</>}
      />
      <ConfirmDialog
        open={!!wsDeleting}
        title="Delete deliverable?"
        onCancel={() => setWsDeleting(undefined)}
        onConfirm={confirmDeleteDeliverable}
        message={<>Delete deliverable <b>{wsDeleting?.name}</b>? Linked commercial records will be removed, and tasks/milestones will be detached from this deliverable.</>}
      />
    </div>
  )
}

function ProjectWithDeliverablesGroup({
  project: p,
  deliverables,
  commByDeliverable,
  collapsed,
  onToggleCollapse,
  onNavigate,
  onEditProject,
  onDeleteProject,
  onAddDeliverable,
  onEditDeliverable,
  onDeleteDeliverable,
  onEditCommercial,
}: {
  project: Project
  deliverables: Workstream[]
  commByDeliverable: Map<string, DeliverableCommercialRow>
  collapsed: boolean
  onToggleCollapse: () => void
  onNavigate: () => void
  onEditProject: () => void
  onDeleteProject: () => void
  onAddDeliverable: () => void
  onEditDeliverable: (w: Workstream) => void
  onDeleteDeliverable: (w: Workstream) => void
  onEditCommercial: (w: Workstream) => void
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
        <td className="px-3 font-semibold text-slate-900">{p.name}</td>
        <td className="px-3 text-slate-600 text-xs">{p.deviceName}{p.atePlatform ? ` · ${p.atePlatform}` : ''}</td>
        <td className="px-3"><Badge>{p.priority}</Badge></td>
        <td className="px-3"><Badge>{p.status}</Badge></td>
        <td className="px-3 w-36"><ProgressBar value={p.progress} /></td>
        <td className="px-3 whitespace-nowrap text-xs">{formatDate(targetOf(p))}</td>
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

      {/* Deliverable Sub-Items Displayed as Branches Under Main Project */}
      {!collapsed && deliverables.map((w, idx) => {
        const isLast = idx === deliverables.length - 1
        const comm = commByDeliverable.get(w.id)
        const q = comm?.quotation
        const pet = comm?.pet
        const po = comm?.po
        return (
          <tr key={w.id} className="border-t border-slate-100 bg-slate-50/75 hover:bg-blue-50/40 text-xs">
            <td className="pl-7 pr-2 py-2 whitespace-nowrap text-slate-500 font-mono select-none">
              <span className="inline-flex items-center gap-1.5 text-slate-600">
                <span className="text-slate-400 font-bold text-sm leading-none">{isLast ? '└─' : '├─'}</span>
                <GitBranch className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                <span className="font-sans text-[11px] font-semibold text-slate-600">Deliverable</span>
              </span>
            </td>
            <td className="px-3 py-2 font-medium text-slate-800">
              <button onClick={onNavigate} className="hover:text-primary hover:underline text-left font-semibold">
                {w.name}
              </button>
            </td>
            <td className="px-3 py-2 text-slate-600">{comm?.supplierName ?? '—'}</td>
            <td className="px-3 py-2 text-slate-500">{w.category}</td>
            <td className="px-3 py-2"><Badge>{w.status}</Badge></td>
            <td className="px-3 py-2 w-36"><ProgressBar value={w.progress} /></td>
            <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDate(w.targetDate)}</td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {q ? (
                  <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-900">
                    <b>Quote:</b> {q.number} ({q.status})
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">Quote: —</span>
                )}
                {pet ? (
                  <span className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-900">
                    <b>PET:</b> {pet.reference} ({pet.status})
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">· PET: —</span>
                )}
                {po ? (
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-900">
                    <b>PO:</b> {po.number} · {po.hardwareDelivery || po.status}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">· PO: —</span>
                )}
                {po?.deliveryStatus && <CommercialBadge status={po.deliveryStatus} />}
              </div>
            </td>
            <td className="px-3 py-2 whitespace-nowrap">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" title="Edit Deliverable Commercial (Quote / PET / PO / Delivery)" onClick={() => onEditCommercial(w)}>
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                </Button>
                <Button variant="ghost" size="sm" title="Edit Deliverable" onClick={() => onEditDeliverable(w)}>
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
