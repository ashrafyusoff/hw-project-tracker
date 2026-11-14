import { db } from '@/database/db'
import type { PetRecord, PoRecord, PrRecord, Quotation } from '@/types'
import { newId, nowIso } from '@/utils/helpers'
import { ValidationError, checkDateOrder, requireText } from '@/utils/validation'
import { logActivity } from './activityService'
import { linkSupplierToProject } from './supplierService'

export type QuotationInput = Omit<Quotation, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>
export type PetInput = Omit<PetRecord, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>
export type PrInput = Omit<PrRecord, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>
export type PoInput = Omit<PoRecord, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

// ---------- Quotation ----------
function validateQuotation(i: QuotationInput) {
  requireText(i.number, 'Quotation number')
  if (!i.projectId) throw new ValidationError('Please choose a project.')
  checkDateOrder(i.requestDate, i.receivedDate, 'request date', 'received date')
}

export async function createQuotation(input: QuotationInput) {
  validateQuotation(input)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', [db.quotations, db.projectSuppliers, db.activityLogs], async () => {
    await db.quotations.add({ ...input, number: input.number.trim(), id, createdAt: now, updatedAt: now })
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    await logActivity('Quotation', id, input.projectId, 'Created', `Quotation ${input.number.trim()} created`)
  })
}

export async function updateQuotation(id: string, input: QuotationInput) {
  validateQuotation(input)
  const old = await db.quotations.get(id)
  if (!old) throw new ValidationError('Quotation no longer exists.')
  await db.transaction('rw', [db.quotations, db.projectSuppliers, db.activityLogs], async () => {
    await db.quotations.update(id, { ...input, number: input.number.trim(), updatedAt: nowIso() })
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    const changed = old.status !== input.status
    await logActivity('Quotation', id, input.projectId, changed ? 'Status Changed' : 'Updated',
      changed ? `Quotation ${input.number} status: ${old.status} → ${input.status}` : `Quotation ${input.number} updated`)
  })
}

export async function deleteQuotation(id: string) {
  const q = await db.quotations.get(id)
  if (!q) return
  await db.transaction('rw', [db.quotations, db.activityLogs], async () => {
    await db.quotations.delete(id)
    await logActivity('Quotation', id, q.projectId, 'Deleted', `Quotation ${q.number} deleted`)
  })
}

export const emptyQuotation = (projectId = '', workstreamId = ''): QuotationInput => ({
  number: '', projectId, workstreamId, supplierId: '', requestDate: '', receivedDate: '', amount: 0, currency: 'USD', status: 'Requested', remarks: '',
})

// ---------- PET ----------
function validatePet(i: PetInput) {
  requireText(i.reference, 'PET reference')
  if (!i.projectId) throw new ValidationError('Please choose a project.')
  checkDateOrder(i.submissionDate, i.approvalDate, 'submission date', 'approval date')
}

export async function createPet(input: PetInput) {
  validatePet(input)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', [db.petRecords, db.projectSuppliers, db.activityLogs], async () => {
    await db.petRecords.add({ ...input, reference: input.reference.trim(), id, createdAt: now, updatedAt: now })
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    await logActivity('PET', id, input.projectId, 'Created', `PET ${input.reference.trim()} created`)
  })
}

export async function updatePet(id: string, input: PetInput) {
  validatePet(input)
  const old = await db.petRecords.get(id)
  if (!old) throw new ValidationError('PET record no longer exists.')
  await db.transaction('rw', [db.petRecords, db.projectSuppliers, db.activityLogs], async () => {
    await db.petRecords.update(id, { ...input, reference: input.reference.trim(), updatedAt: nowIso() })
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    const changed = old.status !== input.status
    await logActivity('PET', id, input.projectId, changed ? 'Status Changed' : 'Updated',
      changed ? `PET ${input.reference} status: ${old.status} → ${input.status}` : `PET ${input.reference} updated`)
  })
}

