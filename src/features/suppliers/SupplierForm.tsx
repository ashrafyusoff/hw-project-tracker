import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { HARDWARE_CATEGORIES, type Supplier, type SupplierContact } from '@/types'
import { createSupplier, emptySupplier, getSupplierContacts, updateSupplier, type SupplierInput } from '@/services/supplierService'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

const PRESET_CATEGORIES = HARDWARE_CATEGORIES.filter((c) => c !== 'Others') as readonly string[]

function parseSupplierCategory(rawCategory?: string): { select: string; custom: string } {
  if (!rawCategory) return { select: 'PCB', custom: '' }
  if (PRESET_CATEGORIES.includes(rawCategory)) {
    return { select: rawCategory, custom: '' }
  }
  const match = rawCategory.match(/^Others\s*\((.+)\)$/i)
  if (match) {
    return { select: 'Others', custom: match[1].trim() }
  }
  if (rawCategory === 'Others' || rawCategory === 'Other') {
    return { select: 'Others', custom: '' }
  }
  return { select: 'Others', custom: rawCategory }
}

export function SupplierForm({ open, supplier, onClose }: { open: boolean; supplier?: Supplier; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={supplier ? 'Edit Supplier' : 'Add Supplier'} wide>
      <Body key={`${open ? 'open' : 'closed'}-${supplier?.id ?? 'new'}-${supplier?.updatedAt ?? ''}`} supplier={supplier} onClose={onClose} />
    </Modal>
  )
}

function Body({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const initialCat = parseSupplierCategory(supplier?.category)
  const [categorySelect, setCategorySelect] = useState<string>(initialCat.select)
  const [customHardware, setCustomHardware] = useState<string>(initialCat.custom)

  const [form, setForm] = useState<SupplierInput>(() => {
    if (supplier) {
      const existingContacts = getSupplierContacts(supplier)
      return {
        ...supplier,
        contacts: existingContacts.length > 0 ? existingContacts : [{ contactPerson: '', phone: '', email: '' }],
      }
    }
    return emptySupplier()
  })

  const [error, setError] = useState('')
  const set = <K extends keyof SupplierInput>(k: K, v: SupplierInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const contacts: SupplierContact[] = form.contacts && form.contacts.length > 0
    ? form.contacts
    : [{ contactPerson: '', phone: '', email: '' }]

  function updateContactRow(idx: number, field: keyof SupplierContact, value: string) {
    const next = contacts.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    set('contacts', next)
  }

  function addContactRow() {
    set('contacts', [...contacts, { contactPerson: '', phone: '', email: '' }])
  }

  function removeContactRow(idx: number) {
    if (contacts.length <= 1) {
      set('contacts', [{ contactPerson: '', phone: '', email: '' }])
      return
    }
    set('contacts', contacts.filter((_, i) => i !== idx))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (categorySelect === 'Others' && !customHardware.trim()) {
      setError('Please specify the hardware name for "Others".')
      return
    }
    const finalCategory = categorySelect === 'Others' ? `Others (${customHardware.trim()})` : categorySelect
    try {
      const payload: SupplierInput = {
        ...form,
        category: finalCategory,
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

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Supplier Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Nova Circuits Pte Ltd" />
        </Field>
        <Field label="Category (Deliverable / Hardware)" required>
          <Select
            options={HARDWARE_CATEGORIES}
            value={categorySelect}
            onChange={(e) => setCategorySelect(e.target.value)}
          />
        </Field>
        {categorySelect === 'Others' ? (
          <Field label="Specify Hardware Name (Others)" required>
            <Input
              value={customHardware}
              onChange={(e) => setCustomHardware(e.target.value)}
              placeholder="Write hardware name…"
            />
          </Field>
        ) : (
          <Field label="Location">
            <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Singapore, Penang" />
          </Field>
        )}
      </div>

      {categorySelect === 'Others' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Location">
            <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Singapore, Penang" />
          </Field>
        </div>
      )}

      {/* Supplier Contact Persons Table (Single-row per contact + Add Row button) */}
      <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Supplier Contacts</span>
          <Button type="button" size="sm" onClick={addContactRow}>
            <Plus className="h-3.5 w-3.5" /> Add Contact Row
          </Button>
        </div>

        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-2.5 py-1.5 font-semibold w-8">#</th>
                <th className="px-2.5 py-1.5 font-semibold">Contact Person</th>
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

      <Field label="Remarks">
        <Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Supplier</Button>
      </div>
    </form>
  )
}
