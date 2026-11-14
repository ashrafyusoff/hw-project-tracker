import { db } from '@/database/db'
import type { ActivityLog } from '@/types'
import { newId, nowIso } from '@/utils/helpers'

// Writes one line into the Activity History. Called by the other services.
export async function logActivity(
  entity: string,
  entityId: string,
  projectId: string,
  action: ActivityLog['action'],
  message: string,
  isSample = false,
) {
  const now = nowIso()
  await db.activityLogs.add({ id: newId(), entity, entityId, projectId, action, message, isSample, createdAt: now, updatedAt: now })
}
