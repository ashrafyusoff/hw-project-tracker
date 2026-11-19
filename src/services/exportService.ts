import * as XLSX from 'xlsx'
import { db } from '@/database/db'
import { isArchivedProject, type Milestone, type PoRecord, type Project, type Task, type Workstream } from '@/types'
import { todayStr } from '@/utils/helpers'
import { getIsoWeek, getMondayOfWeek, parseYmd, toYmd, addDays } from '@/features/overview/WorkWeekCalendar'
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

export type ReportName = 'Projects' | 'Tasks' | 'Milestones' | 'Suppliers' | 'Commercial' | 'Archived' | 'Recent Activities'
export const REPORT_NAMES: ReportName[] = ['Projects', 'Tasks', 'Milestones', 'Suppliers', 'Commercial', 'Archived', 'Recent Activities']

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
    case 'Archived': {
      const [allProjects, allDeliverables, quotations, pets, pos, allTasks, allMilestones] = await Promise.all([
        db.projects.toArray(),
        db.workstreams.toArray(),
        db.quotations.toArray(),
        db.petRecords.toArray(),
        db.poRecords.toArray(),
        db.tasks.toArray(),
        db.milestones.toArray(),
      ])
      const archivedProjects = allProjects.filter((p) => isArchivedProject(p))
      const archivedIds = new Set(archivedProjects.map((p) => p.id))
      const deliverables = allDeliverables.filter((w) => archivedIds.has(w.projectId))
      const tasks = allTasks.filter((t) => archivedIds.has(t.projectId))
      const milestones = allMilestones.filter((m) => archivedIds.has(m.projectId))

      return {
        'Archived Projects': archivedProjects.map((p) => ({
          'HRS Number': p.code,
          'HW Type': p.hwType || 'FT',
          'Device Name': p.deviceName,
          'ATE Platform': p.atePlatform,
          Status: p.status,
          'Progress %': p.progress,
          'Start Date': p.startDate,
          'HW Required Date': p.baselineDate,
          Description: p.description,
        })),
        'Archived Deliverables': deliverables.map((w) => {
          const q = quotations.find((r) => r.workstreamId === w.id || (!r.workstreamId && r.projectId === w.projectId && r.supplierId === w.supplierId))
          const pet = pets.find((r) => r.workstreamId === w.id || (!r.workstreamId && r.projectId === w.projectId && r.supplierId === w.supplierId))
          const po = pos.find((r) => r.workstreamId === w.id || (!r.workstreamId && r.projectId === w.projectId && r.supplierId === w.supplierId))
          return {
            'HRS Number': L.proj(w.projectId),
            Deliverable: w.name || w.category,
            MPN: w.mpn ?? '',
            Supplier: L.sup(w.supplierId || q?.supplierId || pet?.supplierId || po?.supplierId || ''),
            Status: w.status,
            'Progress %': w.progress,
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
        'Archived Tasks': tasks.map((t) => ({
          Task: t.name,
          'HRS Number': L.proj(t.projectId),
          Deliverable: L.ws(t.workstreamId),
          Supplier: L.sup(t.supplierId),
          Start: t.startDate,
          Due: t.dueDate,
          Completed: t.completionDate,
          Priority: t.priority,
          Status: t.status,
          'Progress %': t.progress,
          Remarks: t.remarks,
        })),
        'Archived Milestones': milestones.map((m) => ({
          Milestone: m.name,
          'HRS Number': L.proj(m.projectId),
          Description: m.description,
          Target: m.targetDate,
          Actual: m.actualDate,
          Status: m.status,
          Remarks: m.remarks,
        })),
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

/**
 * Automatically calculates and sets SheetJS (`!cols`) column widths (`wch`)
 * based on the longest header or cell value in each column plus safety padding.
 */
export function autoFitColumns(ws: XLSX.WorkSheet, rows: Row[], padding = 4) {
  const effectiveRows = rows.length ? rows : [{ Info: 'No records' }]
  const headers: string[] = []
  const seen = new Set<string>()
  for (const row of effectiveRows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        headers.push(key)
      }
    }
  }

  ws['!cols'] = headers.map((header) => {
    let maxLen = header.length
    for (const row of effectiveRows) {
      const raw = row[header]
      if (raw === null || raw === undefined) continue
      const lines = String(raw).split(/\r?\n/)
      for (const line of lines) {
        if (line.length > maxLen) maxLen = line.length
      }
    }
    return { wch: Math.max(10, maxLen + padding) }
  })
}

function writeWorkbook(sheets: Record<string, Row[]>, filename: string) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const effectiveRows = rows.length ? rows : [{ Info: 'No records' }]
    // An empty sheet still gets a placeholder so Excel opens the file.
    const ws = XLSX.utils.json_to_sheet(effectiveRows)
    autoFitColumns(ws, effectiveRows)
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

interface GanttExportRow {
  category: 'Project' | 'Deliverable' | 'Milestone' | 'Task'
  label: string
  sublabel: string
  status: string
  progress: number
  startDate: string
  endDate: string
  isPoint?: boolean
}

function buildGanttExportData(
  project: Project,
  deliverables: Workstream[],
  pos: PoRecord[],
  milestones: Milestone[],
  tasks: Task[],
  supName: (id: string) => string,
) {
  const today = todayStr()
  const projStart = project.startDate || project.createdAt?.slice(0, 10) || today
  const projEnd = project.baselineDate && project.baselineDate >= projStart ? project.baselineDate : projStart

  const items: GanttExportRow[] = [
    {
      category: 'Project',
      label: `HRS ${project.code}${project.deviceName ? ` · ${project.deviceName}` : ''}`,
      sublabel: `${project.hwType || 'FT'}${project.atePlatform ? ` · ${project.atePlatform}` : ''}`,
      status: project.status,
      progress: project.progress,
      startDate: projStart,
      endDate: projEnd,
    },
  ]

  for (const w of deliverables) {
    const po = pos.find((r) => r.workstreamId === w.id || (!r.workstreamId && r.supplierId === w.supplierId))
    const dStart = po?.issueDate || w.startDate || projStart
    const dEndRaw = po?.actualDelivery || po?.expectedDelivery || w.targetDate || projEnd
    const dEnd = dEndRaw >= dStart ? dEndRaw : dStart
    const hwStatus = po?.deliveryStatus || 'Not Started'
    const delivName = w.category === 'Others' && w.name && w.name !== 'Others' ? `Others (${w.name})` : w.name || w.category
    items.push({
      category: 'Deliverable',
      label: `├─ ${delivName}${w.mpn ? ` (${w.mpn})` : ''}`,
      sublabel: supName(w.supplierId || po?.supplierId || '') || '—',
      status: `${w.status} / HW: ${hwStatus}`,
      progress: w.progress,
      startDate: dStart,
      endDate: dEnd,
    })
  }

  for (const m of [...milestones].sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'))) {
    const mDate = m.actualDate || m.targetDate || projEnd
    items.push({
      category: 'Milestone',
      label: `◆ ${m.name}`,
      sublabel: m.description || 'NPI Milestone',
      status: m.status,
      progress: m.status === 'Completed' ? 100 : 0,
      startDate: mDate,
      endDate: mDate,
      isPoint: true,
    })
  }

  for (const t of [...tasks].sort((a, b) => (a.startDate || a.dueDate || '9999').localeCompare(b.startDate || b.dueDate || '9999'))) {
    const tStart = t.startDate || t.dueDate || projStart
    const tEndRaw = t.dueDate || t.completionDate || tStart
    const tEnd = tEndRaw >= tStart ? tEndRaw : tStart
    items.push({
      category: 'Task',
      label: `• ${t.name}`,
      sublabel: `Priority: ${t.priority}`,
      status: t.status,
      progress: t.progress,
      startDate: tStart,
      endDate: tEnd,
    })
  }

  // Build weekly timeline columns covering the span of all items (capped at 26 weeks for readability)
  const validDates = items.flatMap((i) => [i.startDate, i.endDate]).filter(Boolean).sort()
  const minYmd = validDates[0] || today
  const maxYmd = validDates[validDates.length - 1] || today
  const firstMonday = getMondayOfWeek(parseYmd(minYmd))
  const lastMonday = getMondayOfWeek(parseYmd(maxYmd))

  const weeks: { label: string; startYmd: string; endYmd: string }[] = []
  let cur = firstMonday
  while (cur <= lastMonday && weeks.length < 26) {
    const ww = getIsoWeek(cur)
    const startYmd = toYmd(cur)
    const endYmd = toYmd(addDays(cur, 6))
    const shortDate = cur.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    weeks.push({ label: `WW${String(ww).padStart(2, '0')} (${shortDate})`, startYmd, endYmd })
    cur = addDays(cur, 7)
  }

  const sheetRows: Row[] = items.map((item) => {
    const row: Row = {
      'Item / Track': item.label,
      Type: item.category,
      Details: item.sublabel,
      Status: item.status,
      'Progress %': item.progress,
      'Start Date': item.startDate,
      'Target / End Date': item.endDate,
    }
    for (const w of weeks) {
      const overlaps = item.startDate <= w.endYmd && item.endDate >= w.startYmd
      row[w.label] = overlaps ? (item.isPoint ? '   ◆   ' : '████████') : ''
    }
    return row
  })

  return { items, sheetRows }
}

export function exportProjectGanttPng(project: Project, items: GanttExportRow[]) {
  if (typeof document === 'undefined') return
  const canvas = document.createElement('canvas')
  const width = 1280
  const headerH = 88
  const rowH = 42
  const footerH = 36
  const height = headerH + items.length * rowH + footerH
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // Title banner
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, width, 48)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 16px Inter, system-ui, sans-serif'
  ctx.fillText(`NPI / HRS ${project.code}${project.deviceName ? ` · ${project.deviceName}` : ''} — Master Gantt Chart`, 20, 30)

  const leftColsW = 470
  const chartX = leftColsW
  const chartW = width - leftColsW - 24

  const today = todayStr()
  const toMs = (s: string) => new Date(s).getTime()
  const DAY = 86400000
  const allMs = [...items.flatMap((i) => [toMs(i.startDate), toMs(i.endDate)]), toMs(today)].filter((n) => !isNaN(n))
  const rawMin = Math.min(...allMs)
  const rawMax = Math.max(...allMs)
  const span = Math.max(rawMax - rawMin, 14 * DAY)
  const minMs = rawMin - Math.max(3 * DAY, Math.round(span * 0.05))
  const maxMs = rawMax + Math.max(5 * DAY, Math.round(span * 0.07))
  const totalMs = Math.max(maxMs - minMs, DAY)
  const xOf = (dStr: string) => chartX + Math.max(0, Math.min(1, (toMs(dStr) - minMs) / totalMs)) * chartW

  // Column Header Bar
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 48, width, 40)
  ctx.strokeStyle = '#cbd5e1'
  ctx.beginPath()
  ctx.moveTo(0, 88)
  ctx.lineTo(width, 88)
  ctx.stroke()

  ctx.fillStyle = '#334155'
  ctx.font = 'bold 12px Inter, system-ui, sans-serif'
  ctx.fillText('Item / Track', 16, 73)
  ctx.fillText('Status', 310, 73)

  // Date ticks
  const tickCount = 8
  ctx.font = '11px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#64748b'
  for (let i = 0; i <= tickCount; i++) {
    const tMs = minMs + (totalMs * i) / tickCount
    const tx = chartX + (i / tickCount) * chartW
    const lbl = new Date(tMs).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
    ctx.fillText(lbl, tx - 24, 73)
    ctx.strokeStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.moveTo(tx, 88)
    ctx.lineTo(tx, height - footerH)
    ctx.stroke()
  }

  // Rows
  items.forEach((item, idx) => {
    const y = headerH + idx * rowH
    if (idx % 2 === 1) {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, y, leftColsW, rowH)
    }
    ctx.strokeStyle = '#f1f5f9'
    ctx.beginPath()
    ctx.moveTo(0, y + rowH)
    ctx.lineTo(width, y + rowH)
    ctx.stroke()

    ctx.fillStyle = item.category === 'Project' ? '#1e3a8a' : '#1e293b'
    ctx.font = item.category === 'Project' ? 'bold 12px Inter, system-ui, sans-serif' : '12px Inter, system-ui, sans-serif'
    ctx.fillText(item.label.slice(0, 38), 16, y + 20)

    ctx.fillStyle = '#64748b'
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.fillText(`${item.startDate} → ${item.endDate}`, 16, y + 34)

    ctx.fillStyle = '#334155'
    ctx.font = '11px Inter, system-ui, sans-serif'
    ctx.fillText(`${item.status.slice(0, 18)} (${item.progress}%)`, 310, y + 25)

    // Bar or Diamond
    const x1 = xOf(item.startDate)
    const x2 = xOf(item.endDate)
    const color =
      item.status.includes('Completed') || item.status.includes('Delivered')
        ? '#10b981'
        : item.status.includes('Delayed')
          ? '#ef4444'
          : item.category === 'Project'
            ? '#2563eb'
            : item.category === 'Deliverable'
              ? '#6366f1'
              : item.category === 'Milestone'
                ? '#f59e0b'
                : '#0ea5e9'

    if (item.isPoint) {
      const cy = y + rowH / 2
      ctx.save()
      ctx.translate(x1, cy)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = color
      ctx.fillRect(-6, -6, 12, 12)
      ctx.restore()
    } else {
      const barW = Math.max(x2 - x1, 10)
      const barY = y + 12
      const barH = 18
      ctx.fillStyle = color
      ctx.globalAlpha = 0.85
      ctx.fillRect(x1, barY, barW, barH)
      ctx.globalAlpha = 1
      if (item.progress > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'
        ctx.fillRect(x1, barY, (barW * Math.min(100, item.progress)) / 100, barH)
      }
    }
  })

  // Today line
  const todayX = xOf(today)
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(todayX, 88)
  ctx.lineTo(todayX, height - footerH)
  ctx.stroke()
  ctx.lineWidth = 1

  // Footer
  ctx.fillStyle = '#64748b'
  ctx.font = '11px Inter, system-ui, sans-serif'
  ctx.fillText(`Exported on ${today} · Red vertical line = Today`, 16, height - 12)

  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `npi-hrs-${project.code}-gantt-${stamp()}.png`)
  }, 'image/png')
}

