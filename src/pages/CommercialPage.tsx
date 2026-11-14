import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import type { PetRecord, PoRecord, Project, Quotation, Supplier, Workstream } from '@/types'
import { Button, Card, Input, Loading, Select } from '@/components/ui'
import {
  CommercialBadge,
  DeliverableCommercialModal,
  UnifiedCommercialTable,
  buildDeliverableCommercialRows,
  rowToCommercialInput,
} from '@/features/commercial/CommercialForms'
import type { DeliverableCommercialInput } from '@/services/commercialService'

export { CommercialBadge }

export function CommercialPage() {
  const workstreams = useTable<Workstream>('workstreams')
  const quotations = useTable<Quotation>('quotations')
  const pets = useTable<PetRecord>('petRecords')
  const pos = useTable<PoRecord>('poRecords')
  const projects = useTable<Project>('projects')
  const suppliers = useTable<Supplier>('suppliers')

  const [search, setSearch] = useState('')
  const [fProject, setFProject] = useState('')
  const [fSupplier, setFSupplier] = useState('')
  const [commOpen, setCommOpen] = useState(false)
  const [commInitial, setCommInitial] = useState<DeliverableCommercialInput | undefined>()

  const rows = useMemo(() => {
    if (!workstreams || !quotations || !pets || !pos || !projects || !suppliers) return []
    const all = buildDeliverableCommercialRows(workstreams, quotations, pets, pos, projects, suppliers)
    const q = search.trim().toLowerCase()
    return all
      .filter((r) => !fProject || r.projectId === fProject)
      .filter((r) => !fSupplier || r.supplierId === fSupplier)
      .filter((r) => {
        if (!q) return true
        const text = `${r.projectCode} ${r.projectName} ${r.workstream.name} ${r.supplierName} ${r.quotation?.number ?? ''} ${r.pet?.reference ?? ''} ${r.po?.number ?? ''}`
        return text.toLowerCase().includes(q)
      })
  }, [workstreams, quotations, pets, pos, projects, suppliers, search, fProject, fSupplier])

  if (!workstreams || !quotations || !pets || !pos || !projects || !suppliers) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search deliverable, quote, PET, PO…" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-64" />
        <Select
          className="!w-44"
          value={fProject}
          onChange={(e) => setFProject(e.target.value)}
          options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: `${p.code} – ${p.name}` }))]}
        />
        <Select
          className="!w-48"
          value={fSupplier}
          onChange={(e) => setFSupplier(e.target.value)}
          options={[{ value: '', label: 'All suppliers' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <Button
          variant="primary"
          className="ml-auto"
          onClick={() => {
            setCommInitial(undefined)
            setCommOpen(true)
          }}
        >
          <Plus className="h-4 w-4" /> Update Deliverable Commercial
        </Button>
      </div>

      <Card className="!p-0">
        <UnifiedCommercialTable
          rows={rows}
          showProject={true}
          onEditRow={(r) => {
            setCommInitial(rowToCommercialInput(r))
            setCommOpen(true)
          }}
          onAddCommercial={() => {
            setCommInitial(undefined)
            setCommOpen(true)
          }}
        />
      </Card>

      <DeliverableCommercialModal
        open={commOpen}
        initial={commInitial}
        defaultProjectId={fProject}
        onClose={() => setCommOpen(false)}
      />
    </div>
  )
}
