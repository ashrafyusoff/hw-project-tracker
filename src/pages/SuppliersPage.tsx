import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import { db } from '@/database/db'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { Project, Supplier } from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loading, Modal, Select } from '@/components/ui'
import { TabSaveControls } from '@/components/TabSaveControls'
import { SupplierForm } from '@/features/suppliers/SupplierForm'
import { deleteSupplier, getSupplierContacts, getSupplierDeliverables, linkSupplierToProject, unlinkSupplierFromProject } from '@/services/supplierService'
import { formatDate } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

export function SuppliersPage() {
  const suppliers = useTable<Supplier>('suppliers')
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = usePersistedState<string>('npi.suppliers.search', '')
  const [expandedIds, setExpandedIds] = usePersistedState<Record<string, boolean>>('npi.suppliers.expandedIds', {})
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
      .filter((s) => {
        if (!q) return true
        const contactsText = getSupplierContacts(s)
          .map((c) => `${c.contactPerson} ${c.role ?? ''} ${c.email} ${c.phone}`)
          .join(' ')
        const delivsText = getSupplierDeliverables(s).join(' ')
        return `${s.name} ${s.location} ${delivsText} ${contactsText}`.toLowerCase().includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [suppliers, search])

  if (!suppliers) return <Loading />

  const suppliersFingerprint = JSON.stringify(suppliers)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search suppliers, category, contact, email…" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-72" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }}><Plus className="h-4 w-4" /> Add Supplier</Button>
          <TabSaveControls
            tabKey="suppliers"
            tabLabel="Suppliers"
            buttonLabel="Save Suppliers"
            fingerprint={suppliersFingerprint}
            currentPathPrefix="/suppliers"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Card className="!p-0">
        {rows.length === 0 ? (
          <EmptyState title={suppliers.length === 0 ? 'No suppliers yet' : 'No suppliers match your search'} hint={suppliers.length === 0 ? 'Click "Add Supplier" to start your directory.' : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[11px] text-slate-600 text-left bg-slate-100">
                <tr>{['Supplier', 'Deliverables', 'Contact Person', 'Role', 'Email', 'Phone', 'Location', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const contacts = getSupplierContacts(s)
                  const first = contacts[0] ?? { contactPerson: '—', role: '—', email: '—', phone: '—' }
                  const extraContacts = contacts.slice(1)
                  const isExpanded = !!expandedIds[s.id]
                  return (
                    <SupplierRowGroup
                      key={s.id}
                      supplier={s}
                      firstContact={first}
                      extraContacts={extraContacts}
                      expanded={isExpanded}
                      onToggleExpand={() => setExpandedIds((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                      onOpenDetail={() => setDetailId(s.id)}
                      onEdit={() => { setEditing(s); setFormOpen(true) }}
                      onDelete={() => setDeleting(s)}
                    />
                  )
                })}
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

function SupplierRowGroup({
  supplier: s,
  firstContact,
  extraContacts,
  expanded,
  onToggleExpand,
  onOpenDetail,
  onEdit,
  onDelete,
}: {
  supplier: Supplier
  firstContact: { contactPerson: string; role?: string; email: string; phone: string }
  extraContacts: { contactPerson: string; role?: string; email: string; phone: string }[]
  expanded: boolean
  onToggleExpand: () => void
  onOpenDetail: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const hasMore = extraContacts.length > 0
  return (
    <>
      <tr onClick={onOpenDetail} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
        <td className="px-3 py-2.5 font-medium text-primary whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {hasMore ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand()
                }}
                className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
                title={expanded ? 'Collapse extra contacts' : `Show ${extraContacts.length} more contact(s)`}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="text-[10px] font-semibold text-slate-500">+{extraContacts.length}</span>
              </button>
            ) : (
              <span className="w-6 inline-block" />
            )}
            <span>{s.name}</span>
          </div>
        </td>
        <td className="px-3">
          <div className="flex flex-wrap gap-1">
            {getSupplierDeliverables(s).map((d) => (
              <Badge key={d} color="blue">{d}</Badge>
            ))}
          </div>
        </td>
        <td className="px-3 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <span>{firstContact.contactPerson || '—'}</span>
            {hasMore && !expanded && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand()
                }}
                className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-primary px-1.5 py-0.5 text-[10px] font-medium"
                title="Click to expand all contacts"
              >
                <Users className="h-2.5 w-2.5" /> +{extraContacts.length} more
              </button>
            )}
          </div>
        </td>
        <td className="px-3 text-slate-600 whitespace-nowrap">{firstContact.role || '—'}</td>
        <td className="px-3 text-slate-500 whitespace-nowrap">{firstContact.email || '—'}</td>
        <td className="px-3 whitespace-nowrap">{firstContact.phone || '—'}</td>
        <td className="px-3 whitespace-nowrap">{s.location || '—'}</td>
        <td className="px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" aria-label="Edit" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" aria-label="Delete" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
          </div>
        </td>
      </tr>

      {/* Expanded additional contact person rows */}
      {expanded && extraContacts.map((c, idx) => {
        const isLast = idx === extraContacts.length - 1
        return (
          <tr key={idx} className="border-t border-slate-100 bg-slate-50/70 text-xs">
            <td className="pl-9 pr-3 py-1.5 text-slate-400 whitespace-nowrap">
              <span className="font-mono font-bold mr-1.5">{isLast ? '└─' : '├─'}</span>
              <span>Contact #{idx + 2}</span>
            </td>
            <td className="px-3 py-1.5 text-slate-400">—</td>
            <td className="px-3 py-1.5 font-medium text-slate-700 whitespace-nowrap">{c.contactPerson || '—'}</td>
            <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{c.role || '—'}</td>
            <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{c.email || '—'}</td>
            <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{c.phone || '—'}</td>
            <td className="px-3 py-1.5 text-slate-400">—</td>
            <td className="px-3 py-1.5 text-slate-400">—</td>
          </tr>
        )
      })}
    </>
  )
}

