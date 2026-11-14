import { db } from '@/database/db'
import type { Workstream } from '@/types'
import { clampProgress, newId, nowIso } from '@/utils/helpers'
import { ValidationError, checkDateOrder, requireText } from '@/utils/validation'
import { logActivity } from './activityService'
import { linkSupplierToProject } from './supplierService'

export type WorkstreamInput = Omit<Workstream, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

function validate(i: WorkstreamInput) {
  requireText(i.name || i.category, 'Deliverable')
  checkDateOrder(i.startDate, i.targetDate, 'start date', 'target completion date')
  checkDateOrder(i.startDate, i.actualDate, 'start date', 'actual completion date')
}

export async function createWorkstream(input: WorkstreamInput) {
  validate(input)
  const name = (input.name || input.category || 'PCB').trim()
  const category = input.category || name
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', db.workstreams, db.projectSuppliers, db.activityLogs, async () => {
    await db.workstreams.add({ ...input, name, category, progress: clampProgress(input.progress), id, createdAt: now, updatedAt: now })
    // Using a supplier on a deliverable also links it to the project automatically.
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    await logActivity('Deliverable', id, input.projectId, 'Created', `Deliverable "${name}" created`)
  })
  return id
}

export async function updateWorkstream(id: string, input: WorkstreamInput) {
  validate(input)
  const old = await db.workstreams.get(id)
  if (!old) throw new ValidationError('Deliverable no longer exists.')
  const name = (input.name || input.category || 'PCB').trim()
  const category = input.category || name
  await db.transaction('rw', db.workstreams, db.projectSuppliers, db.activityLogs, async () => {
    await db.workstreams.update(id, { ...input, name, category, progress: clampProgress(input.progress), updatedAt: nowIso() })
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    const changed = old.status !== input.status
    await logActivity('Deliverable', id, input.projectId, changed ? 'Status Changed' : 'Updated',
      changed ? `Deliverable "${name}" status: ${old.status} → ${input.status}` : `Deliverable "${name}" updated`)
  })
}

export async function deleteWorkstream(id: string) {
  const w = await db.workstreams.get(id)
  if (!w) return
  await db.transaction('rw', [db.workstreams, db.tasks, db.milestones, db.issues, db.quotations, db.petRecords, db.poRecords, db.activityLogs], async () => {
    // Keep tasks / milestones / issues / commercial records or detach them from the deleted deliverable.
    await db.tasks.where('workstreamId').equals(id).modify({ workstreamId: '' })
    await db.milestones.where('workstreamId').equals(id).modify({ workstreamId: '' })
    await db.issues.where('workstreamId').equals(id).modify({ workstreamId: '' })
    await db.quotations.where('workstreamId').equals(id).delete()
    await db.petRecords.where('workstreamId').equals(id).delete()
    await db.poRecords.where('workstreamId').equals(id).delete()
    await db.workstreams.delete(id)
    await logActivity('Deliverable', id, w.projectId, 'Deleted', `Deliverable "${w.name}" deleted`)
  })
}

export const emptyWorkstream = (projectId: string): WorkstreamInput => ({
  projectId, name: 'PCB', category: 'PCB', mpn: '', supplierId: '', status: 'Not Started',
  progress: 0, startDate: '', targetDate: '', actualDate: '', remarks: '',
})
