import { TABLE_NAMES, db, type TableName } from '@/database/db'

// ---------- JSON backup ----------

export interface BackupFile {
  app: 'npi-project-manager'
  version: 1
  exportedAt: string
  data: Record<TableName, unknown[]>
}

export async function buildBackup(): Promise<BackupFile> {
  const data = {} as Record<TableName, unknown[]>
  for (const name of TABLE_NAMES) data[name] = await db[name].toArray()
  return { app: 'npi-project-manager', version: 1, exportedAt: new Date().toISOString(), data }
}

/** Checks the file looks like one of our backups. Returns the typed backup or throws a readable error. */
export function validateBackup(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object') throw new Error('This is not a valid backup file.')
  const f = raw as Partial<BackupFile>
  if (f.app !== 'npi-project-manager') throw new Error('This file was not created by NPI Project Manager.')
  if (f.version !== 1) throw new Error('Unsupported backup version.')
  if (!f.data || typeof f.data !== 'object') throw new Error('Backup file has no data section.')
  for (const name of TABLE_NAMES) {
    const rows = (f.data as Record<string, unknown>)[name]
    if (!Array.isArray(rows)) throw new Error(`Backup is missing the "${name}" table.`)
    for (const r of rows) {
      if (!r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string') {
        throw new Error(`Backup table "${name}" contains a record without a valid id.`)
      }
    }
  }
  return f as BackupFile
}

/** Replaces ALL current data with the backup (done in one transaction: all or nothing). */
export async function restoreBackup(backup: BackupFile) {
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) {
      await db[name].clear()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db[name] as any).bulkAdd(backup.data[name])
    }
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportJsonBackup() {
  const backup = await buildBackup()
  const stamp = new Date().toISOString().slice(0, 10)
  downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `npi-backup-${stamp}.json`)
}

export async function resetAllData() {
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) await db[name].clear()
  })
}

export async function getDatabaseStatus() {
  const counts = {} as Record<TableName, number>
  for (const name of TABLE_NAMES) counts[name] = await db[name].count()
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  let storage: { usage?: number; quota?: number } = {}
  try {
    storage = (await navigator.storage?.estimate?.()) ?? {}
  } catch { /* not supported */ }
  return { counts, total, storage, dbName: db.name, open: db.isOpen() }
}