export async function exportSingleProjectReport(projectId: string) {
  const [project, deliverables, tasks, milestones, quotations, pets, pos, logs, links, suppliers] = await Promise.all([
    db.projects.get(projectId),
    db.workstreams.where('projectId').equals(projectId).toArray(),
    db.tasks.where('projectId').equals(projectId).toArray(),
    db.milestones.where('projectId').equals(projectId).toArray(),
    db.quotations.where('projectId').equals(projectId).toArray(),
    db.petRecords.where('projectId').equals(projectId).toArray(),
    db.poRecords.where('projectId').equals(projectId).toArray(),
    db.activityLogs.where('projectId').equals(projectId).toArray(),
    db.projectSuppliers.where('projectId').equals(projectId).toArray(),
    db.suppliers.toArray(),
  ])
  if (!project) return

  const supMap = new Map(suppliers.map((s) => [s.id, s.name]))
  const wsMap = new Map(deliverables.map((w) => [w.id, w.name || w.category]))
  const supName = (id: string) => supMap.get(id) ?? ''
  const wsName = (id: string) => wsMap.get(id) ?? ''

  const linkedSuppliers = links
    .map((l) => suppliers.find((s) => s.id === l.supplierId))
    .filter((s): s is NonNullable<typeof s> => !!s)

  const ganttData = buildGanttExportData(project, deliverables, pos, milestones, tasks, supName)

  const sheets: Record<string, Row[]> = {
    'Project Overview': [
      {
        'HRS Number': project.code,
        'HW Type': project.hwType || 'FT',
        'Device Name': project.deviceName,
        'ATE Platform': project.atePlatform,
        Status: project.status,
        'Progress %': project.progress,
        'Start Date': project.startDate,
        'HW Required Date': project.baselineDate,
        Description: project.description,
      },
    ],
    'Gantt Chart': ganttData.sheetRows,
    'Deliverables & Commercial': deliverables.map((w) => {
      const q = quotations.find((r) => r.workstreamId === w.id || (!r.workstreamId && r.supplierId === w.supplierId))
      const pet = pets.find((r) => r.workstreamId === w.id || (!r.workstreamId && r.supplierId === w.supplierId))
      const po = pos.find((r) => r.workstreamId === w.id || (!r.workstreamId && r.supplierId === w.supplierId))
      return {
        'HRS Number': project.code,
        Deliverable: w.name || w.category,
        MPN: w.mpn ?? '',
        Supplier: supName(w.supplierId || q?.supplierId || pet?.supplierId || po?.supplierId || ''),
        Status: w.status,
        'Progress %': w.progress,
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
    Tasks: tasks.map((t) => ({
      Task: t.name,
      'HRS Number': project.code,
      Deliverable: wsName(t.workstreamId),
      Supplier: supName(t.supplierId),
      Start: t.startDate,
      Due: t.dueDate,
      Completed: t.completionDate,
      Priority: t.priority,
      Status: t.status,
      Remarks: t.remarks,
    })),
    Milestones: milestones.map((m) => ({
      Milestone: m.name,
      'HRS Number': project.code,
      Description: m.description,
      Target: m.targetDate,
      Actual: m.actualDate,
      Status: m.status,
      Remarks: m.remarks,
    })),
    Suppliers: linkedSuppliers.map((s) => ({
      Supplier: s.name,
      Category: s.category,
      Contact: s.contactPerson,
      Email: s.email,
      Phone: s.phone,
      Location: s.location,
      Deliverables: deliverables.filter((w) => w.supplierId === s.id).map((w) => w.name || w.category).join(', '),
      Remarks: s.remarks,
    })),
    'Activity History': [...logs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((l) => ({
        'Date & Time': new Date(l.createdAt).toLocaleString('en-GB'),
        Action: l.action,
        Entity: l.entity === 'Workstream' ? 'Deliverable' : l.entity,
        Description: l.message,
      })),
  }

  writeWorkbook(sheets, `npi-hrs-${project.code}-${stamp()}.xlsx`)
  exportProjectGanttPng(project, ganttData.items)
}
