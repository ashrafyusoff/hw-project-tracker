import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Check, CheckSquare, GripVertical, Layers, Plus, RotateCcw, Save, Star, Trash2 } from 'lucide-react'
import { PRIORITIES, type Priority } from '@/types'
import { Badge, Button, Card, EmptyState, Input, Modal } from '@/components/ui'
import {
  addWorkingDays,
  buildDefaultSubTasks,
  computeTemplateSchedule,
  loadDeliverableTemplates,
  parseYmdLocal,
  saveDeliverableTemplates,
  type DeliverableSubTaskTemplate,
  type DeliverableTemplate,
} from '@/services/deliverableTemplateService'
import { getIsoWeek } from '@/features/overview/WorkWeekCalendar'
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
  const [createError, setCreateError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [savedToast, setSavedToast] = useState('')
  const [pendingNav, setPendingNav] = useState<{ type: 'route'; to: string } | { type: 'select'; id: string } | null>(null)
  const [draggingSubId, setDraggingSubId] = useState('')
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())
  const prevRowRects = useRef<Map<string, DOMRect>>(new Map())
  const lastRowSwapRef = useRef<{ toIdx: number; time: number }>({ toIdx: -1, time: 0 })
  const ganttTrackRef = useRef<HTMLDivElement>(null)
  const [measuredTrackWidth, setMeasuredTrackWidth] = useState(0)

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0] ?? null

  useEffect(() => {
    const el = ganttTrackRef.current
    if (!el) return
    const update = () => setMeasuredTrackWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [selected?.id, selected?.subTasks.length])

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
    const name = newName.trim()
    if (!name) {
      setCreateError('Please enter a deliverable name.')
      return
    }
    if (templates.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setCreateError(`"${name}" already exists.`)
      return
    }
    setCreateError('')
    const item: DeliverableTemplate = {
      id: newId(),
      name,
      category: name,
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

  function captureRowRects() {
    const rects = new Map<string, DOMRect>()
    rowRefs.current.forEach((el, id) => {
      rects.set(id, el.getBoundingClientRect())
    })
    prevRowRects.current = rects
  }

  // Smooth Apple-style FLIP animation when task rows slide up or down to make space
  useLayoutEffect(() => {
    if (prevRowRects.current.size === 0) return
    const prev = prevRowRects.current
    prevRowRects.current = new Map()
    rowRefs.current.forEach((el, id) => {
      if (id === draggingSubId) return
      const oldRect = prev.get(id)
      if (!oldRect) return
      const newRect = el.getBoundingClientRect()
      const dy = oldRect.top - newRect.top
      if (Math.abs(dy) > 1) {
        el.getAnimations().forEach((a) => a.cancel())
        el.animate(
          [
            { transform: `translateY(${dy}px)` },
            { transform: 'translateY(0)' },
          ],
          {
            duration: 420,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          },
        )
      }
    })
  }, [selected?.subTasks, draggingSubId])

  /** Hold-and-slide reordering: move a task to the position currently under the pointer. */
  function moveSubTaskTo(subId: string, toIdx: number) {
    if (!selected) return
    const from = selected.subTasks.findIndex((s) => s.id === subId)
    if (from < 0 || from === toIdx) return
    const now = performance.now()
    if (lastRowSwapRef.current.toIdx === toIdx && now - lastRowSwapRef.current.time < 220) return
    lastRowSwapRef.current = { toIdx, time: now }
    captureRowRects()
    const selectedTemplateId = selected.id
    setTemplates((prev) =>
      prev.map((t) => {
        if (t.id !== selectedTemplateId) return t
        const list = [...t.subTasks]
        const idx = list.findIndex((s) => s.id === subId)
        if (idx < 0) return t
        const [moved] = list.splice(idx, 1)
        list.splice(toIdx, 0, moved)
        return { ...t, subTasks: list, updatedAt: nowIso() }
      }),
    )
    setIsDirty(true)
  }

  function rowIndexAtPointer(clientY: number, currentSubId: string): number {
    if (!selected) return -1
    const ids = selected.subTasks.map((s) => s.id)
    const fromIdx = ids.indexOf(currentSubId)
    if (fromIdx < 0) return -1

    for (let i = 0; i < ids.length; i++) {
      if (i === fromIdx) continue
      const el = rowRefs.current.get(ids[i])
      if (!el) continue
      const r = el.getBoundingClientRect()
      const midY = r.top + r.height / 2
      if (i < fromIdx && clientY < midY) return i
      if (i > fromIdx && clientY > midY) return i
    }
    return fromIdx
  }

  function handleSlidePointerDown(e: React.PointerEvent<HTMLButtonElement>, subId: string) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    lastRowSwapRef.current = { toIdx: -1, time: 0 }
    setDraggingSubId(subId)
  }

  function handleSlidePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!draggingSubId) return
    const target = rowIndexAtPointer(e.clientY, draggingSubId)
    if (target >= 0) moveSubTaskTo(draggingSubId, target)
  }

  function handleSlidePointerEnd(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDraggingSubId('')
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
                  onChange={(e) => { setNewName(e.target.value); setCreateError('') }}
                  placeholder="e.g. PCB, Socket, Probe Card"
                  className="!py-1.5 !text-xs"
                />
                {createError && <p className="mt-1 text-[11px] text-red-600">{createError}</p>}
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
                            {t.subTasks.length} tasks
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
                <div className="mb-3 max-w-sm">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Deliverable Name</label>
                  <Input
                    value={selected.name}
                    onChange={(e) => updateSelectedDraft((t) => ({ ...t, name: e.target.value, category: e.target.value }))}
                    className="!py-1.5 !text-xs"
                  />
                </div>

                <p className="text-xs text-slate-500 mb-2">
                  Hold the grip button and slide a task up or down to rearrange it. Set working days and dependencies, then click <b>Save Deliverable</b>. Each task created for a deliverable is a real Task and appears on the Overview calendar on its due date.
                </p>

                <div className="overflow-x-auto -mx-4">
                  <table className="w-full text-xs">
                    <thead className="text-[11px] text-slate-500 bg-slate-50 border-y border-slate-200">
                      <tr>
                        <th className="px-2 py-2 text-center font-semibold w-20">Order</th>
                        <th className="px-2 py-2 text-left font-semibold w-28">Type</th>
                        <th className="px-2 py-2 text-left font-semibold">Name</th>
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
                          <tr
                            key={sub.id}
                            ref={(el) => {
                              if (el) rowRefs.current.set(sub.id, el)
                              else rowRefs.current.delete(sub.id)
                            }}
                            className={cn(
                              'border-b border-slate-100 hover:bg-slate-50/70 transition-all duration-200',
                              draggingSubId === sub.id && 'bg-primary-soft shadow-md ring-1 ring-inset ring-primary/40 relative z-10',
                            )}
                          >
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onPointerDown={(e) => handleSlidePointerDown(e, sub.id)}
                                  onPointerMove={handleSlidePointerMove}
                                  onPointerUp={handleSlidePointerEnd}
                                  onPointerCancel={handleSlidePointerEnd}
                                  style={{ touchAction: 'none' }}
                                  className={cn(
                                    'p-1 rounded-lg text-slate-500 hover:bg-slate-200/70 select-none',
                                    draggingSubId === sub.id ? 'cursor-grabbing bg-slate-200' : 'cursor-grab',
                                  )}
                                  title="Hold and slide up or down to rearrange"
                                  aria-label="Hold and slide to rearrange task"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                                <span className="w-5 text-center font-semibold text-slate-400">{idx + 1}</span>
                              </div>
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  const nextKind = sub.kind === 'milestone' ? 'task' : 'milestone'
                                  updateSubTask(
                                    sub.id,
                                    nextKind === 'milestone'
                                      ? { kind: 'milestone', workingDays: 1 }
                                      : { kind: 'task' },
                                  )
                                }}
                                title="Click to switch between Task and Milestone"
                                className={cn(
                                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors',
                                  sub.kind === 'milestone'
                                    ? 'border-purple-500 bg-purple-100/95 text-purple-950 hover:bg-purple-200'
                                    : 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100',
                                )}
                              >
                                {sub.kind === 'milestone' ? (
                                  <>
                                    <Star className="h-3 w-3 text-amber-500 fill-amber-400 shrink-0" />
                                    <span>Milestone</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckSquare className="h-3 w-3 text-primary shrink-0" />
                                    <span>Task</span>
                                  </>
                                )}
                              </button>
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
                                disabled={sub.kind === 'milestone'}
                                readOnly={sub.kind === 'milestone'}
                                value={sub.kind === 'milestone' ? 1 : sub.workingDays}
                                onChange={(e) => updateSubTask(sub.id, { workingDays: Math.max(1, Number(e.target.value) || 1) })}
                                title={sub.kind === 'milestone' ? 'Milestones are fixed at 1 working day' : 'Edit working days'}
                                className={cn(
                                  'w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 text-center focus:outline-none focus:ring-1 focus:ring-primary',
                                  sub.kind === 'milestone' && 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-75',
                                )}
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

              {/* MS Project-style Gantt Chart (Workweek Header, Exact Grid Alignment, Auto Dependency Arrows, Editable Days, No Hover) */}
              <Card
                title="Gantt Chart Schedule (Workweeks & Working Days)"
                action={
                  <span className="text-xs font-semibold text-slate-600">
                    Total Lead Time: <span className="text-primary">{totalWorkingDays} working days</span> ({Math.ceil(Math.max(totalWorkingDays, 1) / 5)} workweeks)
                  </span>
                }
              >
                {schedule.length === 0 ? (
                  <EmptyState title="No tasks to display" />
                ) : (() => {
                  const MIN_DAY_W = 24
                  const ROW_H = 34
                  const totalWeeks = Math.max(1, Math.ceil(Math.max(totalWorkingDays, 5) / 5))
                  const totalDays = totalWeeks * 5
                  const minTrackWidth = totalDays * MIN_DAY_W
                  const trackWidth = Math.max(minTrackWidth, measuredTrackWidth)
                  const dayW = trackWidth / totalDays
                  const weekBlocks = Array.from({ length: totalWeeks }, (_, wIdx) => {
                    const firstDayDate = addWorkingDays(previewStart, wIdx * 5 + 1)
                    const isoWw = getIsoWeek(parseYmdLocal(firstDayDate))
                    return {
                      wIdx,
                      label: `WW${String(isoWw).padStart(2, '0')} (W${wIdx + 1})`,
                      startDayNum: wIdx * 5 + 1,
                    }
                  })

                  return (
                    <div className="overflow-x-auto -mx-4 -mb-4 border-t border-slate-200">
                      <div className="w-full align-top" style={{ minWidth: 235 + minTrackWidth }}>
                        {/* Gantt Header: Left Task/Days column + Right Workweek Header (only WW) */}
                        <div className="flex bg-slate-100 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                          <div className="w-[235px] shrink-0 px-2.5 py-1.5 border-r border-slate-200 flex items-center justify-between">
                            <span>Task / Milestone</span>
                            <span>Days (Edit)</span>
                          </div>
                          <div className="flex-1 flex" style={{ minWidth: minTrackWidth }}>
                            {weekBlocks.map((wb) => (
                              <div
                                key={wb.wIdx}
                                className="flex-1 text-center py-1.5 border-r last:border-r-0 border-slate-300 text-[11px] font-bold text-slate-700"
                              >
                                {wb.label}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Gantt Body: Left Task List (with editable days) + Right Timeline Track with SVG Dependency Arrows */}
                        <div className="flex">
                          {/* Left Column: Task Name + Inline Editable Working Days */}
                          <div className="w-[235px] shrink-0 border-r border-slate-200">
                            {schedule.map((item, idx) => {
                              const sub = item.subTask
                              const depIdx = sub.dependsOnId
                                ? selected.subTasks.findIndex((x) => x.id === sub.dependsOnId)
                                : -1
                              return (
                                <div
                                  key={sub.id}
                                  style={{ height: ROW_H }}
                                  className="px-2.5 border-b last:border-b-0 border-slate-100 flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="min-w-0 flex-1">
                                    <span className="font-semibold text-slate-800 truncate block leading-tight">
                                      {idx + 1}. {sub.name}
                                    </span>
                                    {depIdx >= 0 && (
                                      <span className="text-[10px] text-slate-400 truncate block leading-tight">
                                        → After #{depIdx + 1} ({selected.subTasks[depIdx]?.name})
                                      </span>
                                    )}
                                  </div>
                                  <label className="inline-flex items-center gap-1 shrink-0">
                                    <input
                                      type="number"
                                      min={1}
                                      max={365}
                                      disabled={sub.kind === 'milestone'}
                                      readOnly={sub.kind === 'milestone'}
                                      value={sub.kind === 'milestone' ? 1 : sub.workingDays}
                                      onChange={(e) =>
                                        updateSubTask(sub.id, {
                                          workingDays: Math.max(1, Number(e.target.value) || 1),
                                        })
                                      }
                                      className={cn(
                                        'w-11 rounded border border-slate-200 bg-white px-1 py-0.5 text-center text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary',
                                        sub.kind === 'milestone' && 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-75',
                                      )}
                                      title={sub.kind === 'milestone' ? 'Milestones are fixed at 1 working day' : 'Edit working days directly'}
                                    />
                                    <span className="text-[10px] font-medium text-slate-500">d</span>
                                  </label>
                                </div>
                              )
                            })}
                          </div>

                          {/* Right Timeline Track: Full-width responsive grid + Overlapping Bars + Automatic SVG Dependency Arrows */}
                          <div
                            ref={ganttTrackRef}
                            className="relative flex-1"
                            style={{ minWidth: minTrackWidth, height: schedule.length * ROW_H }}
                          >
                            {/* Vertical Working Day & Workweek Grid Lines */}
                            <div className="absolute inset-0 flex pointer-events-none">
                              {Array.from({ length: totalDays }, (_, d) => (
                                <div
                                  key={d}
                                  className={cn(
                                    'flex-1 h-full border-r last:border-r-0',
                                    (d + 1) % 5 === 0 ? 'border-slate-300/80' : 'border-slate-100',
                                  )}
                                />
                              ))}
                            </div>

                            {/* Horizontal Row Dividers & Gantt Bars */}
                            {schedule.map((item) => {
                              const sub = item.subTask
                              const barLeft = item.startOffsetDays * dayW
                              const barWidth = (sub.kind === 'milestone' ? 1 : Math.max(1, sub.workingDays)) * dayW
                              return (
                                <div
                                  key={sub.id}
                                  style={{ height: ROW_H }}
                                  className="relative border-b last:border-b-0 border-slate-100 flex items-center"
                                >
                                  <div
                                    title={`${sub.name} (${sub.kind === 'milestone' ? 'Milestone' : 'Task'}): ${item.startDate} → Due ${item.dueDate} (${sub.kind === 'milestone' ? 1 : sub.workingDays} working day${(sub.kind === 'milestone' ? 1 : sub.workingDays) > 1 ? 's' : ''})`}
                                    style={{ left: barLeft + 2, width: Math.max(barWidth - 4, 14) }}
                                    className={cn(
                                      'absolute h-4 rounded-full border shadow-sm z-10',
                                      sub.kind === 'milestone'
                                        ? 'bg-purple-600 border-purple-400'
                                        : PRIORITY_BAR[sub.priority],
                                    )}
                                  />
                                </div>
                              )
                            })}

                            {/* Automatic SVG Dependency Arrows (Finish-to-Start) */}
                            <svg
                              width={trackWidth}
                              height={schedule.length * ROW_H}
                              className="absolute inset-0 pointer-events-none z-20"
                            >
                              <defs>
                                <marker
                                  id="gantt-dep-arrow"
                                  viewBox="0 0 8 8"
                                  refX="6"
                                  refY="4"
                                  markerWidth="6"
                                  markerHeight="6"
                                  orient="auto"
                                >
                                  <path d="M 0 1 L 7 4 L 0 7 z" fill="#475569" />
                                </marker>
                              </defs>
                              {schedule.map((item, idx) => {
                                const depId = item.subTask.dependsOnId
                                if (!depId) return null
                                const depIdx = schedule.findIndex((x) => x.subTask.id === depId)
                                if (depIdx < 0) return null
                                const depItem = schedule[depIdx]

                                const x1 = (depItem.endOffsetDays + 1) * dayW - 2
                                const y1 = depIdx * ROW_H + ROW_H / 2
                                const x2 = item.startOffsetDays * dayW + 2
                                const y2 = idx * ROW_H + ROW_H / 2
                                const turnY = y1 < y2 ? y1 + ROW_H / 2 : y1 - ROW_H / 2

                                const pathD =
                                  x2 >= x1 + 6
                                    ? `M ${x1} ${y1} L ${x1 + 6} ${y1} L ${x1 + 6} ${y2} L ${x2} ${y2}`
                                    : `M ${x1} ${y1} L ${x1 + 6} ${y1} L ${x1 + 6} ${turnY} L ${x2 - 8} ${turnY} L ${x2 - 8} ${y2} L ${x2} ${y2}`

                                return (
                                  <path
                                    key={`${depId}->${item.subTask.id}`}
                                    d={pathD}
                                    fill="none"
                                    stroke="#475569"
                                    strokeWidth="1.5"
                                    markerEnd="url(#gantt-dep-arrow)"
                                  />
                                )
                              })}
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
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
