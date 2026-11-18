import { db } from '@/database/db'
import type { Supplier, SupplierContact } from '@/types'
import { newId, nowIso } from '@/utils/helpers'
import { ValidationError, checkEmail, requireText } from '@/utils/validation'
import { logActivity } from './activityService'

export type SupplierInput = Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

export function getSupplierContacts(s: Partial<Supplier>): SupplierContact[] {
  if (s.contacts && s.contacts.length > 0) {
    return s.contacts
  }
  if (s.contactPerson || s.phone || s.email) {
    return [
      {
        contactPerson: s.contactPerson ?? '',
        role: '',
        phone: s.phone ?? '',
        email: s.email ?? '',
      },
    ]
  }
  return []
}

export function getSupplierDeliverables(s: Partial<Supplier>): string[] {
  if (Array.isArray(s.deliverables) && s.deliverables.length > 0) {
    return s.deliverables
  }
  if (!s.category) return []
  const match = s.category.match(/^Others\s*\((.+)\)$/i)
  if (match) return [match[1].trim()]
  return s.category
    .split(',')
    .map((x) => x.trim())
    .filter((x) => Boolean(x) && x.toLowerCase() !== 'others')
}

function normalizeContacts(input: SupplierInput): {
  contacts: SupplierContact[]
  contactPerson: string
  phone: string
  email: string
} {
  const raw = input.contacts && input.contacts.length > 0
    ? input.contacts
    : []

  const cleaned = raw
    .map((c) => ({
      contactPerson: (c.contactPerson ?? '').trim(),
      role: (c.role ?? '').trim(),
      phone: (c.phone ?? '').trim(),
      email: (c.email ?? '').trim(),
    }))
    .filter((c) => c.contactPerson || c.role || c.phone || c.email)

  if (cleaned.length === 0 && (input.contactPerson || input.phone || input.email)) {
    cleaned.push({
      contactPerson: (input.contactPerson ?? '').trim(),
      role: '',
      phone: (input.phone ?? '').trim(),
      email: (input.email ?? '').trim(),
    })
  }

  const first = cleaned[0] ?? { contactPerson: '', role: '', phone: '', email: '' }
  return {
    contacts: cleaned,
    contactPerson: first.contactPerson,
    phone: first.phone,
    email: first.email,
  }
}

function validate(i: SupplierInput) {
  requireText(i.name, 'Supplier name')
  const { contacts } = normalizeContacts(i)
  for (const c of contacts) {
    checkEmail(c.email)
  }
}

async function assertNameUnique(name: string, ignoreId?: string) {
  const existing = await db.suppliers.where('name').equalsIgnoreCase(name.trim()).first()
  if (existing && existing.id !== ignoreId) throw new ValidationError(`Supplier "${name}" already exists.`)
}

export async function createSupplier(input: SupplierInput) {
  validate(input)
  await assertNameUnique(input.name)
  const norm = normalizeContacts(input)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', db.suppliers, db.activityLogs, async () => {
    await db.suppliers.add({
      ...input,
      name: input.name.trim(),
      contacts: norm.contacts,
      contactPerson: norm.contactPerson,
      phone: norm.phone,
      email: norm.email,
      id,
      createdAt: now,
      updatedAt: now,
    })
    await logActivity('Supplier', id, '', 'Created', `Supplier ${input.name} added`)
  })
}

export async function updateSupplier(id: string, input: SupplierInput) {
  validate(input)
  await assertNameUnique(input.name, id)
  const norm = normalizeContacts(input)
  await db.transaction('rw', db.suppliers, db.activityLogs, async () => {
    await db.suppliers.update(id, {
      ...input,
      name: input.name.trim(),
      contacts: norm.contacts,
      contactPerson: norm.contactPerson,
      phone: norm.phone,
      email: norm.email,
      updatedAt: nowIso(),
    })
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
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  contacts: [{ contactPerson: '', role: '', phone: '', email: '' }],
  deliverables: [],
  location: '',
  category: '',
  remarks: '',
})
