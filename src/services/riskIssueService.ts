import { db } from '@/database/db'
import type { Issue, Risk } from '@/types'
import { newId, nowIso, todayStr } from '@/utils/helpers'
import { ValidationError, checkDateOrder, requireText } from '@/utils/validation'
import { logActivity } from './activityService'

export type RiskInput = Omit<Risk, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>
export type IssueInput = Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

// ---------- Risks ----------
function validateRisk(i: RiskInput) {
  requireText(i.title, 'Risk title')
  if (!i.projectId) throw new ValidationError('Please choose a project.')
}

export async function createRisk(input: RiskInput) {
  validateRisk(input)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', [db.risks, db.activityLogs], async () => {
    await db.risks.add({ ...input, title: input.title.trim(), id, createdAt: now, updatedAt: now })
    await logActivity('Risk', id, input.projectId, 'Created', `Risk "${input.title.trim()}" logged`)
  })
}

export async function updateRisk(id: string, input: RiskInput) {
  validateRisk(input)
  const old = await db.risks.get(id)
  if (!old) throw new ValidationError('Risk no longer exists.')
  await db.transaction('rw', [db.risks, db.activityLogs], async () => {
    await db.risks.update(id, { ...input, title: input.title.trim(), updatedAt: nowIso() })
    const changed = old.status !== input.status
    await logActivity('Risk', id, input.projectId, changed ? 'Status Changed' : 'Updated',
      changed ? `Risk "${input.title.trim()}" status: ${old.status} → ${input.status}` : `Risk "${input.title.trim()}" updated`)
  })
}

export async function deleteRisk(id: string) {
  const r = await db.risks.get(id)
  if (!r) return
  await db.transaction('rw', [db.risks, db.activityLogs], async () => {
    await db.risks.delete(id)
    await logActivity('Risk', id, r.projectId, 'Deleted', `Risk "${r.title}" deleted`)
  })
}

export const emptyRisk = (projectId = ''): RiskInput => ({
  title: '', projectId, description: '', probability: 'Medium', impact: 'Medium', level: 'Medium',
  mitigation: '', owner: '', status: 'Open',
})

// ---------- Engineering Issues ----------
function validateIssue(i: IssueInput) {
  requireText(i.title, 'Issue title')
  if (!i.projectId) throw new ValidationError('Please choose a project.')
  checkDateOrder(i.dateRaised, i.targetDate, 'date raised', 'target resolution date')
  checkDateOrder(i.dateRaised, i.actualDate, 'date raised', 'actual resolution date')
}

function normaliseIssue(i: IssueInput): IssueInput {
  const out = { ...i, title: i.title.trim() }
  if ((out.status === 'Resolved' || out.status === 'Closed') && !out.actualDate) {
    out.actualDate = todayStr()
  }
  return out
}

export async function createIssue(input: IssueInput) {
  validateIssue(input)
  const data = normaliseIssue(input)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', [db.issues, db.activityLogs], async () => {
    await db.issues.add({ ...data, id, createdAt: now, updatedAt: now })
    await logActivity('Issue', id, data.projectId, 'Created', `Issue "${data.title}" raised`)
  })
}

export async function updateIssue(id: string, input: IssueInput) {
  validateIssue(input)
  const data = normaliseIssue(input)
  const old = await db.issues.get(id)
  if (!old) throw new ValidationError('Issue no longer exists.')
  await db.transaction('rw', [db.issues, db.activityLogs], async () => {
    await db.issues.update(id, { ...data, updatedAt: nowIso() })
    const changed = old.status !== data.status
    await logActivity('Issue', id, data.projectId, changed ? 'Status Changed' : 'Updated',
      changed ? `Issue "${data.title}" status: ${old.status} → ${data.status}` : `Issue "${data.title}" updated`)
  })
}

export async function deleteIssue(id: string) {
  const i = await db.issues.get(id)
  if (!i) return
  await db.transaction('rw', [db.issues, db.activityLogs], async () => {
    await db.issues.delete(id)
    await logActivity('Issue', id, i.projectId, 'Deleted', `Issue "${i.title}" deleted`)
  })
}

export const emptyIssue = (projectId = ''): IssueInput => ({
  title: '', projectId, workstreamId: '', description: '', rootCause: '', correctiveAction: '',
  responsible: '', dateRaised: todayStr(), targetDate: '', actualDate: '', status: 'Open',
})
