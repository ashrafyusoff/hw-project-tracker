import { useState } from 'react'
import { GitCommitHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import type { PetRecord, PoRecord, Project, Quotation, Supplier, Workstream } from '@/types'
import {
  clearDeliverableCommercial,
  emptyDeliverableCommercial,
  saveDeliverableCommercial,
  type DeliverableCommercialInput,
} from '@/services/commercialService'
import { formatDate, isPast } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { Badge, Button, ConfirmDialog, EmptyState, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

const CURRENCIES = ['USD', 'MYR', 'SGD', 'JPY', 'EUR', 'CNY'] as const

export function CommercialBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>
  const s = status.toLowerCase()
  const color = s.includes('approv') || s.includes('accept') || s.includes('deliver') || s.includes('confirm') || s.includes('track') || s.includes('received') ? 'green'
    : s.includes('delay') || s.includes('reject') || s.includes('cancel') || s.includes('expir') ? 'red'
    : s.includes('pend') || s.includes('submit') || s.includes('request') || s.includes('transit') || s.includes('fabricat') ? 'amber' : 'blue'
  return <Badge color={color}>{status}</Badge>
}

export interface DeliverableCommercialRow {
  key: string
  projectId: string
  projectCode: string
  projectName: string
  workstream: Workstream
  supplierId: string
  supplierName: string
  quotation?: Quotation
  pet?: PetRecord
  po?: PoRecord
}

/**
 * Combines Deliverables with their related Quotation, PET, PO, and Delivery Tracking records into unified rows.
 */
export function buildDeliverableCommercialRows(
  workstreams: Workstream[],
  quotations: Quotation[],
  pets: PetRecord[],
  pos: PoRecord[],
  projects: Project[],
  suppliers: Supplier[],
): DeliverableCommercialRow[] {
  const projMap = new Map(projects.map((p) => [p.id, p]))
  const supMap = new Map(suppliers.map((s) => [s.id, s.name]))
  const usedQ = new Set<string>()
  const usedPet = new Set<string>()
  const usedPo = new Set<string>()

  const rows: DeliverableCommercialRow[] = workstreams.map((ws) => {
    const p = projMap.get(ws.projectId)
    const q = quotations.find((r) => !usedQ.has(r.id) && (r.workstreamId === ws.id || (!r.workstreamId && r.projectId === ws.projectId && r.supplierId === ws.supplierId)))
    if (q) usedQ.add(q.id)

    const pet = pets.find((r) => !usedPet.has(r.id) && (r.workstreamId === ws.id || (!r.workstreamId && r.projectId === ws.projectId && r.supplierId === ws.supplierId)))
    if (pet) usedPet.add(pet.id)

    const po = pos.find((r) => !usedPo.has(r.id) && (r.workstreamId === ws.id || (!r.workstreamId && r.projectId === ws.projectId && r.supplierId === ws.supplierId)))
    if (po) usedPo.add(po.id)

    const supplierId = ws.supplierId || q?.supplierId || pet?.supplierId || po?.supplierId || ''
    return {
      key: ws.id,
      projectId: ws.projectId,
      projectCode: p?.code ?? '—',
      projectName: p?.name ?? '',
      workstream: ws,
      supplierId,
      supplierName: supMap.get(supplierId) ?? '—',
      quotation: q,
      pet,
      po,
    }
  })

  return rows
}

export function rowToCommercialInput(row: DeliverableCommercialRow): DeliverableCommercialInput {
  const { workstream: ws, quotation: q, pet, po, supplierId } = row
  return {
    projectId: ws.projectId,
    workstreamId: ws.id,
    supplierId,
    quotationId: q?.id,
    quotationNumber: q?.number ?? '',
    quotationStatus: q?.status ?? 'Requested',
    quotationRequestDate: q?.requestDate ?? '',
    quotationReceivedDate: q?.receivedDate ?? '',
    quotationAmount: q?.amount ?? 0,
    quotationCurrency: q?.currency ?? 'USD',
    petId: pet?.id,
    petReference: pet?.reference ?? '',
    petStatus: pet?.status ?? 'Submitted',
    petSubmissionDate: pet?.submissionDate ?? '',
    petApprovalDate: pet?.approvalDate ?? '',
    poId: po?.id,
    poNumber: po?.number ?? '',
    poStatus: po?.status ?? 'Issued',
    poIssueDate: po?.issueDate ?? '',
    poAmount: po?.amount ?? q?.amount ?? 0,
    poCurrency: po?.currency ?? q?.currency ?? 'USD',
    supplierConfirmation: po?.supplierConfirmation ?? 'Pending',
    hardwareDelivery: po?.hardwareDelivery ?? 'Not Shipped',
    expectedDelivery: po?.expectedDelivery ?? '',
    actualDelivery: po?.actualDelivery ?? '',
    deliveryStatus: po?.deliveryStatus ?? 'Pending',
    remarks: po?.remarks || pet?.remarks || q?.remarks || '',
  }
}

export function DeliverableCommercialModal({
  open,
  initial,
  defaultProjectId,
  defaultWorkstreamId,
  onClose,
}: {
  open: boolean
  initial?: DeliverableCommercialInput
  defaultProjectId?: string
  defaultWorkstreamId?: string
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Deliverable Commercial & Delivery Tracking" wide>
      <DeliverableCommercialBody
        key={`${initial?.workstreamId ?? defaultWorkstreamId ?? 'new'}-${initial?.quotationId ?? ''}-${initial?.petId ?? ''}-${initial?.poId ?? ''}`}
        initial={initial}
        defaultProjectId={defaultProjectId}
        defaultWorkstreamId={defaultWorkstreamId}
        onClose={onClose}
      />
    </Modal>
  )
}

function DeliverableCommercialBody({
  initial,
  defaultProjectId,
  defaultWorkstreamId,
  onClose,
}: {
  initial?: DeliverableCommercialInput
  defaultProjectId?: string
  defaultWorkstreamId?: string
  onClose: () => void
}) {
  const projects = useTable<Project>('projects') ?? []
  const workstreams = useTable<Workstream>('workstreams') ?? []
  const suppliers = useTable<Supplier>('suppliers') ?? []

  const [form, setForm] = useState<DeliverableCommercialInput>(() => {
    if (initial) return { ...initial }
    const ws = workstreams.find((w) => w.id === defaultWorkstreamId)
    return emptyDeliverableCommercial(ws?.projectId || defaultProjectId || '', defaultWorkstreamId || '', ws?.supplierId || '')
  })
  const [error, setError] = useState('')
  const set = <K extends keyof DeliverableCommercialInput>(k: K, v: DeliverableCommercialInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const projectDeliverables = workstreams.filter((w) => !form.projectId || w.projectId === form.projectId)

  function handleDeliverableChange(wsId: string) {
    const ws = workstreams.find((w) => w.id === wsId)
    setForm((f) => ({
      ...f,
      workstreamId: wsId,
      projectId: ws?.projectId || f.projectId,
      supplierId: ws?.supplierId || f.supplierId,
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await saveDeliverableCommercial(form)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />

      {/* Deliverable & Supplier Link */}
      <div className="grid sm:grid-cols-3 gap-3 rounded-md border border-slate-200 bg-slate-50/70 p-3">
        <Field label="Project" required>
          <Select
            value={form.projectId}
            onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value, workstreamId: '' }))}
            options={[{ value: '', label: 'Select project…' }, ...projects.map((p) => ({ value: p.id, label: `${p.code} – ${p.name}` }))]}
          />
        </Field>
        <Field label="Deliverable" required>
          <Select
            value={form.workstreamId}
            onChange={(e) => handleDeliverableChange(e.target.value)}
            options={[
              { value: '', label: projectDeliverables.length ? 'Select deliverable…' : 'No deliverables in project' },
              ...projectDeliverables.map((w) => ({ value: w.id, label: w.name })),
            ]}
          />
        </Field>
        <Field label="Supplier">
          <Select
            value={form.supplierId}
            onChange={(e) => set('supplierId', e.target.value)}
            options={[{ value: '', label: '— None —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </Field>
      </div>

      {/* Stage 1: Quotation */}
      <div className="rounded-md border border-slate-200 p-3 space-y-3">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">1. Quotation</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Quotation Number">
            <Input value={form.quotationNumber} onChange={(e) => set('quotationNumber', e.target.value)} placeholder="Q-NOVA-1182" />
          </Field>
          <Field label="Quote Status">
            <Input value={form.quotationStatus} onChange={(e) => set('quotationStatus', e.target.value)} list="quote-statuses" placeholder="Requested, Accepted…" />
          </Field>
          <datalist id="quote-statuses">
            {['Requested', 'Received', 'Under Review', 'Accepted', 'Rejected', 'Expired'].map((s) => <option key={s} value={s} />)}
          </datalist>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quoted Amount">
              <Input type="number" min={0} step="0.01" value={form.quotationAmount} onChange={(e) => set('quotationAmount', Number(e.target.value))} />
            </Field>
            <Field label="Currency">
              <Select value={form.quotationCurrency} onChange={(e) => set('quotationCurrency', e.target.value)} options={CURRENCIES} />
            </Field>
          </div>
          <Field label="Request Date">
            <Input type="date" value={form.quotationRequestDate} onChange={(e) => set('quotationRequestDate', e.target.value)} />
          </Field>
          <Field label="Received Date">
            <Input type="date" value={form.quotationReceivedDate} onChange={(e) => set('quotationReceivedDate', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Stage 2: PET */}
      <div className="rounded-md border border-slate-200 p-3 space-y-3">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">2. PET (Project Expenditure Approval)</p>
        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="PET Reference">
            <Input value={form.petReference} onChange={(e) => set('petReference', e.target.value)} placeholder="PET-24-0132" />
          </Field>
          <Field label="PET Status">
            <Input value={form.petStatus} onChange={(e) => set('petStatus', e.target.value)} list="pet-statuses" placeholder="Submitted, Approved…" />
          </Field>
          <datalist id="pet-statuses">
            {['Draft', 'Submitted', 'Pending Approval', 'Approved', 'Rejected', 'On Hold'].map((s) => <option key={s} value={s} />)}
          </datalist>
          <Field label="Submission Date">
            <Input type="date" value={form.petSubmissionDate} onChange={(e) => set('petSubmissionDate', e.target.value)} />
          </Field>
          <Field label="Approval Date">
            <Input type="date" value={form.petApprovalDate} onChange={(e) => set('petApprovalDate', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* Stage 3: PO & Delivery Tracking */}
      <div className="rounded-md border border-slate-200 p-3 space-y-3">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">3. Purchase Order (PO) & Hardware Delivery Tracking</p>
        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="PO Number">
            <Input value={form.poNumber} onChange={(e) => set('poNumber', e.target.value)} placeholder="PO-4500711" />
          </Field>
          <Field label="PO Status">
            <Input value={form.poStatus} onChange={(e) => set('poStatus', e.target.value)} list="po-statuses" placeholder="Issued, Delivered…" />
          </Field>
          <datalist id="po-statuses">
            {['Draft', 'Issued', 'Acknowledged', 'Partially Delivered', 'Delivered', 'Closed', 'Cancelled'].map((s) => <option key={s} value={s} />)}
          </datalist>
          <Field label="PO Issue Date">
            <Input type="date" value={form.poIssueDate} onChange={(e) => set('poIssueDate', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="PO Amount">
              <Input type="number" min={0} step="0.01" value={form.poAmount} onChange={(e) => set('poAmount', Number(e.target.value))} />
            </Field>
            <Field label="Currency">
              <Select value={form.poCurrency} onChange={(e) => set('poCurrency', e.target.value)} options={CURRENCIES} />
            </Field>
          </div>
          <Field label="Supplier Confirmation">
            <Input value={form.supplierConfirmation} onChange={(e) => set('supplierConfirmation', e.target.value)} list="sup-confirm" placeholder="Pending, Confirmed…" />
          </Field>
          <datalist id="sup-confirm">
            {['Pending', 'Confirmed', 'Revised Schedule', 'Delayed'].map((s) => <option key={s} value={s} />)}
          </datalist>
          <Field label="Hardware Delivery Stage">
            <Input value={form.hardwareDelivery} onChange={(e) => set('hardwareDelivery', e.target.value)} list="hw-deliv" placeholder="In Fabrication, Shipped…" />
          </Field>
          <datalist id="hw-deliv">
            {['Not Shipped', 'In Fabrication', 'Shipped / In Transit', 'Received', 'Received & Inspected'].map((s) => <option key={s} value={s} />)}
          </datalist>
          <Field label="Expected Delivery">
            <Input type="date" value={form.expectedDelivery} onChange={(e) => set('expectedDelivery', e.target.value)} />
          </Field>
          <Field label="Actual Delivery">
            <Input type="date" value={form.actualDelivery} onChange={(e) => set('actualDelivery', e.target.value)} />
          </Field>
          <Field label="Delivery Status">
            <Input value={form.deliveryStatus} onChange={(e) => set('deliveryStatus', e.target.value)} list="deliv-status" placeholder="On Track, Delayed, Delivered…" />
          </Field>
          <datalist id="deliv-status">
            {['Pending', 'On Track', 'In Transit', 'Delayed', 'Delivered'].map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
      </div>

      <Field label="Remarks"><Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Commercial & Delivery</Button>
      </div>
    </form>
  )
}

/**
 * Single Unified Commercial & Delivery Table (Quotation + PET + PO + Delivery Tracking per Deliverable; no PR).
 */
export function UnifiedCommercialTable({
  rows,
  showProject = true,
  onEditRow,
  onAddCommercial,
}: {
  rows: DeliverableCommercialRow[]
  showProject?: boolean
  onEditRow?: (row: DeliverableCommercialRow) => void
  onAddCommercial?: () => void
}) {
  const [editing, setEditing] = useState<DeliverableCommercialInput | undefined>()
  const [modalOpen, setModalOpen] = useState(false)
  const [clearing, setClearing] = useState<DeliverableCommercialRow | undefined>()

  function openEdit(row: DeliverableCommercialRow) {
    if (onEditRow) {
      onEditRow(row)
    } else {
      setEditing(rowToCommercialInput(row))
      setModalOpen(true)
    }
  }

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          title="No deliverable commercial records"
          hint="Add a Deliverable to your project first, then track its Quotation, PET, PO, and Delivery in one unified table."
          action={onAddCommercial && <Button variant="primary" size="sm" onClick={onAddCommercial}><Plus className="h-3.5 w-3.5" /> Add Commercial</Button>}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-600 text-left bg-slate-50">
              <tr>
                {showProject && <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Project</th>}
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Deliverable</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Supplier</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap bg-blue-50/40">Quotation</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap bg-indigo-50/40">PET</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap bg-emerald-50/40">Purchase Order (PO)</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap bg-amber-50/40">Delivery Tracking</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Remarks</th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const { quotation: q, pet, po, workstream: ws } = r
                const hasAny = !!(q || pet || po)
                const late = po && !po.actualDelivery && isPast(po.expectedDelivery) && po.deliveryStatus !== 'Delivered'
                const remarks = po?.remarks || pet?.remarks || q?.remarks || ''
                return (
                  <tr key={r.key} className="border-t border-slate-200 hover:bg-slate-50/80 align-top">
                    {showProject && (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-semibold text-primary">{r.projectCode}</span>
                        <div className="text-xs text-slate-500 truncate max-w-[140px]">{r.projectName}</div>
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        <GitCommitHorizontal className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{ws.name}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 pl-5">{ws.category} · <Badge>{ws.status}</Badge></div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">{r.supplierName}</td>

                    {/* Quotation column */}
                    <td className="px-3 py-2.5 bg-blue-50/15">
                      {q ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800">{q.number}</span>
                            <CommercialBadge status={q.status} />
                          </div>
                          <div className="text-xs font-medium text-slate-700">
                            {q.amount ? `${q.currency} ${q.amount.toLocaleString()}` : 'Amount TBD'}
                          </div>
                          <div className="text-[11px] text-slate-500 whitespace-nowrap">
                            Req: {formatDate(q.requestDate)} · Recv: {formatDate(q.receivedDate)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not started</span>
                      )}
                    </td>

                    {/* PET column */}
                    <td className="px-3 py-2.5 bg-indigo-50/15">
                      {pet ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800">{pet.reference}</span>
                            <CommercialBadge status={pet.status} />
                          </div>
                          <div className="text-[11px] text-slate-500 whitespace-nowrap">
                            Sub: {formatDate(pet.submissionDate)} · Appr: {formatDate(pet.approvalDate)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not started</span>
                      )}
                    </td>

                    {/* PO column */}
                    <td className="px-3 py-2.5 bg-emerald-50/15">
                      {po ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800">{po.number}</span>
                            <CommercialBadge status={po.status} />
                          </div>
                          <div className="text-xs font-medium text-slate-700">
                            {po.amount ? `${po.currency} ${po.amount.toLocaleString()}` : 'Amount TBD'}
                          </div>
                          <div className="text-[11px] text-slate-500 whitespace-nowrap">
                            Issued: {formatDate(po.issueDate)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not issued</span>
                      )}
                    </td>

                    {/* Delivery Tracking column */}
                    <td className="px-3 py-2.5 bg-amber-50/15">
                      {po ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <CommercialBadge status={late ? 'Delayed' : po.deliveryStatus || po.status} />
                            <span className="text-xs font-medium text-slate-700">{po.hardwareDelivery || 'Not Shipped'}</span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Supplier Conf: <b>{po.supplierConfirmation || 'Pending'}</b>
                          </div>
                          <div className={`text-[11px] whitespace-nowrap ${late ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                            Exp: {formatDate(po.expectedDelivery)} · Act: {formatDate(po.actualDelivery)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Awaiting PO</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[160px] truncate">{remarks || '—'}</td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" title="Edit Quotation / PET / PO / Delivery" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {hasAny && (
                          <Button variant="ghost" size="sm" title="Clear commercial records" onClick={() => setClearing(r)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!onEditRow && (
        <DeliverableCommercialModal open={modalOpen} initial={editing} onClose={() => setModalOpen(false)} />
      )}
      <ConfirmDialog
        open={!!clearing}
        title="Clear commercial records?"
        onCancel={() => setClearing(undefined)}
        onConfirm={async () => {
          if (!clearing) return
          await clearDeliverableCommercial(clearing.projectId, clearing.workstream.id, {
            quotationId: clearing.quotation?.id,
            petId: clearing.pet?.id,
            poId: clearing.po?.id,
          })
          setClearing(undefined)
        }}
        message={<>Clear Quotation, PET, PO, and Delivery Tracking records for deliverable <b>{clearing?.workstream.name}</b>?</>}
      />
    </>
  )
}
