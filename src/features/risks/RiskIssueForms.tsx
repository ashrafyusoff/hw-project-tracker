import { useState } from 'react'
import { useTable } from '@/hooks/useTable'
import type { Issue, Project, Risk, Workstream } from '@/types'
import {
  createIssue, createRisk, emptyIssue, emptyRisk, updateIssue, updateRisk,
  type IssueInput, type RiskInput,
} from '@/services/riskIssueService'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

export const LEVELS = ['Low', 'Medium', 'High'] as const
export const RISK_STATUSES = ['Open', 'Mitigating', 'Monitoring', 'Closed'] as const
export const ISSUE_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'] as const

function autoLevel(prob: string, impact: string): string {
  const s = (v: string) => (v === 'High' ? 3 : v === 'Medium' ? 2 : 1)
  const score = s(prob) * s(impact)
  return score >= 6 ? 'High' : score >= 3 ? 'Medium' : 'Low'
}

// ---------- Risk Form ----------
export function RiskForm({ open, record, defaultProjectId, onClose }: { open: boolean; record?: Risk; defaultProjectId?: string; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={record ? 'Edit Risk' : 'Add Risk'} wide>
      <RiskBody key={record?.id ?? 'new'} record={record} defaultProjectId={defaultProjectId} onClose={onClose} />
    </Modal>
  )
}

function RiskBody({ record, defaultProjectId, onClose }: { record?: Risk; defaultProjectId?: string; onClose: () => void }) {
  const projects = useTable<Project>('projects') ?? []
  const [form, setForm] = useState<RiskInput>(record ? { ...record } : emptyRisk(defaultProjectId))
  const [error, setError] = useState('')
  const set = <K extends keyof RiskInput>(k: K, v: RiskInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try { if (record) await updateRisk(record.id, form); else await createRisk(form); onClose() } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Risk Title" required><Input value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Project" required>
          <Select value={form.projectId} onChange={(e) => set('projectId', e.target.value)}
            options={[{ value: '', label: 'Select project…' }, ...projects.map((p) => ({ value: p.id, label: `${p.code} – ${p.name}` }))]} />
        </Field>
        <Field label="Probability">
          <Select options={LEVELS} value={form.probability}
            onChange={(e) => { const p = e.target.value; setForm((f) => ({ ...f, probability: p, level: autoLevel(p, f.impact) })) }} />
        </Field>
        <Field label="Impact">
          <Select options={LEVELS} value={form.impact}
            onChange={(e) => { const im = e.target.value; setForm((f) => ({ ...f, impact: im, level: autoLevel(f.probability, im) })) }} />
        </Field>
        <Field label="Risk Level"><Select options={LEVELS} value={form.level} onChange={(e) => set('level', e.target.value)} /></Field>
        <Field label="Status"><Select options={RISK_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value)} /></Field>
        <Field label="Owner"><Input value={form.owner} onChange={(e) => set('owner', e.target.value)} /></Field>
      </div>
      <Field label="Description"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <Field label="Mitigation Plan"><Textarea value={form.mitigation} onChange={(e) => set('mitigation', e.target.value)} /></Field>
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save Risk</Button></div>
    </form>
  )
}

// ---------- Engineering Issue Form ----------
export function IssueForm({ open, record, defaultProjectId, onClose }: { open: boolean; record?: Issue; defaultProjectId?: string; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={record ? 'Edit Engineering Issue' : 'Add Engineering Issue'} wide>
      <IssueBody key={record?.id ?? 'new'} record={record} defaultProjectId={defaultProjectId} onClose={onClose} />
    </Modal>
  )
}

function IssueBody({ record, defaultProjectId, onClose }: { record?: Issue; defaultProjectId?: string; onClose: () => void }) {
  const projects = useTable<Project>('projects') ?? []
  const workstreams = useTable<Workstream>('workstreams') ?? []
  const [form, setForm] = useState<IssueInput>(record ? { ...record } : emptyIssue(defaultProjectId))
  const [error, setError] = useState('')
  const set = <K extends keyof IssueInput>(k: K, v: IssueInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try { if (record) await updateIssue(record.id, form); else await createIssue(form); onClose() } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <Field label="Issue Title" required><Input value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Project" required>
          <Select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value, workstreamId: '' }))}
            options={[{ value: '', label: 'Select project…' }, ...projects.map((p) => ({ value: p.id, label: `${p.code} – ${p.name}` }))]} />
        </Field>
        <Field label="Hardware Workstream">
          <Select value={form.workstreamId} onChange={(e) => set('workstreamId', e.target.value)}
            options={[{ value: '', label: '— None —' }, ...workstreams.filter((w) => w.projectId === form.projectId).map((w) => ({ value: w.id, label: w.name }))]} />
        </Field>
        <Field label="Responsible Person"><Input value={form.responsible} onChange={(e) => set('responsible', e.target.value)} /></Field>
        <Field label="Status"><Select options={ISSUE_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value)} /></Field>
        <Field label="Date Raised"><Input type="date" value={form.dateRaised} onChange={(e) => set('dateRaised', e.target.value)} /></Field>
        <Field label="Target Resolution Date"><Input type="date" value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></Field>
        <Field label="Actual Resolution Date"><Input type="date" value={form.actualDate} onChange={(e) => set('actualDate', e.target.value)} /></Field>
      </div>
      <Field label="Issue Description"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <Field label="Root Cause"><Textarea value={form.rootCause} onChange={(e) => set('rootCause', e.target.value)} /></Field>
      <Field label="Corrective Action"><Textarea value={form.correctiveAction} onChange={(e) => set('correctiveAction', e.target.value)} /></Field>
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save Issue</Button></div>
    </form>
  )
}