export async function deletePet(id: string) {
  const r = await db.petRecords.get(id)
  if (!r) return
  await db.transaction('rw', [db.petRecords, db.activityLogs], async () => {
    await db.petRecords.delete(id)
    await logActivity('PET', id, r.projectId, 'Deleted', `PET ${r.reference} deleted`)
  })
}

export const emptyPet = (projectId = '', workstreamId = ''): PetInput => ({
  reference: '', projectId, workstreamId, supplierId: '', submissionDate: '', approvalDate: '', status: 'Submitted', remarks: '',
})

// ---------- PR ----------
function validatePr(i: PrInput) {
  requireText(i.number, 'PR number')
  if (!i.projectId) throw new ValidationError('Please choose a project.')
  checkDateOrder(i.submissionDate, i.approvalDate, 'submission date', 'approval date')
}

export async function createPr(input: PrInput) {
  validatePr(input)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', [db.prRecords, db.projectSuppliers, db.activityLogs], async () => {
    await db.prRecords.add({ ...input, number: input.number.trim(), id, createdAt: now, updatedAt: now })
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    await logActivity('PR', id, input.projectId, 'Created', `PR ${input.number.trim()} created`)
  })
}

export async function updatePr(id: string, input: PrInput) {
  validatePr(input)
  const old = await db.prRecords.get(id)
  if (!old) throw new ValidationError('PR record no longer exists.')
  await db.transaction('rw', [db.prRecords, db.projectSuppliers, db.activityLogs], async () => {
    await db.prRecords.update(id, { ...input, number: input.number.trim(), updatedAt: nowIso() })
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    const changed = old.status !== input.status
    await logActivity('PR', id, input.projectId, changed ? 'Status Changed' : 'Updated',
      changed ? `PR ${input.number} status: ${old.status} → ${input.status}` : `PR ${input.number} updated`)
  })
}

export async function deletePr(id: string) {
  const r = await db.prRecords.get(id)
  if (!r) return
  await db.transaction('rw', [db.prRecords, db.activityLogs], async () => {
    await db.prRecords.delete(id)
    await logActivity('PR', id, r.projectId, 'Deleted', `PR ${r.number} deleted`)
  })
}

export const emptyPr = (projectId = ''): PrInput => ({
  number: '', projectId, supplierId: '', submissionDate: '', approvalDate: '', status: 'Submitted', remarks: '',
})

// ---------- PO & Delivery Tracking ----------
function validatePo(i: PoInput) {
  requireText(i.number, 'PO number')
  if (!i.projectId) throw new ValidationError('Please choose a project.')
  checkDateOrder(i.issueDate, i.expectedDelivery, 'issue date', 'expected delivery date')
  checkDateOrder(i.issueDate, i.actualDelivery, 'issue date', 'actual delivery date')
}

export async function createPo(input: PoInput) {
  validatePo(input)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', [db.poRecords, db.projectSuppliers, db.activityLogs], async () => {
    await db.poRecords.add({ ...input, number: input.number.trim(), id, createdAt: now, updatedAt: now })
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    await logActivity('PO', id, input.projectId, 'Created', `PO ${input.number.trim()} created`)
  })
}

export async function updatePo(id: string, input: PoInput) {
  validatePo(input)
  const old = await db.poRecords.get(id)
  if (!old) throw new ValidationError('PO record no longer exists.')
  await db.transaction('rw', [db.poRecords, db.projectSuppliers, db.activityLogs], async () => {
    await db.poRecords.update(id, { ...input, number: input.number.trim(), updatedAt: nowIso() })
    if (input.supplierId) await linkSupplierToProject(input.projectId, input.supplierId)
    const changed = old.status !== input.status || old.deliveryStatus !== input.deliveryStatus
    await logActivity('PO', id, input.projectId, changed ? 'Status Changed' : 'Updated',
      changed ? `PO ${input.number} updated (${input.status} / ${input.deliveryStatus || 'Pending'})` : `PO ${input.number} updated`)
  })
}

