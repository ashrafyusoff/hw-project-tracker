import * as XLSX from 'xlsx'
import { db } from '@/database/db'
import { downloadBlob } from './backupService'

// Turns database records into readable spreadsheet rows (names instead of IDs).

type Row = Record<string, string | number>

async function lookups() {
  const [projects, suppliers, workstreams, tasks, meetings] = await Promise.all([
    db.projects.toArray(), db.suppliers.toArray(), db.workstreams.toArray(), db.tasks.toArray(), db.meetings.toArray(),
  ])
  const p = new Map(projects.map((x) => [x.id, x.code]))
  const s = new Map(suppliers.map((x) => [x.id, x.name]))
  const w = new Map(workstreams.map((x) => [x.id, x.name]))
  const t = new Map(tasks.map((x) => [x.id, x.name]))
  const m = new Map(meetings.map((x) => [x.id, x]))
  return {
    proj: (id: string) => p.get(id) ?? '',
    sup: (id: string) => s.get(id) ?? '',
    ws: (id: string) => w.get(id) ?? '',
    task: (id: string) => t.get(id) ?? '',
    meeting: (id: string) => m.get(id),
  }
}

export type ReportName = 'Projects' | 'Tasks' | 'Milestones' | 'Suppliers' | 'Commercial' | 'Recent Activities'
export const REPORT_NAMES: ReportName[] = ['Projects', 'Tasks', 'Milestones', 'Suppliers', 'Commercial', 'Recent Activities']

export async function buildSheets(name: ReportName): Promise<Record<string, Row[]>> {
  const L = await lookups()
  switch (name) {
    case 'Projects': {
      const projects = await db.projects.toArray()
      const deliverables = await db.workstreams.toArray()
      return {
        Projects: projects.map((p) => ({
          'HRS Number': p.code, 'HW Type': p.hwType || 'FT', 'Device Name': p.deviceName, 'ATE Platform': p.atePlatform,
          Status: p.status, 'Progress %': p.progress, 'Start Date': p.startDate,
          'HW Required Date': p.baselineDate, Description: p.description,
        })),
        Deliverables: deliverables.map((w) => ({
          'HRS Number': L.proj(w.projectId), Deliverable: w.name || w.category, MPN: w.mpn ?? '', Supplier: L.sup(w.supplierId),
          Status: w.status, 'Progress %': w.progress, Remarks: w.remarks,
        })),
      }
    }
    case 'Tasks':
      return { Tasks: (await db.tasks.toArray()).map((t) => ({
        Task: t.name, 'HRS Number': L.proj(t.projectId), Deliverable: L.ws(t.workstreamId), Supplier: L.sup(t.supplierId),
        Start: t.startDate, Due: t.dueDate, Completed: t.completionDate, Priority: t.priority, Status: t.status, 'Progress %': t.progress, Remarks: t.remarks })) }
    case 'Milestones':
      return { Milestones: (await db.milestones.toArray()).map((m) => ({
        Milestone: m.name, 'HRS Number': L.proj(m.projectId), Description: m.description,
        Target: m.targetDate, Actual: m.actualDate, Status: m.status, Remarks: m.remarks })) }
    case 'Suppliers':
      return { Suppliers: (await db.suppliers.toArray()).map((s) => ({
        Supplier: s.name, Contact: s.contactPerson, Email: s.email, Phone: s.phone, Location: s.location, Category: s.category, Remarks: s.remarks })) }
    case 'Commercial': {
      const [deliverables, quotations, pets, pos] = await Promise.all([
        db.workstreams.toArray(), db.quotations.toArray(), db.petRecords.toArray(), db.poRecords.toArray(),
      ])
      return {
        'Deliverable Commercial': deliverables.map((w) => {
          const q = quotations.find((r) => r.workstreamId === w.id || (!r.workstreamId && r.projectId === w.projectId && r.supplierId === w.supplierId))
          const pet = pets.find((r) => r.workstreamId === w.id || (!r.workstreamId && r.projectId === w.projectId && r.supplierId === w.supplierId))
          const po = pos.find((r) => r.workstreamId === w.id || (!r.workstreamId && r.projectId === w.projectId && r.supplierId === w.supplierId))
          return {
            'HRS Number': L.proj(w.projectId),
            Deliverable: w.name || w.category,
            MPN: w.mpn ?? '',
            Supplier: L.sup(w.supplierId || q?.supplierId || pet?.supplierId || po?.supplierId || ''),
            'Quotation Number': q?.number ?? '',
            'PET Number': pet?.reference ?? '',
            'PO Number': po?.number ?? '',
            'PO Issue Date': po?.issueDate ?? '',
            'PO Amount': po?.amount ?? '',
            'PO Currency': po?.currency ?? '',
            'Expected Delivery': po?.expectedDelivery ?? '',
            'Actual Delivery': po?.actualDelivery ?? '',
            'Hardware Status': po?.deliveryStatus ?? 'Not Started',
            Remarks: po?.remarks || pet?.remarks || q?.remarks || w.remarks || '',
          }
        }),
      }
    }
    case 'Recent Activities': {
      const logs = (await db.activityLogs.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return {
        'Recent Activities': logs.map((l) => ({
          'Date & Time': new Date(l.createdAt).toLocaleString('en-GB'),
          Action: l.action,
          Entity: l.entity,
          Project: L.proj(l.projectId),
          Description: l.message,
        })),
      }
    }
  }
}

function writeWorkbook(sheets: Record<string, Row[]>, filename: string) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    // An empty sheet still gets a header-less placeholder so Excel opens the file.
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'No records' }])
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}

const stamp = () => new Date().toISOString().slice(0, 10)

export async function exportReport(name: ReportName) {
  writeWorkbook(await buildSheets(name), `npi-${name.toLowerCase().replace(/\s+/g, '-')}-${stamp()}.xlsx`)
}

export async function exportAllReports() {
  const all: Record<string, Row[]> = {}
  for (const n of REPORT_NAMES) Object.assign(all, await buildSheets(n))
  writeWorkbook(all, `npi-all-reports-${stamp()}.xlsx`)
}
