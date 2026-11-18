import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, X } from 'lucide-react'
import type { Supplier, SupplierContact } from '@/types'
import {
  createSupplier,
  emptySupplier,
  getSupplierContacts,
  getSupplierDeliverables,
  updateSupplier,
  type SupplierInput,
} from '@/services/supplierService'
import { loadDeliverableTemplates } from '@/services/deliverableTemplateService'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal } from '@/components/ui'

export function SupplierForm({ open, supplier, onClose }: { open: boolean; supplier?: Supplier; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={supplier ? 'Edit Supplier' : 'Add Supplier'} wide>
      <Body key={`${open ? 'open' : 'closed'}-${supplier?.id ?? 'new'}-${supplier?.updatedAt ?? ''}`} supplier={supplier} onClose={onClose} />
    </Modal>
  )
}

function Body({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const availableTemplates = loadDeliverableTemplates().map((t) => t.name)

  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>(() =>
    supplier ? getSupplierDeliverables(supplier) : [],
  )

  const [form, setForm] = useState<SupplierInput>(() => {
    if (supplier) {
      const existingContacts = getSupplierContacts(supplier)
      return {
        ...supplier,
        contacts: existingContacts.length > 0 ? existingContacts : [{ contactPerson: '', role: '', phone: '', email: '' }],
      }
    }
    return emptySupplier()
  })

  const [error, setError] = useState('')
  const set = <K extends keyof SupplierInput>(k: K, v: SupplierInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const contacts: SupplierContact[] = form.contacts && form.contacts.length > 0
    ? form.contacts
    : [{ contactPerson: '', role: '', phone: '', email: '' }]

  function updateContactRow(idx: number, field: keyof SupplierContact, value: string) {
    const next = contacts.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    set('contacts', next)
  }

  function addContactRow() {
    set('contacts', [...contacts, { contactPerson: '', role: '', phone: '', email: '' }])
  }

  function removeContactRow(idx: number) {
    if (contacts.length <= 1) {
      set('contacts', [{ contactPerson: '', role: '', phone: '', email: '' }])
      return
    }
    set('contacts', contacts.filter((_, i) => i !== idx))
  }

  function addDeliverable(name: string) {
    setSelectedDeliverables((prev) => (prev.includes(name) ? prev : [...prev, name]))
  }

  function removeDeliverable(name: string) {
    setSelectedDeliverables((prev) => prev.filter((d) => d !== name))
  }

  const allDeliverableChoices = Array.from(new Set([...availableTemplates, ...selectedDeliverables]))
  const unselectedDeliverables = allDeliverableChoices.filter((d) => !selectedDeliverables.includes(d))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (selectedDeliverables.length === 0) {
      setError('Please select at least one deliverable that this supplier can deliver.')
      return
    }
    try {
      const payload: SupplierInput = {
        ...form,
        deliverables: selectedDeliverables,
        category: selectedDeliverables.join(', '),
        remarks: '',
        contacts,
      }
      if (supplier) await updateSupplier(supplier.id, payload)
      else await createSupplier(payload)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Supplier Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Nova Circuits Pte Ltd" />
        </Field>
        <Field label="Location">
          <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Singapore, Penang" />
        </Field>
      </div>

      {/* Supplier Contact Persons Table */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Supplier Contacts</span>
          <Button type="button" size="sm" onClick={addContactRow}>
            <Plus className="h-3.5 w-3.5" /> Add Contact Row
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-2.5 py-1.5 font-semibold w-8">#</th>
                <th className="px-2.5 py-1.5 font-semibold">Contact Person</th>
                <th className="px-2.5 py-1.5 font-semibold">Role</th>
                <th className="px-2.5 py-1.5 font-semibold">Phone Number</th>
                <th className="px-2.5 py-1.5 font-semibold">Email</th>
                <th className="px-2 py-1.5 font-semibold w-10 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, idx) => (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="px-2.5 py-1.5 text-slate-400 font-medium">{idx + 1}</td>
                  <td className="p-1.5">
                    <Input
                      value={c.contactPerson}
                      onChange={(e) => updateContactRow(idx, 'contactPerson', e.target.value)}
                      placeholder="Contact name…"
                      className="!py-1.5 text-xs"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      value={c.role ?? ''}
                      onChange={(e) => updateContactRow(idx, 'role', e.target.value)}
                      placeholder="e.g. Sales, Technical Support…"
                      className="!py-1.5 text-xs"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      value={c.phone}
                      onChange={(e) => updateContactRow(idx, 'phone', e.target.value)}
                      placeholder="+65 6123 4567"
                      className="!py-1.5 text-xs"
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="email"
                      value={c.email}
                      onChange={(e) => updateContactRow(idx, 'email', e.target.value)}
                      placeholder="name@supplier.example"
                      className="!py-1.5 text-xs"
                    />
                  </td>
                  <td className="p-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeContactRow(idx)}
                      title="Remove contact row"
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* What Supplier Can Deliver (Deliverables Selector) */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            What Supplier Can Deliver <span className="text-red-500">*</span>
          </span>
          <span className="text-[11px] text-slate-500">
            Need a new deliverable? Create it in the{' '}
            <Link to="/deliverables" className="text-primary font-semibold hover:underline">
              Deliverables
            </Link>{' '}
            tab.
          </span>
        </div>

        {/* Selected Deliverables */}
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 min-h-[44px]">
          <p className="text-[11px] font-medium text-slate-400 mb-1.5">Selected Deliverables (Supplier Capabilities):</p>
          {selectedDeliverables.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Click any +Deliverable button below to add what this supplier can make.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selectedDeliverables.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => removeDeliverable(d)}
                  title={`Remove ${d}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white px-3 py-1 text-xs font-semibold shadow-sm hover:bg-primary-hover transition-colors"
                >
                  <span>{d}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Available +Deliverable Buttons */}
        <div>
          <p className="text-[11px] font-medium text-slate-500 mb-1.5">Available Deliverables (Click to Add):</p>
          {unselectedDeliverables.length === 0 ? (
            <p className="text-xs text-slate-400">All available deliverables have been added.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unselectedDeliverables.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => addDeliverable(d)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary hover:bg-primary-soft transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>{d}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Supplier</Button>
      </div>
    </form>
  )
}
