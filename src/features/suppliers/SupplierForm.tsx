import { useState } from 'react'
import { SUPPLIER_CATEGORIES, type Supplier } from '@/types'
import { createSupplier, emptySupplier, updateSupplier, type SupplierInput } from '@/services/supplierService'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

export function SupplierForm({ open, supplier, onClose }: { open: boolean; supplier?: Supplier; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={supplier ? 'Edit Supplier' : 'Add Supplier'}>
      <Body key={supplier?.id ?? 'new'} supplier={supplier} onClose={onClose} />
    </Modal>
  )
}

function Body({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const [form, setForm] = useState<SupplierInput>(supplier ? { ...supplier } : emptySupplier())
  const [error, setError] = useState('')
  const set = <K extends keyof SupplierInput>(k: K, v: SupplierInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (supplier) await updateSupplier(supplier.id, form)
      else await createSupplier(form)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <FormError message={error} />
      <Field label="Supplier Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Contact Person"><Input value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone Number"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Location"><Input value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Category"><Select options={SUPPLIER_CATEGORIES} value={form.category} onChange={(e) => set('category', e.target.value)} /></Field>
      </div>
      <Field label="Remarks"><Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Supplier</Button>
      </div>
    </form>
  )
}
