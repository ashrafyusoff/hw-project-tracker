import { db } from '@/database/db'
import type { Priority } from '@/types'
import { newId, nowIso, todayStr } from '@/utils/helpers'
import { logActivity } from './activityService'

export interface DeliverableSubTaskTemplate {
  id: string
  name: string
  kind?: 'task' | 'milestone'
  workingDays: number
  dependsOnId: string // '' = none, otherwise id of predecessor sub-task in same deliverable
  priority: Priority
}

export interface DeliverableTemplate {
  id: string
  name: string
  category: string
  subTasks: DeliverableSubTaskTemplate[]
  updatedAt: string
}

const STORAGE_KEY = 'npi.deliverableTemplates.v1'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function formatYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function isWeekendDate(d: Date): boolean {
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

/** Snap a date forward to Monday if it falls on Saturday or Sunday. */
export function snapForwardToWorkday(ymd: string): string {
  const d = parseYmdLocal(ymd)
  while (isWeekendDate(d)) d.setDate(d.getDate() + 1)
  return formatYmdLocal(d)
}

/** Returns the next working day after `ymd` (Finish-to-Start dependency). */
export function nextWorkingDay(ymd: string): string {
  const d = parseYmdLocal(ymd)
  d.setDate(d.getDate() + 1)
  while (isWeekendDate(d)) d.setDate(d.getDate() + 1)
  return formatYmdLocal(d)
}

/** Adds `workingDays` duration (1 working day = same day if weekday; N working days = N-1 working steps forward). */
export function addWorkingDays(startYmd: string, workingDays: number): string {
  const days = Math.max(1, Math.round(workingDays || 1))
  const d = parseYmdLocal(snapForwardToWorkday(startYmd))
  let remaining = days - 1
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    if (!isWeekendDate(d)) remaining--
  }
  return formatYmdLocal(d)
}

/** Counts working days between two YYYY-MM-DD dates (inclusive). */
export function countWorkingDays(startYmd: string, endYmd: string): number {
  if (!startYmd || !endYmd || endYmd < startYmd) return 1
  const cur = parseYmdLocal(startYmd)
  const end = parseYmdLocal(endYmd)
  let count = 0
  let guard = 0
  while (cur <= end && guard < 1000) {
    if (!isWeekendDate(cur)) count++
    cur.setDate(cur.getDate() + 1)
    guard++
  }
  return Math.max(1, count)
}

function buildDesignDeliverableSubTasks(): DeliverableSubTaskTemplate[] {
  const qId = newId()
  const petId = newId()
  const poId = newId()
  const schId = newId()
  const schRevId = newId()
  const layId = newId()
  const layRevId = newId()
  const fabId = newId()
  const shipId = newId()
  const delivId = newId()
  // 20-week (100 working days) workflow for PCB & Probe Card
  return [
    { id: qId, name: 'Quotation', workingDays: 5, dependsOnId: '', priority: 'Medium' },
    { id: petId, name: 'PET', workingDays: 5, dependsOnId: qId, priority: 'Medium' },
    { id: poId, name: 'PO', workingDays: 5, dependsOnId: petId, priority: 'High' },
    { id: schId, name: 'Schematic', workingDays: 10, dependsOnId: poId, priority: 'High' },
    { id: schRevId, name: 'Schematic Review', workingDays: 5, dependsOnId: schId, priority: 'High' },
    { id: layId, name: 'Layout', workingDays: 15, dependsOnId: schRevId, priority: 'High' },
    { id: layRevId, name: 'Layout Review', workingDays: 5, dependsOnId: layId, priority: 'High' },
    { id: fabId, name: 'Fab', workingDays: 40, dependsOnId: layRevId, priority: 'Critical' },
    { id: shipId, name: 'Shipment', workingDays: 9, dependsOnId: fabId, priority: 'Medium' },
    { id: delivId, name: 'Delivered', kind: 'milestone', workingDays: 1, dependsOnId: shipId, priority: 'Medium' },
  ]
}

