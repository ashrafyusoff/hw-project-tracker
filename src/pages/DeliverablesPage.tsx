import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Calendar, Check, Layers, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { HARDWARE_CATEGORIES, PRIORITIES, type Priority } from '@/types'
import { Badge, Button, Card, EmptyState, Input, Modal } from '@/components/ui'
import {
  buildDefaultSubTasks,
  computeTemplateSchedule,
  loadDeliverableTemplates,
  saveDeliverableTemplates,
  type DeliverableSubTaskTemplate,
  type DeliverableTemplate,
} from '@/services/deliverableTemplateService'
import { cn, newId, nowIso, todayStr } from '@/utils/helpers'

const PRIORITY_BAR: Record<Priority, string> = {
  Critical: 'bg-red-500 border-red-700 text-white',
  High: 'bg-amber-500 border-amber-600 text-white',
  Medium: 'bg-blue-600 border-blue-800 text-white',
  Low: 'bg-slate-500 border-slate-700 text-white',
}

export function DeliverablesPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<DeliverableTemplate[]>(() => loadDeliverableTemplates())
  const [selectedId, setSelectedId] = useState<string>(() => loadDeliverableTemplates()[0]?.id ?? '')
  const [previewStart, setPreviewStart] = useState<string>(todayStr())
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<string>('PCB')
  const [isDirty, setIsDirty] = useState(false)
  const [savedToast, setSavedToast] = useState('')
  const [pendingNav, setPendingNav] = useState<{ type: 'route'; to: string } | { type: 'select'; id: string } | null>(null)

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0] ?? null

  function showSaved(msg: string) {
    setSavedToast(msg)
    setTimeout(() => setSavedToast((m) => (m === msg ? '' : m)), 2800)
  }

  function saveAllPermanently(list = templates, toastMsg = 'Deliverable & tasks saved permanently') {
    saveDeliverableTemplates(list)
    setIsDirty(false)
    showSaved(toastMsg)
  }

  // Warn on browser tab close / reload if unsaved changes exist
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  // Intercept in-app link clicks (Sidebar / TopBar) when unsaved changes exist
  useEffect(() => {
    if (!isDirty) return
    const onClickCapture = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute('href') || ''
      const hashPath = href.startsWith('#') ? href.slice(1) : href
      if (!hashPath || hashPath === '/deliverables') return
      e.preventDefault()
      e.stopPropagation()
      setPendingNav({ type: 'route', to: hashPath })
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [isDirty])

  function updateSelectedDraft(updater: (t: DeliverableTemplate) => DeliverableTemplate) {
    if (!selected) return
    setTemplates((prev) =>
      prev.map((t) => (t.id === selected.id ? { ...updater(t), updatedAt: nowIso() } : t)),
    )
    setIsDirty(true)
  }

  function handleSelectTemplate(id: string) {
    if (id === selected?.id) return
    if (isDirty) {
      setPendingNav({ type: 'select', id })
      return
    }
    setSelectedId(id)
  }

  function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim() || newCategory
    const item: DeliverableTemplate = {
      id: newId(),
      name,
      category: newCategory,
      subTasks: buildDefaultSubTasks(),
      updatedAt: nowIso(),
    }
    const next = [...templates, item]
    setTemplates(next)
    saveDeliverableTemplates(next)
    setSelectedId(item.id)
    setNewName('')
    setIsDirty(false)
    showSaved(`Created & saved deliverable "${name}"`)
  }

  function handleDeleteTemplate(id: string) {
    const next = templates.filter((t) => t.id !== id)
    setTemplates(next)
    saveDeliverableTemplates(next)
    if (selected?.id === id) {
      setSelectedId(next[0]?.id ?? '')
      setIsDirty(false)
    }
    showSaved('Deliverable removed')
  }

  function addSubTask() {
    if (!selected) return
    const last = selected.subTasks[selected.subTasks.length - 1]
    const nextSub: DeliverableSubTaskTemplate = {
      id: newId(),
      name: 'New Task',
      workingDays: 2,
      dependsOnId: last?.id ?? '',
      priority: 'Medium',
    }
    updateSelectedDraft((t) => ({ ...t, subTasks: [...t.subTasks, nextSub] }))
  }

  function moveSubTask(index: number, direction: -1 | 1) {
    if (!selected) return
    const targetIdx = index + direction
    if (targetIdx < 0 || targetIdx >= selected.subTasks.length) return
    updateSelectedDraft((t) => {
      const list = [...t.subTasks]
      const [moved] = list.splice(index, 1)
      list.splice(targetIdx, 0, moved)
      return { ...t, subTasks: list }
    })
  }

  function updateSubTask(subId: string, patch: Partial<DeliverableSubTaskTemplate>) {
    updateSelectedDraft((t) => ({
      ...t,
      subTasks: t.subTasks.map((s) => (s.id === subId ? { ...s, ...patch } : s)),
    }))
  }

  function deleteSubTask(subId: string) {
    updateSelectedDraft((t) => ({
      ...t,
      subTasks: t.subTasks
        .filter((s) => s.id !== subId)
        .map((s) => (s.dependsOnId === subId ? { ...s, dependsOnId: '' } : s)),
    }))
  }

  function resetDefaultSubTasks() {
    if (!selected) return
    const next = templates.map((t) =>
      t.id === selected.id ? { ...t, subTasks: buildDefaultSubTasks(), updatedAt: nowIso() } : t,
    )
    setTemplates(next)
    saveAllPermanently(next, 'Reset to default 8 tasks & saved permanently')
  }

  function confirmSaveAndLeave() {
    saveAllPermanently(templates)
    const target = pendingNav
    setPendingNav(null)
    if (!target) return
    if (target.type === 'route') navigate(target.to)
    else setSelectedId(target.id)
  }

  function confirmDiscardAndLeave() {
    const saved = loadDeliverableTemplates()
    setTemplates(saved)
    setIsDirty(false)
    const target = pendingNav
    setPendingNav(null)
    if (!target) return
    if (target.type === 'route') navigate(target.to)
    else setSelectedId(target.id)
  }

  const schedule = useMemo(() => {
    if (!selected) return []
    return computeTemplateSchedule(selected.subTasks, previewStart)
  }, [selected, previewStart])

  const totalWorkingDays = useMemo(() => {
    if (schedule.length === 0) return 0
    return Math.max(...schedule.map((s) => s.endOffsetDays + 1))
  }, [schedule])

  return (
    <div className="space-y-4">
      {savedToast && (
        <div
          role="status"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-900 shadow-lg"
        >
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          {savedToast}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-4 items-start">
        {/* LEFT: Deliverable Sets List + Create New Deliverable */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          <Card title="New Deliverable Set">
            <form onSubmit={handleCreateTemplate} className="space-y-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Deliverable Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Custom Load Board"
                  className="!py-1.5 !text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {HARDWARE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="primary" size="sm" className="w-full">
                <Plus className="h-3.5 w-3.5" /> Create & Save Deliverable
              </Button>
            </form>
          </Card>

          <Card title={`Saved Deliverables (${templates.length})`} className="[&>div]:!p-2">
            {templates.length === 0 ? (
              <EmptyState title="No deliverable templates" hint="Create a deliverable set above." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {templates.map((t) => {
                  const active = selected?.id === t.id
                  return (
                    <li
                      key={t.id}
                      onClick={() => handleSelectTemplate(t.id)}
                      className={cn(
                        'flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-colors text-xs',
                        active ? 'bg-primary-soft text-primary font-semibold' : 'hover:bg-slate-50 text-slate-700',
                      )}
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate">{t.name}</p>
                          <p className="text-[10px] text-slate-400 font-normal">
                            {t.category} · {t.subTasks.length} tasks
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id) }}
                        className="p-1 text-slate-400 hover:text-red-500 rounded"
                        title="Delete deliverable template"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* RIGHT: Sub-Task Configuration & MS Project-style Gantt Chart */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {!selected ? (
            <Card>
              <EmptyState title="Select or create a deliverable template" />
            </Card>
          ) : (
            <>
              <Card
                title={`Deliverable Tasks Setup — ${selected.name}`}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    {isDirty ? (
                      <Badge color="amber">Unsaved changes</Badge>
                    ) : (
                      <Badge color="green">Saved</Badge>
                    )}
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>Preview Start:</span>
                      <input
                        type="date"
                        value={previewStart}
                        onChange={(e) => setPreviewStart(e.target.value)}
                        className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
                      />
                    </label>
                    <Button size="sm" onClick={resetDefaultSubTasks} title="Reset to default 8-step process">
                      <RotateCcw className="h-3.5 w-3.5" /> Default 8 Tasks
                    </Button>
                    <Button size="sm" onClick={addSubTask}>
                      <Plus className="h-3.5 w-3.5" /> Add Task
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => saveAllPermanently(templates)}
                      title="Save deliverable and tasks permanently"
                    >
                      <Save className="h-3.5 w-3.5" /> Save Deliverable
                    </Button>
                  </div>
                }
              >
                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Deliverable Name</label>
                    <Input
                      value={selected.name}
                      onChange={(e) => updateSelectedDraft((t) => ({ ...t, name: e.target.value }))}
                      className="!py-1.5 !text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Hardware Category</label>
                    <select
                      value={selected.category}
                      onChange={(e) => updateSelectedDraft((t) => ({ ...t, category: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {HARDWARE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mb-2">
                  Use the Up/Down arrows to rearrange tasks, set working days and dependencies, then click <b>Save Deliverable</b>. Every task created for a deliverable is a real Task (shown in the Tasks tab and on the Overview calendar on its due date).
                </p>

                <div className="overflow-x-auto -mx-4">
                  <table className="w-full text-xs">
                    <thead className="text-[11px] text-slate-500 bg-slate-50 border-y border-slate-200">
                      <tr>
                        <th className="px-2 py-2 text-center font-semibold w-20">Order</th>
                        <th className="px-2 py-2 text-left font-semibold">Task Name</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">Working Days</th>
                        <th className="px-2 py-2 text-left font-semibold">Depends On (Predecessor)</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">Priority</th>
                        <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">Start Date</th>
                        <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">Due Date</th>
                        <th className="px-2 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((item, idx) => {
                        const sub = item.subTask
                        return (
                          <tr key={sub.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <div className="inline-flex items-center gap-0.5">
                                <span className="w-5 text-center font-semibold text-slate-400">{idx + 1}</span>
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => moveSubTask(idx, -1)}
                                  className="p-1 rounded hover:bg-slate-200/70 text-slate-600 disabled:opacity-30 disabled:pointer-events-none"
                                  title="Move task up"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === schedule.length - 1}
                                  onClick={() => moveSubTask(idx, 1)}
                                  className="p-1 rounded hover:bg-slate-200/70 text-slate-600 disabled:opacity-30 disabled:pointer-events-none"
                                  title="Move task down"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={sub.name}
                                onChange={(e) => updateSubTask(sub.id, { name: e.target.value })}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                min={1}
                                max={365}
                                value={sub.workingDays}
                                onChange={(e) => updateSubTask(sub.id, { workingDays: Math.max(1, Number(e.target.value) || 1) })}
                                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 text-center focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <select
                                value={sub.dependsOnId}
                                onChange={(e) => updateSubTask(sub.id, { dependsOnId: e.target.value })}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                <option value="">— None (Starts Day 1) —</option>
                                {selected.subTasks
                                  .filter((other) => other.id !== sub.id)
                                  .map((other, oIdx) => (
                                    <option key={other.id} value={other.id}>
                                      #{selected.subTasks.findIndex((x) => x.id === other.id) + 1} {other.name || `Step ${oIdx + 1}`}
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <select
                                value={sub.priority}
                                onChange={(e) => updateSubTask(sub.id, { priority: e.target.value as Priority })}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                {PRIORITIES.map((p) => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{item.startDate}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{item.dueDate}</td>
                            <td className="px-2 py-1.5 text-right">
                              <button
                                type="button"
                                onClick={() => deleteSubTask(sub.id)}
                                className="p-1 text-slate-400 hover:text-red-500 rounded"
                                title="Remove task"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* MS Project-style Gantt Chart */}
              <Card
                title="Gantt Chart Schedule (Working Days)"
                action={
                  <span className="text-xs font-semibold text-slate-600">
                    Total Lead Time: <span className="text-primary">{totalWorkingDays} working days</span>
                  </span>
                }
              >
                {schedule.length === 0 ? (
                  <EmptyState title="No tasks to display" />
                ) : (
                  <div className="overflow-x-auto -mx-4 -mb-4 border-t border-slate-200">
                    <div className="min-w-[760px]">
                      {/* Gantt Header */}
                      <div className="grid grid-cols-[260px_1fr] bg-slate-100 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                        <div className="px-3 py-2 border-r border-slate-200 flex justify-between">
                          <span>Task Name</span>
                          <span>Duration</span>
                        </div>
                        <div className="relative flex">
                          {Array.from({ length: Math.max(totalWorkingDays, 1) }, (_, d) => (
                            <div
                              key={d}
                              className="flex-1 min-w-[22px] text-center py-2 border-r last:border-r-0 border-slate-200/70 text-[10px]"
                            >
                              D{d + 1}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Gantt Rows */}
                      {schedule.map((item, idx) => {
                        const sub = item.subTask
                        const total = Math.max(totalWorkingDays, 1)
                        const leftPct = (item.startOffsetDays / total) * 100
                        const widthPct = (Math.max(1, sub.workingDays) / total) * 100
                        const depIdx = sub.dependsOnId
                          ? selected.subTasks.findIndex((x) => x.id === sub.dependsOnId)
                          : -1
                        return (
                          <div
                            key={sub.id}
                            className="grid grid-cols-[260px_1fr] border-b last:border-b-0 border-slate-100 hover:bg-slate-50/70 items-center"
                          >
                            <div className="px-3 py-2 border-r border-slate-200 flex items-center justify-between gap-2 text-xs min-w-0">
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-800 truncate block">
                                  {idx + 1}. {sub.name}
                                </span>
                                {depIdx >= 0 && (
                                  <span className="text-[10px] text-slate-400">
                                    After #{depIdx + 1} ({selected.subTasks[depIdx]?.name})
                                  </span>
                                )}
                              </div>
                              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {sub.workingDays}d
                              </span>
                            </div>

                            <div className="relative h-9 flex items-center px-1">
                              {/* Vertical day grid lines */}
                              <div className="absolute inset-0 flex pointer-events-none">
                                {Array.from({ length: total }, (_, d) => (
                                  <div key={d} className="flex-1 border-r last:border-r-0 border-slate-100" />
                                ))}
                              </div>
                              {/* Gantt Bar */}
                              <div
                                title={`${sub.name}: ${item.startDate} → Due ${item.dueDate} (${sub.workingDays} working days)`}
                                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                className={cn(
                                  'absolute h-5 rounded border shadow-sm flex items-center px-1.5 text-[10px] font-semibold truncate transition-all',
                                  PRIORITY_BAR[sub.priority],
                                )}
                              >
                                {sub.workingDays}d
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Unsaved Changes Pop-Up Reminder Modal */}
      <Modal
        open={!!pendingNav}
        onClose={() => setPendingNav(null)}
        title="Unsaved Deliverable Changes"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            You have unsaved task changes for <b>{selected?.name}</b>. Would you like to save your deliverable tasks permanently before leaving?
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setPendingNav(null)}>Stay on Page</Button>
            <Button variant="danger" onClick={confirmDiscardAndLeave}>
              Leave Without Saving
            </Button>
            <Button variant="primary" onClick={confirmSaveAndLeave}>
              <Save className="h-3.5 w-3.5" /> Save & Leave
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
