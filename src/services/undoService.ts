import { db, TABLE_NAMES, type TableName } from '@/database/db'

interface DbChange {
  kind: 'db'
  table: TableName
  key: string
  before: Record<string, unknown> | undefined
}

interface LocalChange {
  kind: 'local'
  key: string
  before: string | null
}

type UndoChange = DbChange | LocalChange

interface UndoBatch {
  label: string
  changes: UndoChange[]
}

const MAX_UNDO_STEPS = 50
const BATCH_WINDOW_MS = 80
const UNDOABLE_LOCAL_KEYS = new Set([
  'npi.deliverableTemplates.v1',
  'npi.projects.buttonOrder',
  'npi.overview.quickNotes',
])

const TABLE_LABELS: Partial<Record<TableName, string>> = {
  projects: 'Project',
  workstreams: 'Deliverable',
  suppliers: 'Supplier',
  projectSuppliers: 'Project Supplier',
  tasks: 'Task',
  milestones: 'Milestone',
  quotations: 'Quotation',
  petRecords: 'PET Record',
  prRecords: 'PR Record',
  poRecords: 'PO Record',
  meetings: 'Meeting',
  meetingActions: 'Meeting Action',
  risks: 'Risk',
  issues: 'Issue',
}

const LOCAL_LABELS: Record<string, string> = {
  'npi.deliverableTemplates.v1': 'Deliverable Setup',
  'npi.projects.buttonOrder': 'Project Order',
  'npi.overview.quickNotes': 'Pinboard Note',
}

const undoStack: UndoBatch[] = []
let pendingChanges: UndoChange[] = []
let pendingLabel = ''
let flushTimer: number | null = null
let isUndoing = false
let pauseDepth = 0
let initialized = false

function flushPendingBatch() {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }
  if (pendingChanges.length === 0) {
    pendingLabel = ''
    return
  }
  undoStack.push({
    label: pendingLabel || 'Action',
    changes: pendingChanges,
  })
  if (undoStack.length > MAX_UNDO_STEPS) {
    undoStack.shift()
  }
  pendingChanges = []
  pendingLabel = ''
}

function enqueueChange(change: UndoChange, label: string) {
  if (isUndoing || pauseDepth > 0) return
  if (!pendingLabel && label) pendingLabel = label
  pendingChanges.push(change)
  if (flushTimer !== null) window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(flushPendingBatch, BATCH_WINDOW_MS)
}

export async function withoutUndo<T>(fn: () => Promise<T>): Promise<T> {
  pauseDepth++
  try {
    return await fn()
  } finally {
    pauseDepth = Math.max(0, pauseDepth - 1)
  }
}

export function initGlobalUndo() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  // 1. Hook all Dexie tables so every create / update / delete / drag / status change is undoable
  for (const tableName of TABLE_NAMES) {
    const tbl = db[tableName]

    tbl.hook('creating', function (primKey, obj) {
      if (isUndoing || pauseDepth > 0) return
      const key = String(primKey ?? (obj as { id?: string })?.id ?? '')
      if (!key) return
      const label = tableName === 'activityLogs' ? '' : `Create ${TABLE_LABELS[tableName] ?? tableName}`
      enqueueChange({ kind: 'db', table: tableName, key, before: undefined }, label)
    })

    tbl.hook('updating', function (_mods, primKey, obj) {
      if (isUndoing || pauseDepth > 0) return
      const key = String(primKey ?? (obj as { id?: string })?.id ?? '')
      if (!key) return
      const before = structuredClone(obj) as unknown as Record<string, unknown>
      const label = tableName === 'activityLogs' ? '' : `Update ${TABLE_LABELS[tableName] ?? tableName}`
      enqueueChange({ kind: 'db', table: tableName, key, before }, label)
    })

    tbl.hook('deleting', function (primKey, obj) {
      if (isUndoing || pauseDepth > 0) return
      const key = String(primKey ?? (obj as { id?: string })?.id ?? '')
      if (!key) return
      const before = structuredClone(obj) as unknown as Record<string, unknown>
      const label = tableName === 'activityLogs' ? '' : `Delete ${TABLE_LABELS[tableName] ?? tableName}`
      enqueueChange({ kind: 'db', table: tableName, key, before }, label)
    })
  }

  // 2. Hook tracked localStorage keys (Deliverables setup, Project button order, Pinboard notes)
  const originalSetItem = window.localStorage.setItem.bind(window.localStorage)
  window.localStorage.setItem = function (key: string, value: string) {
    if (!isUndoing && pauseDepth === 0 && UNDOABLE_LOCAL_KEYS.has(key)) {
      const before = window.localStorage.getItem(key)
      if (before !== value) {
        enqueueChange({ kind: 'local', key, before }, `Update ${LOCAL_LABELS[key] ?? 'Setting'}`)
      }
    }
    return originalSetItem(key, value)
  }
}

export function canUndo(): boolean {
  return pendingChanges.length > 0 || undoStack.length > 0
}

export async function undoLastAction(): Promise<{ undone: boolean; label: string }> {
  flushPendingBatch()
  const batch = undoStack.pop()
  if (!batch) return { undone: false, label: '' }

  isUndoing = true
  try {
    const dbChanges = batch.changes.filter((c): c is DbChange => c.kind === 'db')
    const localChanges = batch.changes.filter((c): c is LocalChange => c.kind === 'local')

    if (dbChanges.length > 0) {
      const affectedTables = Array.from(new Set(dbChanges.map((c) => db[c.table])))
      await db.transaction('rw', affectedTables, async () => {
        for (let i = dbChanges.length - 1; i >= 0; i--) {
          const c = dbChanges[i]
          const tbl = db[c.table] as unknown as {
            delete: (k: string) => Promise<void>
            put: (v: Record<string, unknown>) => Promise<unknown>
          }
          if (c.before === undefined) {
            await tbl.delete(c.key)
          } else {
            await tbl.put(c.before)
          }
        }
      })
    }

    if (localChanges.length > 0) {
      for (let i = localChanges.length - 1; i >= 0; i--) {
        const c = localChanges[i]
        if (c.before === null) window.localStorage.removeItem(c.key)
        else window.localStorage.setItem(c.key, c.before)
      }
      window.dispatchEvent(new CustomEvent('npi-undo-sync'))
    }

    return { undone: true, label: batch.label }
  } finally {
    isUndoing = false
  }
}