export async function deletePo(id: string) {
  const r = await db.poRecords.get(id)
  if (!r) return
  await db.transaction('rw', [db.poRecords, db.activityLogs], async () => {
    await db.poRecords.delete(id)
    await logActivity('PO', id, r.projectId, 'Deleted', `PO ${r.number} deleted`)
  })
}

export const emptyPo = (projectId = '', workstreamId = ''): PoInput => ({
  number: '', projectId, workstreamId, supplierId: '', issueDate: '', amount: 0, currency: 'USD', expectedDelivery: '', actualDelivery: '',
  status: 'Issued', supplierConfirmation: 'Pending', hardwareDelivery: 'Not Shipped', deliveryStatus: 'Pending', remarks: '',
})

// ---------- Unified Deliverable Commercial Pipeline (Quotation + PET + PO + Delivery Tracking) ----------
export interface DeliverableCommercialInput {
  projectId: string
  workstreamId: string
  supplierId: string
  // Quotation
  quotationId?: string
  quotationNumber: string
  quotationStatus: string
  quotationRequestDate: string
  quotationReceivedDate: string
  quotationAmount: number
  quotationCurrency: string
  // PET
  petId?: string
  petReference: string
  petStatus: string
  petSubmissionDate: string
  petApprovalDate: string
  // PO & Delivery Tracking
  poId?: string
  poNumber: string
  poStatus: string
  poIssueDate: string
  poAmount: number
  poCurrency: string
  supplierConfirmation: string
  hardwareDelivery: string
  expectedDelivery: string
  actualDelivery: string
  deliveryStatus: string
  remarks: string
}

export function emptyDeliverableCommercial(projectId = '', workstreamId = '', supplierId = ''): DeliverableCommercialInput {
  return {
    projectId,
    workstreamId,
    supplierId,
    quotationNumber: '',
    quotationStatus: 'Requested',
    quotationRequestDate: '',
    quotationReceivedDate: '',
    quotationAmount: 0,
    quotationCurrency: 'USD',
    petReference: '',
    petStatus: 'Submitted',
    petSubmissionDate: '',
    petApprovalDate: '',
    poNumber: '',
    poStatus: 'Issued',
    poIssueDate: '',
    poAmount: 0,
    poCurrency: 'USD',
    supplierConfirmation: 'Pending',
    hardwareDelivery: 'Not Shipped',
    expectedDelivery: '',
    actualDelivery: '',
    deliveryStatus: 'Pending',
    remarks: '',
  }
}

