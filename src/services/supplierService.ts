import { db } from '@/database/db'
import type { Supplier } from '@/types'
import { newId, nowIso } from '@/utils/helpers'
import { ValidationError, checkEmail, requireText } from '@/utils/validation'
import { logActivity } from './activityService'

export type SupplierInput = Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

function validate(i: SupplierInput) {
  requireText(i.name, 'Supplier name')
  checkEmail(i.email.trim())
}

async function assertNameUnique(name: string, ignoreId?: string) {
  const existing = await db.suppliers.where('name').equalsIgnoreCase(name.trim()).first()
  if (existing && existing.id !== ignoreId) throw new ValidationError(`Supplier "${name}" already exists.`)
}

export async function createSupplier(input: SupplierInput) {
  validate(input)
  await assertNameUnique(input.name)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', db.suppliers, db.activityLogs, async () => {
    await db.suppliers.add({ ...input, name: input.name.trim(), id, createdAt: now, updatedAt: now })
    await logActivity('Supplier', id, '', 'Created', `Supplier ${input.name} added`)
  })
}

export async function updateSupplier(id: string, input: SupplierInput) {
  validate(input)
  await assertNameUnique(input.name, id)
  await db.transaction('rw', db.suppliers, db.activityLogs, async () => {
    await db.suppliers.update(id, { ...input, name: input.name.trim(), updatedAt: nowIso() })
    await logActivity('Supplier', id, '', 'Updated', `Supplier ${input.name} updated`)
  })
}

// Deleting a supplier removes its project links and clears it from records that used it.
export async function deleteSupplier(id: string) {
  const s = await db.suppliers.get(id)
  if (!s) return
  await db.transaction(
    'rw',
    [db.suppliers, db.projectSuppliers, db.workstreams, db.tasks, db.quotations, db.petRecords, db.prRecords, db.poRecords, db.activityLogs],
    async () => {
      await db.projectSuppliers.where('supplierId').equals(id).delete()
      for (const t of [db.workstreams, db.tasks, db.quotations, db.petRecords, db.prRecords, db.poRecords]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (t as any).where('supplierId').equals(id).modify({ supplierId: '' })
      }
      await db.suppliers.delete(id)
      await logActivity('Supplier', id, '', 'Deleted', `Supplier ${s.name} deleted`)
    },
  )
}

/** Link supplier to project; does nothing if already linked. */
export async function linkSupplierToProject(projectId: string, supplierId: string) {
  const exists = await db.projectSuppliers.where('[projectId+supplierId]').equals([projectId, supplierId]).first()
  if (exists) return
  const now = nowIso()
  await db.projectSuppliers.add({ id: newId(), projectId, supplierId, createdAt: now, updatedAt: now })
}

export async function unlinkSupplierFromProject(projectId: string, supplierId: string) {
  await db.transaction('rw', db.projectSuppliers, db.workstreams, async () => {
    await db.projectSuppliers.where('[projectId+supplierId]').equals([projectId, supplierId]).delete()
    // Workstreams in this project no longer point at the removed supplier.
    await db.workstreams.where('projectId').equals(projectId).filter((w) => w.supplierId === supplierId).modify({ supplierId: '' })
  })
}

export const emptySupplier = (): SupplierInput => ({
  name: '', contactPerson: '', email: '', phone: '', location: '', category: 'Other', remarks: '',
})
