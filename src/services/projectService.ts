import { db } from '@/database/db'
import { isArchivedStatus, type Project } from '@/types'
import { clampProgress, newId, nowIso, todayStr } from '@/utils/helpers'
import { ValidationError, checkDateOrder, requireText } from '@/utils/validation'
import { logActivity } from './activityService'

export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

function validate(input: ProjectInput) {
  requireText(input.code, 'HRS Number')
  checkDateOrder(input.startDate, input.baselineDate, 'start date', 'HW required date')
  checkDateOrder(input.startDate, input.revisedDate, 'start date', 'revised completion date')
  checkDateOrder(input.startDate, input.actualDate, 'start date', 'actual completion date')
}

async function assertCodeUnique(code: string, ignoreId?: string) {
  const existing = await db.projects.where('code').equalsIgnoreCase(code.trim()).first()
  if (existing && existing.id !== ignoreId) throw new ValidationError(`HRS Number "${code}" is already used.`)
}

export async function createProject(input: ProjectInput): Promise<string> {
  const startDate = input.startDate || todayStr()
  const normalized = { ...input, startDate }
  validate(normalized)
  const code = normalized.code.trim()
  await assertCodeUnique(code)
  const name = normalized.name.trim() || normalized.deviceName.trim() || code
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', db.projects, db.activityLogs, async () => {
    await db.projects.add({ ...normalized, code, name, progress: clampProgress(normalized.progress), id, createdAt: now, updatedAt: now })
    await logActivity('Project', id, id, 'Created', `Project ${code} created`)
  })
  return id
}

export async function updateProject(id: string, input: ProjectInput) {
  validate(input)
  const code = input.code.trim()
  await assertCodeUnique(code, id)
  const old = await db.projects.get(id)
  if (!old) throw new ValidationError('Project no longer exists.')
  if (isArchivedStatus(old.status) && !isArchivedStatus(input.status)) {
    throw new ValidationError('Archived projects cannot be returned to active status.')
  }
  const name = input.name.trim() || input.deviceName.trim() || code
  await db.transaction('rw', db.projects, db.activityLogs, async () => {
    await db.projects.update(id, { ...input, code, name, progress: clampProgress(input.progress), updatedAt: nowIso() })
    if (old.status !== input.status) {
      await logActivity('Project', id, id, 'Status Changed', `Project ${code} status: ${old.status} → ${input.status}`)
    } else {
      await logActivity('Project', id, id, 'Updated', `Project ${code} updated`)
    }
  })
}

// Deleting a project also removes everything that belongs to it, so no orphan records remain.
export async function deleteProject(id: string) {
  const p = await db.projects.get(id)
  if (!p) return
  await db.transaction(
    'rw',
    [db.projects, db.workstreams, db.projectSuppliers, db.tasks, db.milestones, db.quotations, db.petRecords,
      db.prRecords, db.poRecords, db.meetings, db.meetingActions, db.risks, db.issues, db.activityLogs],
    async () => {
      const meetingIds = await db.meetings.where('projectId').equals(id).primaryKeys()
      await db.meetingActions.where('meetingId').anyOf(meetingIds).delete()
      for (const t of [db.workstreams, db.projectSuppliers, db.tasks, db.milestones, db.quotations, db.petRecords,
        db.prRecords, db.poRecords, db.meetings, db.risks, db.issues, db.activityLogs]) {
        await t.where('projectId').equals(id).delete()
      }
      await db.projects.delete(id)
      await logActivity('Project', id, '', 'Deleted', `Project ${p.code} (${p.name}) deleted`)
    },
  )
}

export const emptyProject = (): ProjectInput => ({
  code: '', name: '', hwType: 'FT', deviceName: '', atePlatform: '', description: '', objectives: '',
  priority: 'Medium', status: 'Planning', startDate: todayStr(), baselineDate: '', revisedDate: '', actualDate: '',
  progress: 0, remarks: '',
})