// Detail panel: everything related to one supplier.
function SupplierDetail({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const [linkId, setLinkId] = useState('')
  const [error, setError] = useState('')
  const data = useLiveQuery(async () => {
    if (!supplierId) return null
    const [supplier, links, workstreams, tasks, projects] = await Promise.all([
      db.suppliers.get(supplierId),
      db.projectSuppliers.where('supplierId').equals(supplierId).toArray(),
      db.workstreams.where('supplierId').equals(supplierId).toArray(),
      db.tasks.where('supplierId').equals(supplierId).toArray(),
      db.projects.toArray(),
    ])
    return { supplier, links, workstreams, tasks, projects }
  }, [supplierId])

  const open = !!supplierId
  if (!open) return null
  if (!data || !data.supplier) return <Modal open onClose={onClose} title="Supplier"><Loading /></Modal>
  const { supplier: s, links, workstreams, tasks, projects } = data
  const contacts = getSupplierContacts(s)
  const proj = (id: string): Project | undefined => projects.find((p) => p.id === id)
  const linked = links.map((l) => proj(l.projectId)).filter((p): p is Project => !!p)
  const available = projects.filter((p) => !links.some((l) => l.projectId === p.id))
  const run = async (fn: () => Promise<void>) => { try { setError(''); await fn() } catch (e) { setError(errorMessage(e)) } }

  return (
    <Modal open onClose={onClose} title={s.name} wide>
      <div className="space-y-5 text-sm">
        <div className="grid sm:grid-cols-2 gap-2 text-slate-600">
          <p><b className="text-slate-800">Deliverables:</b> {getSupplierDeliverables(s).join(', ') || '—'}</p>
          <p><b className="text-slate-800">Location:</b> {s.location || '—'}</p>
        </div>

        {/* All Contacts Table */}
        <section>
          <h3 className="font-semibold mb-2">Contact Persons ({contacts.length})</h3>
          {contacts.length === 0 ? (
            <p className="text-slate-400">No contacts listed.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 text-left">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">#</th>
                    <th className="px-3 py-1.5 font-medium">Contact Person</th>
                    <th className="px-3 py-1.5 font-medium">Role</th>
                    <th className="px-3 py-1.5 font-medium">Phone Number</th>
                    <th className="px-3 py-1.5 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-800">{c.contactPerson || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{c.role || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{c.phone || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{c.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

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
      </div>
    </Modal>
  )
}
