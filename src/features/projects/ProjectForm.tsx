import { useState } from 'react'
import { PROJECT_STATUSES, PRIORITIES, type Project } from '@/types'
import { emptyProject, createProject, updateProject, type ProjectInput } from '@/services/projectService'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

// Create / edit project dialog. `project` = editing, undefined = creating.
export function ProjectForm({ open, project, onClose }: { open: boolean; project?: Project; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={project ? 'Edit Project' : 'Create Project'} wide>
      {/* key resets the form every time a different project is opened */}
      <ProjectFormBody key={project?.id ?? 'new'} project={project} onClose={onClose} />
    </Modal>
  )
}

function ProjectFormBody({ project, onClose }: { project?: Project; onClose: () => void }) {
  const [form, setForm] = useState<ProjectInput>(project ? { ...project } : emptyProject())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (project) await updateProject(project.id, form)
      else await createProject(form)
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
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Project Code" required><Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="NPI-2404" /></Field>
        <Field label="Project Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Device Name"><Input value={form.deviceName} onChange={(e) => set('deviceName', e.target.value)} /></Field>
        <Field label="ATE Platform"><Input value={form.atePlatform} onChange={(e) => set('atePlatform', e.target.value)} /></Field>
        <Field label="Priority"><Select options={PRIORITIES} value={form.priority} onChange={(e) => set('priority', e.target.value as ProjectInput['priority'])} /></Field>
        <Field label="Status"><Select options={PROJECT_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value as ProjectInput['status'])} /></Field>
        <Field label="Start Date"><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Baseline Completion Date"><Input type="date" value={form.baselineDate} onChange={(e) => set('baselineDate', e.target.value)} /></Field>
        <Field label="Revised Completion Date"><Input type="date" value={form.revisedDate} onChange={(e) => set('revisedDate', e.target.value)} /></Field>
        <Field label="Actual Completion Date"><Input type="date" value={form.actualDate} onChange={(e) => set('actualDate', e.target.value)} /></Field>
        <Field label="Progress (%)"><Input type="number" min={0} max={100} value={form.progress} onChange={(e) => set('progress', Number(e.target.value))} /></Field>
      </div>
      <Field label="Description"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <Field label="Objectives"><Textarea value={form.objectives} onChange={(e) => set('objectives', e.target.value)} /></Field>
      <Field label="Remarks"><Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save Project'}</Button>
      </div>
    </form>
  )
}
