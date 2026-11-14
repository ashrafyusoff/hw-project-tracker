import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Database, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import { db, TABLE_NAMES } from '@/database/db'
import { Button, Card, ConfirmDialog, Loading } from '@/components/ui'
import { exportJsonBackup, getDatabaseStatus, resetAllData, restoreBackup, validateBackup, type BackupFile } from '@/services/backupService'
import { REPORT_NAMES, exportAllReports, exportReport } from '@/services/exportService'
import { clearSampleData, hasSampleData, loadSampleData } from '@/services/sampleData'
import { errorMessage } from '@/utils/validation'

const LABELS: Record<string, string> = {
  projects: 'Projects', workstreams: 'Deliverables', suppliers: 'Suppliers', projectSuppliers: 'Project Suppliers', tasks: 'Tasks',
  milestones: 'Milestones', quotations: 'Quotations', petRecords: 'PET Records', poRecords: 'PO Records',
  activityLogs: 'Activity Logs',
}
const VISIBLE_TABLES = Object.keys(LABELS) as (keyof typeof LABELS)[]

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<BackupFile | undefined>()
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | undefined>()

  // Re-run whenever any table changes so counts stay live
  const status = useLiveQuery(async () => ({ ...(await getDatabaseStatus()), sample: await hasSampleData() }), [], undefined)
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

  if (!status) return <Loading />
  const mb = (n?: number) => (n === undefined ? 'n/a' : `${(n / 1048576).toFixed(1)} MB`)

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <p>Your data is stored locally in this browser. It is not automatically synchronised across different devices or browsers. Export regular backups to prevent data loss.</p>
      </div>
      {msg && <p className={`rounded-md px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

      <Card title="JSON Backup">
        <p className="text-sm text-slate-500 mb-3">Save all your data to one file, or restore from a previous backup. Restoring replaces everything currently stored.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => act(exportJsonBackup, 'Backup file downloaded.')}><Download className="h-4 w-4" /> Export JSON Backup</Button>
          <Button onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Restore JSON Backup</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
        </div>
      </Card>

      <Card title="Excel Reports">
        <div className="flex flex-wrap gap-2">
          {REPORT_NAMES.map((n) => <Button key={n} onClick={() => act(() => exportReport(n), `${n} report downloaded.`)}><FileSpreadsheet className="h-4 w-4" /> {n}</Button>)}
          <Button variant="primary" onClick={() => act(exportAllReports, 'Full report downloaded.')}><FileSpreadsheet className="h-4 w-4" /> All reports (one workbook)</Button>
        </div>
      </Card>

      <Card title="Sample Data & Reset">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => act(loadSampleData, 'Sample data loaded.')} disabled={status.sample}>Load Sample Data</Button>
          <Button onClick={() => setConfirmClear(true)} disabled={!status.sample}>Clear Sample Data</Button>
          <Button variant="danger" onClick={() => setConfirmReset(true)}><RotateCcw className="h-4 w-4" /> Reset Application Data</Button>
        </div>
        <p className="text-xs text-slate-400 mt-2">Clear Sample Data removes only the demo records. Your own records are kept.</p>
      </Card>

      <Card title="Database Status" action={<Database className="h-4 w-4 text-slate-400" />}>
        <p className="text-sm text-slate-600 mb-3">
          IndexedDB database <b>{status.dbName}</b> is <b className={status.open ? 'text-emerald-600' : 'text-red-600'}>{status.open ? 'open' : 'closed'}</b> · {status.total} records · browser storage used: {mb(status.storage.usage)}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
          {VISIBLE_TABLES.map((n) => <div key={n} className="flex justify-between border-b border-slate-100 py-1"><span className="text-slate-500">{LABELS[n]}</span><span className="font-medium">{status.counts[n as keyof typeof status.counts]}</span></div>)}
        </div>
      </Card>

      <Card title="About">
        <p className="text-sm text-slate-600">
          <b>NPI Project Manager</b> — Personal Semiconductor NPI Hardware Project Management Application · Website by <b className="text-primary">Pacca1214</b>
        </p>
      </Card>

      <ConfirmDialog open={!!pending} title="Replace all data?" confirmLabel="Restore backup" onCancel={() => setPending(undefined)}
        onConfirm={async () => { const b = pending!; setPending(undefined); await act(() => restoreBackup(b), 'Backup restored.') }}
        message={<>This backup was exported on <b>{pending && new Date(pending.exportedAt).toLocaleString()}</b>. Restoring will <b>delete all current records</b> and replace them with the backup contents.</>} />
      <ConfirmDialog open={confirmClear} title="Clear sample data?" confirmLabel="Clear sample data" onCancel={() => setConfirmClear(false)}
        onConfirm={async () => { setConfirmClear(false); await act(clearSampleData, 'Sample data cleared.') }}
        message="Only the demo records will be removed. Records you created yourself are kept." />
      <ConfirmDialog open={confirmReset} title="Reset all application data?" confirmLabel="Yes, delete everything" onCancel={() => setConfirmReset(false)}
        onConfirm={async () => { setConfirmReset(false); await act(resetAllData, 'All data was deleted.') }}
        message={<><b>This deletes every record</b>, including your own. It cannot be undone — export a JSON backup first if unsure.</>} />
    </div>
  )
}
