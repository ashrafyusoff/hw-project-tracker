import { db } from '@/database/db'
import type { Meeting, MeetingAction } from '@/types'
import { newId, nowIso } from '@/utils/helpers'
import { ValidationError, requireText } from '@/utils/validation'
import { logActivity } from './activityService'

export type MeetingInput = Omit<Meeting, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>
export type MeetingActionInput = Omit<MeetingAction, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

function validateMeeting(i: MeetingInput) {
  requireText(i.title, 'Meeting title')
  if (!i.projectId) throw new ValidationError('Please choose a project.')
  if (!i.date) throw new ValidationError('Meeting date is required.')
}

export async function createMeeting(input: MeetingInput): Promise<string> {
  validateMeeting(input)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', [db.meetings, db.activityLogs], async () => {
    await db.meetings.add({ ...input, title: input.title.trim(), id, createdAt: now, updatedAt: now })
    await logActivity('Meeting', id, input.projectId, 'Created', `Meeting "${input.title.trim()}" recorded`)
  })
  return id
}

export async function updateMeeting(id: string, input: MeetingInput) {
  validateMeeting(input)
  const old = await db.meetings.get(id)
  if (!old) throw new ValidationError('Meeting no longer exists.')
  await db.transaction('rw', [db.meetings, db.activityLogs], async () => {
    await db.meetings.update(id, { ...input, title: input.title.trim(), updatedAt: nowIso() })
    await logActivity('Meeting', id, input.projectId, 'Updated', `Meeting "${input.title.trim()}" updated`)
  })
}

export async function deleteMeeting(id: string) {
  const m = await db.meetings.get(id)
  if (!m) return
  await db.transaction('rw', [db.meetings, db.meetingActions, db.activityLogs], async () => {
    await db.meetingActions.where('meetingId').equals(id).delete()
    await db.meetings.delete(id)
    await logActivity('Meeting', id, m.projectId, 'Deleted', `Meeting "${m.title}" deleted`)
  })
}

export const emptyMeeting = (projectId = ''): MeetingInput => ({
  title: '', projectId, date: '', participants: '', summary: '', decisions: '', remarks: '',
})

// ---------- Meeting Action Items ----------
function validateAction(i: MeetingActionInput) {
  requireText(i.action, 'Action item')
  if (!i.meetingId) throw new ValidationError('Meeting is required.')
}

export async function createMeetingAction(input: MeetingActionInput) {
  validateAction(input)
  const now = nowIso()
  const id = newId()
  const m = await db.meetings.get(input.meetingId)
  await db.transaction('rw', [db.meetingActions, db.activityLogs], async () => {
    await db.meetingActions.add({ ...input, action: input.action.trim(), id, createdAt: now, updatedAt: now })
    await logActivity('Meeting Action', id, m?.projectId ?? '', 'Created', `Action item "${input.action.trim()}" added`)
  })
}

export async function updateMeetingAction(id: string, input: MeetingActionInput) {
  validateAction(input)
  const old = await db.meetingActions.get(id)
  if (!old) throw new ValidationError('Action item no longer exists.')
  const m = await db.meetings.get(input.meetingId)
  await db.transaction('rw', [db.meetingActions, db.activityLogs], async () => {
    await db.meetingActions.update(id, { ...input, action: input.action.trim(), updatedAt: nowIso() })
    const changed = old.status !== input.status
    await logActivity('Meeting Action', id, m?.projectId ?? '', changed ? 'Status Changed' : 'Updated',
      changed ? `Action item "${input.action.trim()}" status: ${old.status} → ${input.status}` : `Action item "${input.action.trim()}" updated`)
  })
}

export async function deleteMeetingAction(id: string) {
  const a = await db.meetingActions.get(id)
  if (!a) return
  const m = await db.meetings.get(a.meetingId)
  await db.transaction('rw', [db.meetingActions, db.activityLogs], async () => {
    await db.meetingActions.delete(id)
    await logActivity('Meeting Action', id, m?.projectId ?? '', 'Deleted', `Action item "${a.action}" deleted`)
  })
}

export const emptyMeetingAction = (meetingId: string): MeetingActionInput => ({
  meetingId, action: '', assignee: '', dueDate: '', status: 'Open', taskId: '',
})
