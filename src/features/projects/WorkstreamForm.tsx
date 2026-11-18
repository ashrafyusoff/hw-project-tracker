import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTable } from '@/hooks/useTable'
import {
  HARDWARE_STATUSES,
  type PetRecord,
  type PoRecord,
  type Quotation,
  type Supplier,
  type Workstream,
} from '@/types'
import { createWorkstream, emptyWorkstream, updateWorkstream, type WorkstreamInput } from '@/services/workstreamService'
import { getSupplierDeliverables } from '@/services/supplierService'
import { emptyDeliverableCommercial, saveDeliverableCommercial, type DeliverableCommercialInput } from '@/services/commercialService'
import { createTasksFromDeliverableTemplate, findTemplateForDeliverable, loadDeliverableTemplates } from '@/services/deliverableTemplateService'
import { todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Loading, Modal, Select, Textarea } from '@/components/ui'

const CURRENCIES = ['USD', 'MYR', 'SGD', 'JPY', 'EUR', 'CNY'] as const

export function WorkstreamForm({
  open,
  projectId,
  workstream,
  suppliers,
  onClose,
}: {
  open: boolean
  projectId: string
  workstream?: Workstream
  suppliers: Supplier[]
  onClose: () => void
}) {
  const workstreams = useTable<Workstream>('workstreams')
  const quotations = useTable<Quotation>('quotations')
  const pets = useTable<PetRecord>('petRecords')
  const pos = useTable<PoRecord>('poRecords')

  const isReady = !workstream || (workstreams !== undefined && quotations !== undefined && pets !== undefined && pos !== undefined)
  const liveWs = workstream ? (workstreams?.find((w) => w.id === workstream.id) ?? workstream) : undefined

  const existingQ = liveWs && quotations
    ? quotations.find((r) => r.workstreamId === liveWs.id || (!r.workstreamId && r.projectId === liveWs.projectId && r.supplierId === liveWs.supplierId))
    : undefined
  const existingPet = liveWs && pets
    ? pets.find((r) => r.workstreamId === liveWs.id || (!r.workstreamId && r.projectId === liveWs.projectId && r.supplierId === liveWs.supplierId))
    : undefined
  const existingPo = liveWs && pos
    ? pos.find((r) => r.workstreamId === liveWs.id || (!r.workstreamId && r.projectId === liveWs.projectId && r.supplierId === liveWs.supplierId))
    : undefined

  const formKey = `${open ? 'open' : 'closed'}-${liveWs?.id ?? 'new'}-${liveWs?.updatedAt ?? ''}-${existingQ?.id ?? ''}-${existingPet?.id ?? ''}-${existingPo?.id ?? ''}`

  return (
    <Modal open={open} onClose={onClose} title={liveWs ? 'Edit Deliverable & Commercial' : 'Add Deliverable & Commercial'} wide>
      {!isReady ? (
        <Loading />
      ) : (
        <Body
          key={formKey}
          projectId={projectId}
          workstream={liveWs}
          existingQ={existingQ}
          existingPet={existingPet}
          existingPo={existingPo}
          suppliers={suppliers}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}

function normalizeHardwareStatus(po?: PoRecord): string {
  const raw = po?.deliveryStatus || po?.hardwareDelivery || ''
  if (HARDWARE_STATUSES.includes(raw as (typeof HARDWARE_STATUSES)[number])) return raw
  const lower = raw.toLowerCase()
  if (lower.includes('deliver') && !lower.includes('in deliver')) return 'Delivered'
  if (lower.includes('received')) return 'Delivered'
  if (lower.includes('ship') || lower.includes('transit') || lower.includes('in deliver')) return 'In Delivery'
  if (lower.includes('fabricat') || lower.includes('track')) return 'Fabrication'
  if (lower.includes('design')) return 'Design'
  return 'Not Started'
}

function Body({
  projectId,
  workstream,
  existingQ,
  existingPet,
  existingPo,
  suppliers,
  onClose,
}: {
  projectId: string
  workstream?: Workstream
  existingQ?: Quotation
  existingPet?: PetRecord
  existingPo?: PoRecord
  suppliers: Supplier[]
  onClose: () => void
}) {
  const templateNames = loadDeliverableTemplates().map((t) => t.name)
  const [form, setForm] = useState<WorkstreamInput>(() => {
    if (workstream) {
      const current =
        workstream.category === 'Others' && workstream.name && workstream.name !== 'Others'
          ? workstream.name
          : workstream.name || workstream.category
      return {
        ...workstream,
        category: current,
        name: current,
        mpn: workstream.mpn ?? '',
        supplierId: workstream.supplierId || existingQ?.supplierId || existingPet?.supplierId || existingPo?.supplierId || '',
        remarks: workstream.remarks || existingPo?.remarks || existingPet?.remarks || existingQ?.remarks || '',
        startDate: '',
        targetDate: '',
        actualDate: '',
      }
    }
    return { ...emptyWorkstream(projectId), category: '', name: '' }
  })

  const [comm, setComm] = useState<DeliverableCommercialInput>(() => ({
    ...emptyDeliverableCommercial(projectId, workstream?.id ?? '', workstream?.supplierId ?? ''),
    quotationId: existingQ?.id,
    quotationNumber: existingQ?.number ?? '',
    petId: existingPet?.id,
    petReference: existingPet?.reference ?? '',
    poId: existingPo?.id,
    poNumber: existingPo?.number ?? '',
    poIssueDate: '',
    poAmount: existingPo?.amount ?? 0,
    poCurrency: existingPo?.currency ?? 'USD',
    expectedDelivery: existingPo?.expectedDelivery ?? '',
    actualDelivery: existingPo?.actualDelivery ?? '',
    deliveryStatus: normalizeHardwareStatus(existingPo),
  }))

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [autoCreateTasks, setAutoCreateTasks] = useState(!workstream)
  const [taskStartDate, setTaskStartDate] = useState(() => todayStr())

  const set = <K extends keyof WorkstreamInput>(k: K, v: WorkstreamInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setC = <K extends keyof DeliverableCommercialInput>(k: K, v: DeliverableCommercialInput[K]) => setComm((c) => ({ ...c, [k]: v }))

  // Deliverable choices come from the Deliverables tab; keep the current one selectable when editing legacy data.
  const deliverableOptions = Array.from(new Set([...templateNames, ...(workstream && form.name ? [form.name] : [])]))

  // Filter suppliers to only those with "+Deliverable" matching the selected deliverable
  const matchingSuppliers = form.name.trim()
    ? suppliers.filter((s) =>
        getSupplierDeliverables(s).some((d) => d.toLowerCase() === form.name.trim().toLowerCase()) ||
        (workstream && s.id === form.supplierId),
      )
    : []

  function handleDeliverableSelect(val: string) {
    setForm((f) => {
      const canCurrentDeliver =
        val &&
        suppliers.some(
          (s) =>
            s.id === f.supplierId &&
            getSupplierDeliverables(s).some((d) => d.toLowerCase() === val.toLowerCase()),
        )
      return {
        ...f,
        name: val,
        category: val,
        supplierId: canCurrentDeliver ? f.supplierId : '',
      }
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('Please select a deliverable. Create it in the Deliverables tab first if it is not listed.')
      return
    }
    setSaving(true)
    try {
      const deliverableName = form.name.trim()
      const payload: WorkstreamInput = {
        ...form,
        name: deliverableName,
        category: deliverableName,
        mpn: (form.mpn ?? '').trim(),
        startDate: '',
        targetDate: '',
        actualDate: '',
      }
      let wsId = workstream?.id ?? ''
      if (workstream) {
        await updateWorkstream(workstream.id, payload)
      } else {
        wsId = await createWorkstream(payload)
        if (autoCreateTasks) {
          await createTasksFromDeliverableTemplate({
            projectId: payload.projectId,
            workstreamId: wsId,
            supplierId: payload.supplierId,
            categoryOrName: deliverableName,
            startDate: taskStartDate,
          })
        }
      }

      await saveDeliverableCommercial(
        {
          ...comm,
          projectId: payload.projectId,
          workstreamId: wsId,
          supplierId: payload.supplierId,
          quotationId: existingQ?.id ?? comm.quotationId,
          petId: existingPet?.id ?? comm.petId,
          poId: existingPo?.id ?? comm.poId,
          remarks: payload.remarks,
        },
        true,
      )
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />

      {/* Deliverable Details */}
      <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3 space-y-3">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Deliverable Details</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Deliverable" required>
            <Select
              options={[
                { value: '', label: 'Select deliverable first…' },
                ...deliverableOptions.map((d) => ({ value: d, label: d })),
              ]}
              value={form.name}
              onChange={(e) => handleDeliverableSelect(e.target.value)}
            />
            <span className="mt-1 block text-[11px] leading-snug text-slate-500">
              Deliverable not listed? Create it first in the{' '}
              <Link to="/deliverables" className="font-semibold text-primary hover:underline">Deliverables</Link> tab.
            </span>
          </Field>

          <Field label="MPN">
            <Input
              value={form.mpn ?? ''}
              onChange={(e) => set('mpn', e.target.value)}
              placeholder="71F123456"
            />
          </Field>

          <Field label="Supplier">
            <Select
              disabled={!form.name.trim()}
              value={form.supplierId}
              onChange={(e) => set('supplierId', e.target.value)}
              options={
                !form.name.trim()
                  ? [{ value: '', label: '— Select deliverable first —' }]
                  : matchingSuppliers.length === 0
                    ? [{ value: '', label: `— No supplier with +${form.name} —` }]
                    : [{ value: '', label: '— None —' }, ...matchingSuppliers.map((s) => ({ value: s.id, label: s.name }))]
              }
            />
          </Field>

          <Field label="Hardware Status">
            <Select
              options={HARDWARE_STATUSES}
              value={HARDWARE_STATUSES.includes(comm.deliveryStatus as (typeof HARDWARE_STATUSES)[number]) ? comm.deliveryStatus : 'Not Started'}
              onChange={(e) => setC('deliveryStatus', e.target.value)}
            />
          </Field>
        </div>

        {!workstream && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80 text-xs">
            <label className="inline-flex items-center gap-2 text-slate-700 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={autoCreateTasks}
                onChange={(e) => setAutoCreateTasks(e.target.checked)}
              />
              Auto-create {findTemplateForDeliverable(form.name.trim()).length} tasks from the Deliverables template
            </label>
            {autoCreateTasks && (
              <label className="inline-flex items-center gap-1.5 text-slate-600">
                <span>Schedule Start:</span>
                <input
                  type="date"
                  value={taskStartDate}
                  onChange={(e) => setTaskStartDate(e.target.value)}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Stage 1: Quotation + Stage 2: PET */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-md border border-slate-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">1. Quotation</p>
          <Field label="Quotation Number">
            <Input value={comm.quotationNumber} onChange={(e) => setC('quotationNumber', e.target.value)} placeholder="Q-NOVA-1182" />
          </Field>
        </div>

        <div className="rounded-md border border-slate-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">2. PET (Project Expenditure Approval)</p>
          <Field label="PET Number">
            <Input value={comm.petReference} onChange={(e) => setC('petReference', e.target.value)} placeholder="PET-24-0132" />
          </Field>
        </div>
      </div>

      {/* Stage 3: PO & Delivery Tracking */}
      <div className="rounded-md border border-slate-200 p-3 space-y-3">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">3. Purchase Order (PO) & Hardware Delivery Tracking</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="PO Number">
            <Input value={comm.poNumber} onChange={(e) => setC('poNumber', e.target.value)} placeholder="PO-4500711" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="PO Amount">
              <Input type="number" min={0} step="0.01" value={comm.poAmount} onChange={(e) => setC('poAmount', Number(e.target.value))} />
            </Field>
            <Field label="Currency">
              <Select value={comm.poCurrency} onChange={(e) => setC('poCurrency', e.target.value)} options={CURRENCIES} />
            </Field>
          </div>
          <Field label="Expected Delivery">
            <Input type="date" value={comm.expectedDelivery} onChange={(e) => setC('expectedDelivery', e.target.value)} />
          </Field>
          <Field label="Actual Delivery">
            <Input type="date" value={comm.actualDelivery} onChange={(e) => setC('actualDelivery', e.target.value)} />
          </Field>
        </div>
      </div>

      <Field label="Remarks"><Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save Deliverable'}</Button>
      </div>
    </form>
  )
}