function buildFabOnlyDeliverableSubTasks(): DeliverableSubTaskTemplate[] {
  const qId = newId()
  const petId = newId()
  const poId = newId()
  const fabId = newId()
  const shipId = newId()
  const delivId = newId()
  // No design stage; 12-week (60 working days) fabrication for Stiffener, Socket & Handler Kit
  return [
    { id: qId, name: 'Quotation', workingDays: 5, dependsOnId: '', priority: 'Medium' },
    { id: petId, name: 'PET', workingDays: 5, dependsOnId: qId, priority: 'Medium' },
    { id: poId, name: 'PO', workingDays: 5, dependsOnId: petId, priority: 'High' },
    { id: fabId, name: 'Fab', workingDays: 60, dependsOnId: poId, priority: 'Critical' },
    { id: shipId, name: 'Shipment', workingDays: 5, dependsOnId: fabId, priority: 'Medium' },
    { id: delivId, name: 'Delivered', kind: 'milestone', workingDays: 1, dependsOnId: shipId, priority: 'Medium' },
  ]
}

export function buildDefaultSubTasks(categoryOrName = ''): DeliverableSubTaskTemplate[] {
  const key = categoryOrName.trim().toLowerCase()
  if (key === 'pcb' || key === 'probe card' || key === 'probe head') {
    return buildDesignDeliverableSubTasks()
  }
  if (key === 'stiffener' || key === 'socket' || key === 'handler kit') {
    return buildFabOnlyDeliverableSubTasks()
  }
  const qId = newId()
  const petId = newId()
  const poId = newId()
  const designId = newId()
  const revId = newId()
  const fabId = newId()
  const shipId = newId()
  const delivId = newId()
  return [
    { id: qId, name: 'Quotation', workingDays: 2, dependsOnId: '', priority: 'Medium' },
    { id: petId, name: 'PET', workingDays: 3, dependsOnId: qId, priority: 'Medium' },
    { id: poId, name: 'PO', workingDays: 2, dependsOnId: petId, priority: 'High' },
    { id: designId, name: 'Design', workingDays: 5, dependsOnId: poId, priority: 'High' },
    { id: revId, name: 'Review', workingDays: 2, dependsOnId: designId, priority: 'High' },
    { id: fabId, name: 'Fab', workingDays: 10, dependsOnId: revId, priority: 'Critical' },
    { id: shipId, name: 'Shipment', workingDays: 3, dependsOnId: fabId, priority: 'Medium' },
    { id: delivId, name: 'Delivered', kind: 'milestone', workingDays: 1, dependsOnId: shipId, priority: 'Medium' },
  ]
}

const DEFAULT_CATEGORIES = ['PCB', 'Socket', 'Handler Kit', 'Stiffener', 'Probe Card', 'Probe Head']

function createInitialTemplates(): DeliverableTemplate[] {
  const now = nowIso()
  return DEFAULT_CATEGORIES.map((cat) => ({
    id: newId(),
    name: cat,
    category: cat,
    subTasks: buildDefaultSubTasks(cat),
    updatedAt: now,
  }))
}

const LEGACY_8_STEP_NAMES = ['Quotation', 'PET', 'PO', 'Design', 'Review', 'Fab', 'Shipment', 'Delivered']

function isUntouchedLegacyTemplate(t: DeliverableTemplate): boolean {
  if (t.subTasks.length !== LEGACY_8_STEP_NAMES.length) return false
  return t.subTasks.every((s, idx) => s.name === LEGACY_8_STEP_NAMES[idx])
}

export function loadDeliverableTemplates(): DeliverableTemplate[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DeliverableTemplate[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        let migrated = false
        const upgraded = parsed.map((t) => {
          const key = (t.name || t.category || '').trim().toLowerCase()
          const isBuiltInTailored =
            key === 'pcb' || key === 'probe card' || key === 'probe head' || key === 'stiffener' || key === 'socket' || key === 'handler kit'
          if (isBuiltInTailored && isUntouchedLegacyTemplate(t)) {
            migrated = true
            return { ...t, subTasks: buildDefaultSubTasks(t.name || t.category), updatedAt: nowIso() }
          }
          return t
        })
        if (migrated) saveDeliverableTemplates(upgraded)
        return upgraded
      }
    }
  } catch {
    // ignore storage errors
  }
  const initial = createInitialTemplates()
  saveDeliverableTemplates(initial)
  return initial
}

export function saveDeliverableTemplates(list: DeliverableTemplate[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore storage errors
  }
}

export interface ScheduledSubTask {
  subTask: DeliverableSubTaskTemplate
  startOffsetDays: number // 0-based working day offset
  endOffsetDays: number   // inclusive 0-based working day offset
  startDate: string
  dueDate: string
}

