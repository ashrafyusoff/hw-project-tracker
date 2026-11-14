import { db } from '@/database/db'
import type { Workstream } from '@/types'
import { clampProgress, newId, nowIso } from '@/utils/helpers'
import { ValidationError, checkDateOrder, requireText } from '@/utils/validation'
import { logActivity } from './activityService'
import { linkSupplierToProject } from './supplierService'

export type WorkstreamInput = Omit<Workstream, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

function validate(i: WorkstreamInput) {
  requireText(i.name, 'Deliverable name')
  checkDateOrder(i.startDate, i.targetDate, 'start date', 'target completion date')
  checkDateOrder(i.startDate, i.actualDate, 'start date', 'actual completion date')
}

export async function createWorkstream(input: WorkstreamInput) {
  validate(input)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', db.workstreams, db.projectSuppliers, db.activityLogs, async () => {
    await db.workstreams.add({ ...input, name: input.name.trim(), progress: clampProgress(input.progress), id, createdAt: now, updatedAt: now })
    // Using a supplier on a deliverable also links it to the project automatically.
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    await logActivity('Deliverable', id, input.projectId, 'Created', `Deliverable "${input.name}" created`)
  })
  return id
}

export async function updateWorkstream(id: string, input: WorkstreamInput) {
  validate(input)
  const old = await db.workstreams.get(id)
  if (!old) throw new ValidationError('Deliverable no longer exists.')
  await db.transaction('rw', db.workstreams, db.projectSuppliers, db.activityLogs, async () => {
    await db.workstreams.update(id, { ...input, name: input.name.trim(), progress: clampProgress(input.progress), updatedAt: nowIso() })
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    const changed = old.status !== input.status
    await logActivity('Deliverable', id, input.projectId, changed ? 'Status Changed' : 'Updated',
      changed ? `Deliverable "${input.name}" status: ${old.status} → ${input.status}` : `Deliverable "${input.name}" updated`)
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
  projectId, name: '', category: 'PCB Development', supplierId: '', status: 'Not Started',
  progress: 0, startDate: '', targetDate: '', actualDate: '', remarks: '',
})