export async function saveDeliverableCommercial(input: DeliverableCommercialInput) {
  if (!input.projectId) throw new ValidationError('Please choose a project.')
  if (!input.workstreamId) throw new ValidationError('Please choose a deliverable.')
  checkDateOrder(input.quotationRequestDate, input.quotationReceivedDate, 'quotation request date', 'quotation received date')
  checkDateOrder(input.petSubmissionDate, input.petApprovalDate, 'PET submission date', 'PET approval date')
  checkDateOrder(input.poIssueDate, input.expectedDelivery, 'PO issue date', 'expected delivery date')
  checkDateOrder(input.poIssueDate, input.actualDelivery, 'PO issue date', 'actual delivery date')

  const hasQuote = !!(input.quotationNumber.trim() || input.quotationRequestDate || input.quotationReceivedDate || input.quotationAmount > 0)
  const hasPet = !!(input.petReference.trim() || input.petSubmissionDate || input.petApprovalDate)
  const hasPo = !!(input.poNumber.trim() || input.poIssueDate || input.expectedDelivery || input.actualDelivery || input.poAmount > 0 || input.hardwareDelivery !== 'Not Shipped')

  if (!hasQuote && !hasPet && !hasPo) {
    throw new ValidationError('Please enter at least one commercial stage (Quotation, PET, or PO / Delivery).')
  }

  const now = nowIso()
  await db.transaction('rw', [db.quotations, db.petRecords, db.poRecords, db.workstreams, db.projectSuppliers, db.activityLogs], async () => {
    const ws = await db.workstreams.get(input.workstreamId)
    const wsName = ws?.name ?? 'Deliverable'

    if (input.supplierId) {
      await linkSupplierToProject(input.projectId, input.supplierId)
      if (ws && !ws.supplierId) {
        await db.workstreams.update(ws.id, { supplierId: input.supplierId, updatedAt: now })
      }
    }

    // 1. Quotation
    if (hasQuote) {
      const qPayload: QuotationInput = {
        number: input.quotationNumber.trim() || 'Q-TBD',
        projectId: input.projectId,
        workstreamId: input.workstreamId,
        supplierId: input.supplierId,
        requestDate: input.quotationRequestDate,
        receivedDate: input.quotationReceivedDate,
        amount: Number(input.quotationAmount) || 0,
        currency: input.quotationCurrency || 'USD',
        status: input.quotationStatus || 'Requested',
        remarks: input.remarks,
      }
      if (input.quotationId) {
        await db.quotations.update(input.quotationId, { ...qPayload, updatedAt: now })
      } else {
        await db.quotations.add({ ...qPayload, id: newId(), createdAt: now, updatedAt: now })
      }
    } else if (input.quotationId) {
      await db.quotations.delete(input.quotationId)
    }

    // 2. PET
    if (hasPet) {
      const petPayload: PetInput = {
        reference: input.petReference.trim() || 'PET-TBD',
        projectId: input.projectId,
        workstreamId: input.workstreamId,
        supplierId: input.supplierId,
        submissionDate: input.petSubmissionDate,
        approvalDate: input.petApprovalDate,
        status: input.petStatus || 'Submitted',
        remarks: input.remarks,
      }
      if (input.petId) {
        await db.petRecords.update(input.petId, { ...petPayload, updatedAt: now })
      } else {
        await db.petRecords.add({ ...petPayload, id: newId(), createdAt: now, updatedAt: now })
      }
    } else if (input.petId) {
      await db.petRecords.delete(input.petId)
    }

    // 3. PO & Delivery Tracking
    if (hasPo) {
      const poPayload: PoInput = {
        number: input.poNumber.trim() || 'PO-TBD',
        projectId: input.projectId,
        workstreamId: input.workstreamId,
        supplierId: input.supplierId,
        issueDate: input.poIssueDate,
        amount: Number(input.poAmount) || 0,
        currency: input.poCurrency || input.quotationCurrency || 'USD',
        expectedDelivery: input.expectedDelivery,
        actualDelivery: input.actualDelivery,
        status: input.poStatus || 'Issued',
        supplierConfirmation: input.supplierConfirmation || 'Pending',
        hardwareDelivery: input.hardwareDelivery || 'Not Shipped',
        deliveryStatus: input.deliveryStatus || 'Pending',
        remarks: input.remarks,
      }
      if (input.poId) {
        await db.poRecords.update(input.poId, { ...poPayload, updatedAt: now })
      } else {
        await db.poRecords.add({ ...poPayload, id: newId(), createdAt: now, updatedAt: now })
      }
    } else if (input.poId) {
      await db.poRecords.delete(input.poId)
    }

    await logActivity('Commercial', input.workstreamId, input.projectId, 'Updated', `Commercial pipeline updated for deliverable "${wsName}"`)
  })
}

export async function clearDeliverableCommercial(projectId: string, workstreamId: string, ids: { quotationId?: string; petId?: string; poId?: string }) {
  await db.transaction('rw', [db.quotations, db.petRecords, db.poRecords, db.activityLogs], async () => {
    if (ids.quotationId) await db.quotations.delete(ids.quotationId)
    if (ids.petId) await db.petRecords.delete(ids.petId)
    if (ids.poId) await db.poRecords.delete(ids.poId)
    await logActivity('Commercial', workstreamId, projectId, 'Deleted', `Commercial records cleared for deliverable`)
  })
}
