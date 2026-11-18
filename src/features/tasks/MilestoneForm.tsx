import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Star, X } from 'lucide-react'
import { type Milestone, type Project } from '@/types'
import { createMilestone, emptyMilestone, updateMilestone, type MilestoneInput } from '@/services/milestoneService'
import { useTable } from '@/hooks/useTable'
import { cn } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Select, Textarea } from '@/components/ui'

export function MilestoneForm({ open, milestone, defaultProjectId, defaultTargetDate, onClose }: { open: boolean; milestone?: Milestone; defaultProjectId?: string; defaultTargetDate?: string; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <aside
      aria-hidden={!open}
      className={cn(
        'fixed inset-y-0 left-0 z-[60] w-full max-w-md flex flex-col gap-3 p-3 transition-transform duration-300 ease-in-out pointer-events-none',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Island 1: Top Header Island */}
      <div className="pointer-events-auto flex h-12 items-center justify-between rounded-full liquid-glass shadow-xl px-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20 shrink-0">
            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 truncate leading-tight">
            {milestone ? 'Edit Milestone' : 'Add Milestone'}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors"
          title="Close"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Island 2: Content Island */}
      <div className="pointer-events-auto flex-1 flex flex-col rounded-3xl liquid-glass shadow-2xl overflow-hidden min-h-0">
        <div className="p-4 overflow-y-auto flex-1">
          <MilestoneFormBody
            key={`${open ? 'open' : 'closed'}-${milestone?.id ?? 'new'}-${milestone?.updatedAt ?? ''}-${defaultTargetDate ?? ''}`}
            milestone={milestone}
            defaultProjectId={defaultProjectId}
            defaultTargetDate={defaultTargetDate}
            compact
            onClose={onClose}
          />
        </div>
      </div>
    </aside>,
    document.body,
  )
}

export function MilestoneFormBody({ milestone, defaultProjectId, defaultTargetDate, compact = false, onClose }: { milestone?: Milestone; defaultProjectId?: string; defaultTargetDate?: string; compact?: boolean; onClose: () => void }) {
  const projects = useTable<Project>('projects') ?? []
  const [form, setForm] = useState<MilestoneInput>(() => {
    if (milestone) return { ...milestone, workstreamId: '' }
    const base = emptyMilestone(defaultProjectId)
    return { ...base, targetDate: defaultTargetDate || base.targetDate }
  })
  const [error, setError] = useState('')
  const set = <K extends keyof MilestoneInput>(k: K, v: MilestoneInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const payload: MilestoneInput = { ...form, workstreamId: '' }
      if (milestone) await updateMilestone(milestone.id, payload)
      else await createMilestone(payload)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className={compact ? 'space-y-2.5' : 'space-y-3'}>
      <FormError message={error} />
      <Field label="Milestone Name" required>
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Tape Out Date, Drawing Approval Cut-off" />
      </Field>
      <Field label="Project (HRS Number)" required>
        <Select
          value={form.projectId}
          onChange={(e) => set('projectId', e.target.value)}
          options={[{ value: '', label: 'Select project…' }, ...projects.map((p) => ({ value: p.id, label: `${p.code}${p.deviceName ? ` – ${p.deviceName}` : ''}` }))]}
        />
      </Field>
      <Field label="Description"><Textarea rows={compact ? 2 : 3} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Target Date" required><Input type="date" value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></Field>
        <Field label="Actual Completion Date"><Input type="date" value={form.actualDate} onChange={(e) => set('actualDate', e.target.value)} /></Field>
      </div>
      <Field label="Remarks"><Textarea rows={compact ? 2 : 3} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Milestone</Button>
      </div>
    </form>
  )
}
