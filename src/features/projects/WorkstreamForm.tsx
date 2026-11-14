import { useState } from 'react'
import { HARDWARE_CATEGORIES, WORKSTREAM_STATUSES, type Supplier, type Workstream } from '@/types'
import { createWorkstream, emptyWorkstream, updateWorkstream, type WorkstreamInput } from '@/services/workstreamService'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

export function WorkstreamForm({ open, projectId, workstream, suppliers, onClose }:
  { open: boolean; projectId: string; workstream?: Workstream; suppliers: Supplier[]; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={workstream ? 'Edit Deliverable' : 'Add Deliverable'} wide>
      <Body key={workstream?.id ?? 'new'} projectId={projectId} workstream={workstream} suppliers={suppliers} onClose={onClose} />
    </Modal>
  )
}

function Body({ projectId, workstream, suppliers, onClose }: { projectId: string; workstream?: Workstream; suppliers: Supplier[]; onClose: () => void }) {
  const [form, setForm] = useState<WorkstreamInput>(workstream ? { ...workstream } : emptyWorkstream(projectId))
  const [error, setError] = useState('')
  const set = <K extends keyof WorkstreamInput>(k: K, v: WorkstreamInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (workstream) await updateWorkstream(workstream.id, form)
      else await createWorkstream(form)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Deliverable Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. FX7200 Load Board" /></Field>
        <Field label="Hardware Category"><Select options={HARDWARE_CATEGORIES} value={form.category} onChange={(e) => set('category', e.target.value as WorkstreamInput['category'])} /></Field>
        <Field label="Supplier">
          <Select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}
            options={[{ value: '', label: '— None —' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
        </Field>
        <Field label="Status"><Select options={WORKSTREAM_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value as WorkstreamInput['status'])} /></Field>
        <Field label="Start Date"><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Target Completion Date"><Input type="date" value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></Field>
        <Field label="Actual Completion Date"><Input type="date" value={form.actualDate} onChange={(e) => set('actualDate', e.target.value)} /></Field>
        <Field label="Progress (%)"><Input type="number" min={0} max={100} value={form.progress} onChange={(e) => set('progress', Number(e.target.value))} /></Field>
      </div>
      <Field label="Remarks"><Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Deliverable</Button>
      </div>
    </form>
  )
}
