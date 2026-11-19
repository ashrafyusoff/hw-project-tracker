import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckSquare, Cpu, FolderKanban, Plus, Square, StickyNote, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { Milestone, PetRecord, PoRecord, Project, ProjectStatus, Quotation, Supplier, Task, Workstream } from '@/types'
import { HARDWARE_STATUSES, PROJECT_STATUSES, isArchivedProject } from '@/types'
import { Badge, Card, EmptyState, Loading, Button } from '@/components/ui'
import { InlineStatusSelect } from './ProjectsPage'
import { daysFromToday, daysUntil, formatDate, isPast, newId, todayStr } from '@/utils/helpers'
import { loadSampleData } from '@/services/sampleData'
import { updateProject } from '@/services/projectService'
import { WorkWeekCalendar } from '@/features/overview/WorkWeekCalendar'
import { CommercialBadge, buildDeliverableCommercialRows, normalizeHardwareStatus, rowToCommercialInput } from '@/features/commercial/CommercialForms'
import { emptyDeliverableCommercial, saveDeliverableCommercial } from '@/services/commercialService'

type RadarFilter = 'all' | 'need_po' | 'in_transit' | 'delivered'

interface QuickNoteItem {
  id: string
  text: string
  done: boolean
  createdAt: string
}

export function OverviewPage() {
  const navigate = useNavigate()
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')
  const tasks = useTable<Task>('tasks')
  const milestones = useTable<Milestone>('milestones')
  const suppliers = useTable<Supplier>('suppliers')
  const quotations = useTable<Quotation>('quotations')
  const pets = useTable<PetRecord>('petRecords')
  const pos = useTable<PoRecord>('poRecords')

  // Interactive left-slot widget state (Hardware Delivery Radar + Quick Engineering Pinboard)
  const [leftWidgetTab, setLeftWidgetTab] = usePersistedState<'radar' | 'notes'>('npi.overview.leftWidgetTab', 'radar')
  const [radarFilter, setRadarFilter] = usePersistedState<RadarFilter>('npi.overview.radarFilter', 'all')
  const [quickNotes, setQuickNotes] = usePersistedState<QuickNoteItem[]>('npi.overview.quickNotes', [
    { id: 'sample-note-1', text: 'Verify socket pin pitch drawing before Friday release', done: false, createdAt: todayStr() },
    { id: 'sample-note-2', text: 'Follow up PCB impedance coupon report with vendor', done: false, createdAt: todayStr() },
  ])
  const [newNoteText, setNewNoteText] = useState('')

  const npiProjects = useMemo(() => (projects ?? []).filter((p) => !p.isNonNpi), [projects])
  const activeNpiProjects = useMemo(() => npiProjects.filter((p) => !isArchivedProject(p)), [npiProjects])
  // Project Status card: all active projects excluding Completed & Cancelled
  const activeStatusProjects = useMemo(
    () =>
      activeNpiProjects
        .filter((p) => p.status !== 'Completed' && p.status !== 'Cancelled')
        .sort((a, b) => (a.baselineDate || '9999').localeCompare(b.baselineDate || '9999') || a.code.localeCompare(b.code)),
    [activeNpiProjects],
  )

  const commercialRows = useMemo(() => {
    if (!workstreams || !quotations || !pets || !pos || !projects || !suppliers) return []
    const activeProjectIds = new Set(activeNpiProjects.map((p) => p.id))
    const activeWs = workstreams.filter((w) => activeProjectIds.has(w.projectId))
    const from = daysFromToday(-14)
    const to = daysFromToday(14)
    // Need PO / Design-Fab-Delivery: all active NPI deliverables, any timeline.
    // Delivered: only if delivery date is within the past 2 weeks to next 2 weeks (incl. pull-in).
    return buildDeliverableCommercialRows(activeWs, quotations, pets, pos, projects, suppliers).filter((r) => {
      if (normalizeHardwareStatus(r.po) !== 'Delivered') return true
      const date = r.po?.actualDelivery || r.po?.expectedDelivery
      return !!date && date >= from && date <= to
    })
  }, [workstreams, quotations, pets, pos, projects, suppliers, activeNpiProjects])

  const filteredRadarRows = useMemo(() => {
    return commercialRows.filter((r) => {
      const hwStatus = normalizeHardwareStatus(r.po)
      if (radarFilter === 'need_po') {
        return !r.po?.number
      }
      if (radarFilter === 'in_transit') {
        return hwStatus === 'Design' || hwStatus === 'Fabrication' || hwStatus === 'In Delivery'
      }
      if (radarFilter === 'delivered') {
        return hwStatus === 'Delivered'
      }
      return true
    })
  }, [commercialRows, radarFilter])

  if (!projects || !workstreams || !tasks || !milestones || !suppliers || !quotations || !pets || !pos) return <Loading />

  if (projects.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No projects yet"
          hint="Create your first project, or load sample semiconductor NPI data to see how the app works."
          action={
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => navigate('/projects?new=1')}>Create Project</Button>
              <Button onClick={() => loadSampleData()}>Load Sample Data</Button>
            </div>
          }
        />
      </Card>
    )
  }

  function addQuickNote(e: React.FormEvent) {
    e.preventDefault()
    const text = newNoteText.trim()
    if (!text) return
    setQuickNotes((prev) => [{ id: newId(), text, done: false, createdAt: todayStr() }, ...prev])
    setNewNoteText('')
  }

  return (
    <div className="space-y-4">
      {/* 5-day Workweek Calendar for Tasks and Milestones with Drag-and-Drop */}
      <div className="grid xl:grid-cols-3 gap-4">
        <WorkWeekCalendar
          tasks={tasks}
          milestones={milestones}
          projects={projects}
          workstreams={workstreams}
        />
      </div>

      {/* Bottom Row: Interactive Hardware Delivery Radar & Pinboard (Left) + Recent Activities Latest 15 (Right) */}
      <div className="grid xl:grid-cols-2 gap-4 items-stretch">
        {/* LEFT SLOT: Interactive Hardware Delivery Radar & Quick Engineering Pinboard */}
        <Card
          title="Hardware Delivery Radar & Quick Pinboard"
          className="[&>div]:!p-3"
          action={
            <div className="inline-flex items-center rounded border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setLeftWidgetTab('radar')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
                  leftWidgetTab === 'radar' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Cpu className="h-3 w-3" /> HW Delivery Radar ({commercialRows.length})
              </button>
              <button
                type="button"
                onClick={() => setLeftWidgetTab('notes')}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium transition-colors ${
                  leftWidgetTab === 'notes' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <StickyNote className="h-3 w-3" /> Quick Pinboard ({quickNotes.filter((n) => !n.done).length})
              </button>
            </div>
          }
        >
          {leftWidgetTab === 'radar' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  {(
                    [
                      { id: 'all', label: `All (${commercialRows.length})` },
                      { id: 'need_po', label: `Need PO (${commercialRows.filter((r) => !r.po?.number).length})` },
                      {
                        id: 'in_transit',
                        label: `Design / Fab / Delivery (${
                          commercialRows.filter((r) => {
                            const s = normalizeHardwareStatus(r.po)
                            return s === 'Design' || s === 'Fabrication' || s === 'In Delivery'
                          }).length
                        })`,
                      },
                      {
                        id: 'delivered',
                        label: `Delivered (${commercialRows.filter((r) => normalizeHardwareStatus(r.po) === 'Delivered').length})`,
                      },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setRadarFilter(f.id)}
                      className={`rounded-full px-2 py-0.5 font-medium border transition-colors ${
                        radarFilter === f.id
                          ? 'border-primary bg-primary-soft text-primary'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400">Click status badges to update live</span>
              </div>

              <div className="overflow-x-auto max-h-60 overflow-y-auto -mx-3">
                {filteredRadarRows.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">No hardware deliverables match this filter.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-[11px] text-slate-500 text-left sticky top-0 bg-white border-b border-slate-100 z-10">
                      <tr className="whitespace-nowrap">
                        <th className="px-3 py-1.5 font-semibold">HRS.Deliverable</th>
                        <th className="px-2 py-1.5 font-semibold">Supplier</th>
                        <th className="px-2 py-1.5 font-semibold">Quote / PO</th>
                        <th className="px-2 py-1.5 font-semibold">Exp. Delivery</th>
                        <th className="px-3 py-1.5 font-semibold">HW Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRadarRows.map((row) => {
                        const w = row.workstream
                        const po = row.po
                        const hwStatus = normalizeHardwareStatus(po)
                        const late = po && !po.actualDelivery && isPast(po.expectedDelivery) && hwStatus !== 'Delivered'
                        const delivName = w.category === 'Others' && w.name !== 'Others' ? `Others (${w.name})` : w.name || w.category
                        return (
                          <tr key={w.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              <Link
                                to={`/projects/${w.projectId}?tab=deliverables`}
                                className="font-semibold text-primary hover:underline"
                                title={`Open Deliverables & Commercial tab for ${row.projectCode}.${delivName}`}
                              >
                                {row.projectCode}.{delivName}
                              </Link>
                            </td>
                            <td className="px-2 py-1.5 text-slate-600 truncate max-w-[110px]">{row.supplierName}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              {po?.number ? (
                                <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">
                                  PO: {po.number}
                                </span>
                              ) : row.quotation?.number ? (
                                <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-900">
                                  Q: {row.quotation.number}
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-600 font-medium">Pending Quote/PO</span>
                              )}
                            </td>
                            <td className={`px-2 py-1.5 whitespace-nowrap ${late ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                              {formatDate(po?.expectedDelivery || '')}
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              <div className="relative inline-flex items-center cursor-pointer" title="Click to update Hardware Status for this deliverable">
                                <CommercialBadge status={hwStatus} />
                                <select
                                  aria-label={`Update Hardware Status for ${row.projectCode}.${delivName}`}
                                  value={HARDWARE_STATUSES.includes(hwStatus as (typeof HARDWARE_STATUSES)[number]) ? hwStatus : 'Not Started'}
                                  onChange={async (e) => {
                                    const nextHw = e.target.value
                                    const base = rowToCommercialInput(row)
                                    await saveDeliverableCommercial(
                                      {
                                        ...emptyDeliverableCommercial(w.projectId, w.id, w.supplierId),
                                        ...base,
                                        deliveryStatus: nextHw,
                                      },
                                      true,
                                    )
                                  }}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                >
                                  {HARDWARE_STATUSES.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-slate-500">
                <b className="text-slate-600">Remarks:</b> Need PO and Design / Fab / Delivery show all active NPI; Delivered shows past 2 weeks to next 2 weeks only.
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <form onSubmit={addQuickNote} className="flex gap-1.5">
                <input
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Add a quick engineering reminder or follow-up note…"
                  className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button type="submit" size="sm" variant="primary">
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </form>

              <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
                {quickNotes.length === 0 ? (
                  <li className="py-8 text-center text-xs text-slate-400">No pinned notes yet. Add a quick reminder above.</li>
                ) : (
                  quickNotes.map((note) => (
                    <li key={note.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setQuickNotes((prev) =>
                            prev.map((n) => (n.id === note.id ? { ...n, done: !n.done } : n)),
                          )
                        }
                        className="flex items-center gap-2 min-w-0 text-left flex-1 hover:text-primary"
                      >
                        {note.done ? (
                          <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span className={note.done ? 'line-through text-slate-400 truncate' : 'text-slate-700 font-medium truncate'}>
                          {note.text}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickNotes((prev) => prev.filter((n) => n.id !== note.id))}
                        className="p-1 text-slate-400 hover:text-red-500 rounded"
                        title="Delete note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </Card>

        {/* RIGHT SLOT: Project Status (All Active Projects Excluding Completed) */}
        <Card
          title={`Project Status (${activeStatusProjects.length})`}
          action={<span className="text-xs text-slate-400">Active projects (excl. Completed) · Click status to update</span>}
          className="[&>div]:!p-3"
        >
          {activeStatusProjects.length === 0 ? (
            <EmptyState
              title="No active in-progress projects"
              hint="All projects are completed or archived."
            />
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto -mx-3">
              <table className="w-full text-xs">
                <thead className="text-[11px] text-slate-500 text-left sticky top-0 bg-white border-b border-slate-100 z-10">
                  <tr className="whitespace-nowrap">
                    <th className="px-3 py-1.5 font-semibold">HRS · Device Name</th>
                    <th className="px-2 py-1.5 font-semibold">HW Type</th>
                    <th className="px-2 py-1.5 font-semibold">Deliverables</th>
                    <th className="px-2 py-1.5 font-semibold">HW Required</th>
                    <th className="px-3 py-1.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStatusProjects.map((p) => {
                    const pDelivs = workstreams.filter((w) => w.projectId === p.id)
                    const pTasks = tasks.filter((t) => t.projectId === p.id)
                    const daysLeft = p.baselineDate ? daysUntil(p.baselineDate) : null
                    return (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/projects?project=${p.id}`)}
                        className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <FolderKanban className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="font-bold text-primary">{p.code}</span>
                            <span className="text-slate-400">·</span>
                            <span className="font-semibold text-slate-800 truncate max-w-[150px]" title={p.deviceName || p.name}>
                              {p.deviceName || p.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <Badge color="blue">{p.hwType || 'FT'}</Badge>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-slate-600">
                          {pDelivs.length} Deliv · {pTasks.length} Tasks
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {p.baselineDate ? (
                            <span className={daysLeft !== null && daysLeft < 0 ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                              {formatDate(p.baselineDate)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <InlineStatusSelect
                            value={p.status}
                            options={PROJECT_STATUSES}
                            onChange={async (next) => {
                              await updateProject(p.id, { ...p, status: next as ProjectStatus })
                            }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
