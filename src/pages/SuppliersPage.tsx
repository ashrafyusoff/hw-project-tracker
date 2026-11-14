import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { db } from '@/database/db'
import { useTable } from '@/hooks/useTable'
import type { Project, Supplier } from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loading, Modal, Select } from '@/components/ui'
import { SupplierForm } from '@/features/suppliers/SupplierForm'
import { deleteSupplier, linkSupplierToProject, unlinkSupplierFromProject } from '@/services/supplierService'
import { formatDate } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

export function SuppliersPage() {
  const suppliers = useTable<Supplier>('suppliers')
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | undefined>()
  const [deleting, setDeleting] = useState<Supplier | undefined>()
  const [detailId, setDetailId] = useState('')
  const [error, setError] = useState('')

  // Handle links from the top bar (?new=1 or ?open=<id>)
  useEffect(() => {
    if (params.get('new')) { setEditing(undefined); setFormOpen(true); setParams({}, { replace: true }) }
    const open = params.get('open')
    if (open) { setDetailId(open); setParams({}, { replace: true }) }
  }, [params, setParams])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (suppliers ?? [])
      .filter((s) => !q || `${s.name} ${s.contactPerson} ${s.email} ${s.location} ${s.category}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [suppliers, search])

  if (!suppliers) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-64" />
        <Button variant="primary" className="ml-auto" onClick={() => { setEditing(undefined); setFormOpen(true) }}><Plus className="h-4 w-4" /> Add Supplier</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Card className="!p-0">
        {rows.length === 0 ? (
          <EmptyState title={suppliers.length === 0 ? 'No suppliers yet' : 'No suppliers match your search'} hint={suppliers.length === 0 ? 'Click "Add Supplier" to start your directory.' : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 text-left bg-slate-50">
                <tr>{['Supplier', 'Category', 'Contact', 'Email', 'Phone', 'Location', 'Actions'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} onClick={() => setDetailId(s.id)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td className="px-3 py-2.5 font-medium text-primary">{s.name}</td>
                    <td className="px-3"><Badge color="blue">{s.category}</Badge></td>
                    <td className="px-3">{s.contactPerson}</td><td className="px-3 text-slate-500">{s.email}</td>
                    <td className="px-3 whitespace-nowrap">{s.phone}</td><td className="px-3">{s.location}</td>
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => { setEditing(s); setFormOpen(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" aria-label="Delete" onClick={() => setDeleting(s)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SupplierForm open={formOpen} supplier={editing} onClose={() => setFormOpen(false)} />
      <SupplierDetail supplierId={detailId} onClose={() => setDetailId('')} />
      <ConfirmDialog open={!!deleting} title="Delete supplier?" onCancel={() => setDeleting(undefined)}
        onConfirm={async () => { try { await deleteSupplier(deleting!.id) } catch (e) { setError(errorMessage(e)) } setDeleting(undefined) }}
        message={<>Delete <b>{deleting?.name}</b>? It will be removed from all projects. Deliverables, tasks and commercial records that used it are kept, but their supplier is cleared.</>} />
    </div>
  )
}

// Detail panel: everything related to one supplier.
function SupplierDetail({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const [linkId, setLinkId] = useState('')
  const [error, setError] = useState('')
  const data = useLiveQuery(async () => {
    if (!supplierId) return null
    const [supplier, links, workstreams, tasks, quotations, pets, projects] = await Promise.all([
      db.suppliers.get(supplierId),
      db.projectSuppliers.where('supplierId').equals(supplierId).toArray(),
      db.workstreams.where('supplierId').equals(supplierId).toArray(),
      db.tasks.where('supplierId').equals(supplierId).toArray(),
      db.quotations.where('supplierId').equals(supplierId).toArray(),
      db.petRecords.where('supplierId').equals(supplierId).toArray(),
      db.projects.toArray(),
    ])
    return { supplier, links, workstreams, tasks, quotations, pets, projects }
  }, [supplierId])

  const open = !!supplierId
  if (!open) return null
  if (!data || !data.supplier) return <Modal open onClose={onClose} title="Supplier"><Loading /></Modal>
  const { supplier: s, links, workstreams, tasks, quotations, pets, projects } = data
  const proj = (id: string): Project | undefined => projects.find((p) => p.id === id)
  const linked = links.map((l) => proj(l.projectId)).filter((p): p is Project => !!p)
  const available = projects.filter((p) => !links.some((l) => l.projectId === p.id))
  const followUps = [
    ...tasks.filter((t) => t.status === 'Waiting for Supplier').map((t) => `Task: ${t.name} (${proj(t.projectId)?.code ?? ''})`),
    ...quotations.filter((q) => !q.receivedDate).map((q) => `Quotation ${q.number} awaiting quote`),
    ...pets.filter((r) => !r.approvalDate).map((r) => `PET ${r.reference} pending approval`),
  ]
  const run = async (fn: () => Promise<void>) => { try { setError(''); await fn() } catch (e) { setError(errorMessage(e)) } }

  return (
    <Modal open onClose={onClose} title={s.name} wide>
      <div className="space-y-5 text-sm">
        <div className="grid sm:grid-cols-2 gap-2 text-slate-600">
          <p><b className="text-slate-800">Contact:</b> {s.contactPerson || '—'}</p><p><b className="text-slate-800">Category:</b> {s.category}</p>
          <p><b className="text-slate-800">Email:</b> {s.email || '—'}</p><p><b className="text-slate-800">Phone:</b> {s.phone || '—'}</p>
          <p><b className="text-slate-800">Location:</b> {s.location || '—'}</p><p><b className="text-slate-800">Remarks:</b> {s.remarks || '—'}</p>
        </div>
        {error && <p className="text-red-600">{error}</p>}

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Associated Projects</h3>
            <div className="flex gap-2">
              <Select className="!w-48 !py-1 text-xs" value={linkId} onChange={(e) => setLinkId(e.target.value)}
                options={[{ value: '', label: available.length ? 'Assign to project…' : 'All projects assigned' }, ...available.map((p) => ({ value: p.id, label: `${p.code} – ${p.name}` }))]} />
              <Button size="sm" variant="primary" disabled={!linkId} onClick={() => run(async () => { await linkSupplierToProject(linkId, s.id); setLinkId('') })}>Assign</Button>
            </div>
          </div>
          {linked.length === 0 ? <p className="text-slate-400">Not assigned to any project.</p> : (
            <ul className="space-y-1">
              {linked.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded border border-slate-100 px-3 py-1.5">
                  <Link to={`/projects/${p.id}`} className="text-primary hover:underline">{p.code} – {p.name}</Link>
                  <span className="flex items-center gap-2"><Badge>{p.status}</Badge>
                    <button aria-label="Remove from project" className="text-slate-400 hover:text-red-600" onClick={() => run(() => unlinkSupplierFromProject(p.id, s.id))}><X className="h-4 w-4" /></button></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold mb-2">Deliverables</h3>
          {workstreams.length === 0 ? <p className="text-slate-400">None.</p> : <ul className="space-y-1">{workstreams.map((w) => <li key={w.id}>{w.name} <span className="text-slate-400">· {proj(w.projectId)?.code} · {w.status}</span></li>)}</ul>}
        </section>

        <section>
          <h3 className="font-semibold mb-2">Related Tasks</h3>
          {tasks.length === 0 ? <p className="text-slate-400">None.</p> : (
            <ul className="space-y-1">{tasks.map((t) => <li key={t.id} className="flex justify-between"><span>{t.name} <span className="text-slate-400">· {proj(t.projectId)?.code}</span></span><span className="text-slate-500">{t.status} · due {formatDate(t.dueDate)}</span></li>)}</ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold mb-2">Pending Follow-ups</h3>
          {followUps.length === 0 ? <p className="text-slate-400">Nothing pending.</p> : <ul className="list-disc pl-5 space-y-1">{followUps.map((f) => <li key={f}>{f}</li>)}</ul>}
        </section>
      </div>
    </Modal>
  )
}