/** Resolves dependencies (Finish-to-Start) and working-day durations into a schedule for Gantt & task generation. */
export function computeTemplateSchedule(
  subTasks: DeliverableSubTaskTemplate[],
  baseStartYmd: string,
): ScheduledSubTask[] {
  const baseStart = snapForwardToWorkday(baseStartYmd || todayStr())
  const byId = new Map(subTasks.map((s) => [s.id, s]))
  const memo = new Map<string, ScheduledSubTask>()
  const visiting = new Set<string>()

  function resolve(sub: DeliverableSubTaskTemplate): ScheduledSubTask {
    const cached = memo.get(sub.id)
    if (cached) return cached
    if (visiting.has(sub.id)) {
      // Cycle guard: fallback to baseStart
      const dur = sub.kind === 'milestone' ? 1 : Math.max(1, Math.round(sub.workingDays || 1))
      const res: ScheduledSubTask = {
        subTask: sub,
        startOffsetDays: 0,
        endOffsetDays: dur - 1,
        startDate: baseStart,
        dueDate: addWorkingDays(baseStart, dur),
      }
      memo.set(sub.id, res)
      return res
    }
    visiting.add(sub.id)
    const dur = sub.kind === 'milestone' ? 1 : Math.max(1, Math.round(sub.workingDays || 1))
    const dep = sub.dependsOnId ? byId.get(sub.dependsOnId) : undefined
    let startOffset = 0
    let startDate = baseStart
    if (dep) {
      const depSched = resolve(dep)
      startOffset = depSched.endOffsetDays + 1
      startDate = nextWorkingDay(depSched.dueDate)
    }
    const dueDate = addWorkingDays(startDate, dur)
    const res: ScheduledSubTask = {
      subTask: sub,
      startOffsetDays: startOffset,
      endOffsetDays: startOffset + dur - 1,
      startDate,
      dueDate,
    }
    visiting.delete(sub.id)
    memo.set(sub.id, res)
    return res
  }

  return subTasks.map((s) => resolve(s))
}

/** Finds matching template by category/name, or falls back to the default 8-step process. */
export function findTemplateForDeliverable(categoryOrName: string): DeliverableSubTaskTemplate[] {
  const templates = loadDeliverableTemplates()
  const needle = categoryOrName.trim().toLowerCase()
  const match = templates.find(
    (t) => t.name.toLowerCase() === needle || t.category.toLowerCase() === needle,
  )
  return match ? match.subTasks : buildDefaultSubTasks(categoryOrName)
}

/** Creates all sub-tasks in Dexie for a newly added project deliverable, preserving dependencies & working days. */
export async function createTasksFromDeliverableTemplate(opts: {
  projectId: string
  workstreamId: string
  supplierId: string
  categoryOrName: string
  startDate: string
}) {
  const subTasks = findTemplateForDeliverable(opts.categoryOrName)
  if (subTasks.length === 0) return 0
  const schedule = computeTemplateSchedule(subTasks, opts.startDate || todayStr())
  const now = nowIso()

  // Pre-allocate real task IDs so Finish-to-Start dependencies map cleanly
  const templateToTaskId = new Map<string, string>()
  for (const item of schedule) templateToTaskId.set(item.subTask.id, newId())

  await db.transaction('rw', [db.tasks, db.milestones, db.activityLogs], async () => {
    for (const item of schedule) {
      const id = templateToTaskId.get(item.subTask.id)!
      if (item.subTask.kind === 'milestone') {
        await db.milestones.add({
          id,
          projectId: opts.projectId,
          workstreamId: opts.workstreamId,
          name: item.subTask.name,
          description: '',
          targetDate: item.dueDate,
          actualDate: '',
          status: 'Not Started',
          remarks: '',
          createdAt: now,
          updatedAt: now,
        })
      } else {
        const dependsOnTaskId = item.subTask.dependsOnId ? templateToTaskId.get(item.subTask.dependsOnId) ?? '' : ''
        await db.tasks.add({
          id,
          projectId: opts.projectId,
          workstreamId: opts.workstreamId,
          name: item.subTask.name,
          assignee: '',
          supplierId: opts.supplierId || '',
          startDate: item.startDate,
          dueDate: item.dueDate,
          completionDate: '',
          priority: item.subTask.priority,
          status: 'Not Started',
          progress: 0,
          workingDays: item.subTask.workingDays,
          dependsOnTaskId,
          remarks: '',
          createdAt: now,
          updatedAt: now,
        })
      }
    }
    await logActivity(
      'Task',
      opts.workstreamId,
      opts.projectId,
      'Created',
      `Auto-created ${schedule.length} items for deliverable "${opts.categoryOrName}"`,
    )
  })
  return schedule.length
}
