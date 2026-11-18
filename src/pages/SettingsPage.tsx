import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Activity,
  AlertTriangle,
  Check,
  Database,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react'
import { db, TABLE_NAMES } from '@/database/db'
import { Badge, Button, Card, ConfirmDialog, Loading } from '@/components/ui'
import { usePersistedState } from '@/hooks/usePersistedState'
import { useTheme } from '@/hooks/useTheme'
import { exportJsonBackup, getDatabaseStatus, resetAllData, restoreBackup, validateBackup, type BackupFile } from '@/services/backupService'
import { REPORT_NAMES, exportAllReports, exportReport } from '@/services/exportService'
import { clearSampleData, hasSampleData, loadSampleData } from '@/services/sampleData'
import { isArchivedStatus } from '@/types'
import { todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

const LABELS: Record<string, string> = {
  projects: 'Projects', workstreams: 'Deliverables', suppliers: 'Suppliers', projectSuppliers: 'Project Suppliers', tasks: 'Tasks',
  milestones: 'Milestones', quotations: 'Quotations', petRecords: 'PET Records', poRecords: 'PO Records',
  activityLogs: 'Activity Logs',
}
const VISIBLE_TABLES = Object.keys(LABELS) as (keyof typeof LABELS)[]

const FILTER_STORAGE_KEYS = [
  'npi.overview.hwType',
  'npi.overview.hwRequired',
  'npi.overview.leftWidgetTab',
  'npi.overview.radarFilter',
  'npi.thisWeek.sortBy',
  'npi.thisWeek.priorityFilter',
  'npi.calendar.weeksToShow',
  'npi.calendar.filterProject',
  'npi.projects.search',
  'npi.projects.hwType',
  'npi.projects.status',
  'npi.projects.sort',
  'npi.projects.collapsedIds',
  'npi.tasks.tab',
  'npi.tasks.search',
  'npi.tasks.projectId',
  'npi.tasks.status',
  'npi.tasks.priority',
  'npi.suppliers.tab',
  'npi.suppliers.search',
  'npi.suppliers.category',
  'npi.suppliers.expandedContacts',
  'npi.nonnpi.tab',
  'npi.nonnpi.search',
  'npi.nonnpi.categoryFilter',
  'npi.nonnpi.statusFilter',
  'npi.nonnpi.collapsedIds',
  'npi.archived.tab',
  'npi.archived.search',
  'npi.archived.status',
  'npi.archived.collapsedIds',
]

interface QuickNoteItem {
  id: string
  text: string
  done: boolean
  createdAt: string
}

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const { theme, setTheme } = useTheme()
  const [pending, setPending] = useState<BackupFile | undefined>()
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmClearLogs, setConfirmClearLogs] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | undefined>()

  // Synced workspace preferences
  const [weeksToShow, setWeeksToShow] = usePersistedState<number>('npi.calendar.weeksToShow', 4)
  const [thisWeekSortBy, setThisWeekSortBy] = usePersistedState<'priority' | 'due'>('npi.thisWeek.sortBy', 'priority')
  const [leftWidgetTab, setLeftWidgetTab] = usePersistedState<'radar' | 'notes'>('npi.overview.leftWidgetTab', 'radar')
  const [quickNotes, setQuickNotes] = usePersistedState<QuickNoteItem[]>('npi.overview.quickNotes', [])

  // Re-run whenever any table changes so counts stay live
  const status = useLiveQuery(
    async () => {
      const today = todayStr()
      const [dbStat, sample, projects, workstreams, tasks, milestones, pos, projectSuppliers, suppliers, meetings, meetingActions] =
        await Promise.all([
          getDatabaseStatus(),
          hasSampleData(),
          db.projects.toArray(),
          db.workstreams.toArray(),
          db.tasks.toArray(),
          db.milestones.toArray(),
          db.poRecords.toArray(),
          db.projectSuppliers.toArray(),
          db.suppliers.toArray(),
          db.meetings.toArray(),
          db.meetingActions.toArray(),
        ])

      const activeNpi = projects.filter((p) => !p.isNonNpi && !isArchivedStatus(p.status))
      const activeNpiIds = new Set(activeNpi.map((p) => p.id))
      const activeDeliverables = workstreams.filter((w) => activeNpiIds.has(w.projectId))
      const poByWs = new Set(pos.filter((r) => !!r.number && !!r.workstreamId).map((r) => r.workstreamId))

      const missingBaselineCount = activeNpi.filter((p) => !p.baselineDate).length
      const unassignedSupplierDeliverables = activeDeliverables.filter((w) => !w.supplierId).length
      const pendingPoDeliverables = activeDeliverables.filter((w) => !poByWs.has(w.id)).length
      const overdueOpenTasks = tasks.filter(
        (t) => t.status !== 'Completed' && t.status !== 'Cancelled' && !!t.dueDate && t.dueDate < today,
      ).length
      const overdueMilestones = milestones.filter(
        (m) => m.status !== 'Completed' && !!m.targetDate && m.targetDate < today,
      ).length

      const projectIdSet = new Set(projects.map((p) => p.id))
      const supplierIdSet = new Set(suppliers.map((s) => s.id))
      const meetingIdSet = new Set(meetings.map((m) => m.id))
      const orphanLinksCount =
        projectSuppliers.filter((ps) => !projectIdSet.has(ps.projectId) || !supplierIdSet.has(ps.supplierId)).length +
        meetingActions.filter((ma) => !meetingIdSet.has(ma.meetingId)).length

      return {
        ...dbStat,
        sample,
        health: {
          missingBaselineCount,
          unassignedSupplierDeliverables,
          pendingPoDeliverables,
          overdueOpenTasks,
          overdueMilestones,
          orphanLinksCount,
        },
      }
    },
    [],
    undefined,
  )
  useLiveQuery(() => Promise.all(TABLE_NAMES.map((n) => db[n].count())), [])

  async function act(fn: () => Promise<void>, okText: string) {
    try { await fn(); setMsg({ type: 'ok', text: okText }) } catch (e) { setMsg({ type: 'err', text: errorMessage(e) }) }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const backup = validateBackup(JSON.parse(await file.text()))
      setPending(backup)
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof SyntaxError ? 'This file is not valid JSON.' : errorMessage(err) })
    }
  }

  async function handleExpandAllGroups() {
    window.localStorage.setItem('npi.projects.collapsedIds', JSON.stringify({}))
    window.localStorage.setItem('npi.nonnpi.collapsedIds', JSON.stringify({}))
    window.localStorage.setItem('npi.archived.collapsedIds', JSON.stringify({}))
    const allSuppliers = await db.suppliers.toArray()
    const expandedContacts: Record<string, boolean> = {}
    for (const s of allSuppliers) expandedContacts[s.id] = true
    window.localStorage.setItem('npi.suppliers.expandedContacts', JSON.stringify(expandedContacts))
    setMsg({ type: 'ok', text: 'All Projects, Non-NPI Work, Archived items, and Supplier contact rows are now expanded.' })
  }

  async function handleCollapseAllGroups() {
    const allProjects = await db.projects.toArray()
    const projCollapsed: Record<string, boolean> = {}
    const nonNpiCollapsed: Record<string, boolean> = {}
    const archivedCollapsed: Record<string, boolean> = {}
    for (const p of allProjects) {
      if (p.isNonNpi) nonNpiCollapsed[p.id] = true
      if (isArchivedStatus(p.status)) archivedCollapsed[p.id] = true
      else if (!p.isNonNpi) projCollapsed[p.id] = true
    }
    window.localStorage.setItem('npi.projects.collapsedIds', JSON.stringify(projCollapsed))
    window.localStorage.setItem('npi.nonnpi.collapsedIds', JSON.stringify(nonNpiCollapsed))
    window.localStorage.setItem('npi.archived.collapsedIds', JSON.stringify(archivedCollapsed))
    window.localStorage.setItem('npi.suppliers.expandedContacts', JSON.stringify({}))
    setMsg({ type: 'ok', text: 'All Projects, Non-NPI Work, Archived items, and Supplier contact rows are now collapsed.' })
  }

  function handleResetSavedFilters() {
    for (const key of FILTER_STORAGE_KEYS) {
      window.localStorage.removeItem(key)
    }
    setWeeksToShow(4)
    setThisWeekSortBy('priority')
    setLeftWidgetTab('radar')
    setMsg({ type: 'ok', text: 'All saved filters, sorting, and expand/collapse preferences have been reset to defaults.' })
  }

  async function handleExportActivityCsv() {
    const logs = await db.activityLogs.toArray()
    const sorted = [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = ['Timestamp', 'Action', 'Entity', 'Project ID', 'Entity ID', 'Message'].join(',')
    const lines = sorted.map((l) =>
      [l.createdAt, l.action, l.entity, l.projectId, l.entityId, l.message].map(esc).join(','),
    )
    const csv = [header, ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hw-project-tracker-activity-log-${todayStr()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleClearActivityLogs() {
    await db.activityLogs.clear()
  }

  async function handleCleanOrphanLinks() {
    const [projects, suppliers, meetings] = await Promise.all([
      db.projects.toArray(),
      db.suppliers.toArray(),
      db.meetings.toArray(),
    ])
    const pIds = new Set(projects.map((p) => p.id))
    const sIds = new Set(suppliers.map((s) => s.id))
    const mIds = new Set(meetings.map((m) => m.id))
    await db.transaction('rw', [db.projectSuppliers, db.meetingActions], async () => {
      await db.projectSuppliers.filter((ps) => !pIds.has(ps.projectId) || !sIds.has(ps.supplierId)).delete()
      await db.meetingActions.filter((ma) => !mIds.has(ma.meetingId)).delete()
    })
  }

  if (!status) return <Loading />
  const mb = (n?: number) => (n === undefined ? 'n/a' : `${(n / 1048576).toFixed(1)} MB`)
  const completedNotesCount = quickNotes.filter((n) => n.done).length

  return (
    <div className="space-y-3 w-full">
      <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p>Your data is stored locally in this browser. It is not automatically synchronised across different devices or browsers. Export regular backups to prevent data loss.</p>
      </div>
      {msg && <p className={`rounded-xl px-3.5 py-2 text-xs font-medium ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

      {/* Row 1: Appearance (left) + JSON Backup & Sample Data (right) */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Appearance (Dark / Light Mode)">
          <p className="text-xs text-slate-500 mb-2.5">Choose between Light Mode and Dark Mode across HW Tracker.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={theme === 'light' ? 'primary' : 'secondary'}
              onClick={() => setTheme('light')}
            >
              <Sun className="h-4 w-4" /> Light Mode {theme === 'light' && <Check className="h-3.5 w-3.5 ml-0.5" />}
            </Button>
            <Button
              variant={theme === 'dark' ? 'primary' : 'secondary'}
              onClick={() => setTheme('dark')}
            >
              <Moon className="h-4 w-4" /> Dark Mode {theme === 'dark' && <Check className="h-3.5 w-3.5 ml-0.5" />}
            </Button>
          </div>
        </Card>

        <Card title="JSON Backup">
          <p className="text-xs text-slate-500 mb-2.5">Save all your data to one file, or restore from a previous backup. Restoring replaces everything currently stored.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => act(exportJsonBackup, 'Backup file downloaded.')}><Download className="h-4 w-4" /> Export JSON Backup</Button>
            <Button onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Restore JSON Backup</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          </div>
        </Card>
      </div>

      {/* Row 2: Workspace & View Preferences */}
      <Card title="Workspace & View Preferences" action={<Sliders className="h-4 w-4 text-slate-400" />}>
        <div className="grid sm:grid-cols-3 gap-2.5 mb-2.5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Workweek Schedule Span (Weeks)
            </label>
            <div className="flex items-center gap-1.5">
              {[2, 4, 6, 8].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    setWeeksToShow(w)
                    setMsg({ type: 'ok', text: `Workweek Schedule set to display ${w} weeks.` })
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    weeksToShow === w
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {w}W
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={10}
                value={weeksToShow}
                onChange={(e) => setWeeksToShow(Math.max(1, Math.min(10, Number(e.target.value) || 4)))}
                className="w-11 h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-center text-xs font-semibold text-slate-800"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              This Week Activities Sort Mode
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setThisWeekSortBy('priority')
                  setMsg({ type: 'ok', text: 'This Week Activities default sort set to Priority.' })
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  thisWeekSortBy === 'priority'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                By Priority
              </button>
              <button
                type="button"
                onClick={() => {
                  setThisWeekSortBy('due')
                  setMsg({ type: 'ok', text: 'This Week Activities default sort set to Due Date.' })
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  thisWeekSortBy === 'due'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                By Due Date
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Overview Radar / Pinboard Default
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setLeftWidgetTab('radar')
                  setMsg({ type: 'ok', text: 'Overview left widget set to Hardware Delivery Radar.' })
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  leftWidgetTab === 'radar'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                HW Radar
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftWidgetTab('notes')
                  setMsg({ type: 'ok', text: 'Overview left widget set to Quick Pinboard.' })
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  leftWidgetTab === 'notes'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Pinboard
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleExpandAllGroups()}>
            <FolderOpen className="h-4 w-4" /> Expand All Rows Across Tabs
          </Button>
          <Button onClick={() => void handleCollapseAllGroups()}>
            <FolderOpen className="h-4 w-4" /> Collapse All Rows Across Tabs
          </Button>
          <Button onClick={handleResetSavedFilters}>
            <RotateCcw className="h-4 w-4" /> Reset Saved Filters & View Preferences
          </Button>
        </div>
      </Card>

      {/* Row 3: Excel Reports (left) + Activity History & Quick Pinboard (right) */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Excel Reports">
          <p className="text-xs text-slate-500 mb-2.5">Download individual Excel worksheets or the full master workbook.</p>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_NAMES.map((n) => <Button key={n} onClick={() => act(() => exportReport(n), `${n} report downloaded.`)}><FileSpreadsheet className="h-3.5 w-3.5" /> {n}</Button>)}
            <Button variant="primary" onClick={() => act(exportAllReports, 'Full report downloaded.')}><FileSpreadsheet className="h-3.5 w-3.5" /> All reports (one workbook)</Button>
          </div>
        </Card>

        <Card title="Activity History & Quick Pinboard" action={<Activity className="h-4 w-4 text-slate-400" />}>
          <p className="text-xs text-slate-500 mb-2.5">
            Audit logs ({status.counts.activityLogs} entries) and Quick Pinboard notes ({quickNotes.length} total, {completedNotesCount} completed).
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              onClick={() => act(handleExportActivityCsv, 'Activity log CSV downloaded.')}
              disabled={status.counts.activityLogs === 0}
            >
              <Download className="h-3.5 w-3.5" /> Export Activity (CSV)
            </Button>
            <Button
              onClick={() => {
                setQuickNotes((prev) => prev.filter((n) => !n.done))
                setMsg({ type: 'ok', text: 'Completed Pinboard notes cleared.' })
              }}
              disabled={completedNotesCount === 0}
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear Pinboard ({completedNotesCount})
            </Button>
            <Button
              onClick={() => setConfirmClearLogs(true)}
              disabled={status.counts.activityLogs === 0}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" /> Clear Logs ({status.counts.activityLogs})
            </Button>
          </div>
        </Card>
      </div>

      {/* Row 4: Workspace Health & Data Integrity (left) + Database Status (right) */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Workspace Health & Data Integrity" action={<ShieldCheck className="h-4 w-4 text-emerald-600" />}>
          <div className="grid grid-cols-2 gap-2 mb-2.5 text-xs">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
              <span className="text-slate-600">Missing HW Required</span>
              <Badge color={status.health.missingBaselineCount > 0 ? 'amber' : 'green'}>
                {status.health.missingBaselineCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
              <span className="text-slate-600">Missing Supplier</span>
              <Badge color={status.health.unassignedSupplierDeliverables > 0 ? 'amber' : 'green'}>
                {status.health.unassignedSupplierDeliverables}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
              <span className="text-slate-600">Pending PO #</span>
              <Badge color={status.health.pendingPoDeliverables > 0 ? 'blue' : 'green'}>
                {status.health.pendingPoDeliverables}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
              <span className="text-slate-600">Overdue Tasks</span>
              <Badge color={status.health.overdueOpenTasks > 0 ? 'red' : 'green'}>
                {status.health.overdueOpenTasks}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
              <span className="text-slate-600">Overdue Milestones</span>
              <Badge color={status.health.overdueMilestones > 0 ? 'red' : 'green'}>
                {status.health.overdueMilestones}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
              <span className="text-slate-600">Orphaned Links</span>
              <Badge color={status.health.orphanLinksCount > 0 ? 'amber' : 'green'}>
                {status.health.orphanLinksCount}
              </Badge>
            </div>
          </div>
          <Button
            onClick={() => act(handleCleanOrphanLinks, 'Database relational links verified and cleaned.')}
            disabled={status.health.orphanLinksCount === 0}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Clean Up Orphaned Links ({status.health.orphanLinksCount})
          </Button>
        </Card>

        <Card title="Database Status" action={<Database className="h-4 w-4 text-slate-400" />}>
          <p className="text-xs text-slate-600 mb-2">
            IndexedDB <b>{status.dbName}</b> is <b className={status.open ? 'text-emerald-600' : 'text-red-600'}>{status.open ? 'open' : 'closed'}</b> · {status.total} records · storage: {mb(status.storage.usage)}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
            {VISIBLE_TABLES.map((n) => (
              <div key={n} className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">{LABELS[n]}</span>
                <span className="font-semibold">{status.counts[n as keyof typeof status.counts]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 5: Sample Data & Reset (left) + About (right) */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Sample Data & Reset">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => act(loadSampleData, 'Sample data loaded.')}>
              {status.sample ? 'Reload Sample Data' : 'Load Sample Data'}
            </Button>
            <Button onClick={() => setConfirmClear(true)} disabled={!status.sample}>Clear Sample Data</Button>
            <Button variant="danger" onClick={() => setConfirmReset(true)}><RotateCcw className="h-3.5 w-3.5" /> Reset Application Data</Button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Populates or clears demo records across all tabs while keeping your own records untouched.
          </p>
        </Card>

        <Card title="About">
          <p className="text-xs text-slate-600">
            <b>HW Tracker</b> — Hardware Project Management Application · Website by <b className="text-primary">Pacca</b>
          </p>
        </Card>
      </div>

      <ConfirmDialog open={!!pending} title="Replace all data?" confirmLabel="Restore backup" onCancel={() => setPending(undefined)}
        onConfirm={async () => { const b = pending!; setPending(undefined); await act(() => restoreBackup(b), 'Backup restored.') }}
        message={<>This backup was exported on <b>{pending && new Date(pending.exportedAt).toLocaleString()}</b>. Restoring will <b>delete all current records</b> and replace them with the backup contents.</>} />
      <ConfirmDialog open={confirmClear} title="Clear sample data?" confirmLabel="Clear sample data" onCancel={() => setConfirmClear(false)}
        onConfirm={async () => { setConfirmClear(false); await act(clearSampleData, 'Sample data cleared.') }}
        message="Only the demo records will be removed. Records you created yourself are kept." />
      <ConfirmDialog open={confirmClearLogs} title="Clear all activity history logs?" confirmLabel="Clear activity logs" onCancel={() => setConfirmClearLogs(false)}
        onConfirm={async () => { setConfirmClearLogs(false); await act(handleClearActivityLogs, 'Activity history logs cleared.') }}
        message="This removes all audit entries in Activity History while keeping all your projects, deliverables, tasks, milestones, and suppliers untouched." />
      <ConfirmDialog open={confirmReset} title="Reset all application data?" confirmLabel="Yes, delete everything" onCancel={() => setConfirmReset(false)}
        onConfirm={async () => { setConfirmReset(false); await act(resetAllData, 'All data was deleted.') }}
        message={<><b>This deletes every record</b>, including your own. It cannot be undone — export a JSON backup first if unsure.</>} />
    </div>
  )
}
