import { useState } from 'react'
import { HW_TYPES, PROJECT_STATUSES, type Project } from '@/types'
import { emptyProject, createProject, updateProject, type ProjectInput } from '@/services/projectService'
import { todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'


// Create / edit project dialog. `project` = editing, undefined = creating.
export function ProjectForm({ open, project, onClose }: { open: boolean; project?: Project; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={project ? 'Edit Project' : 'Create Project'} wide>
      {/* key resets the form every time a different or updated project is opened */}
      <ProjectFormBody key={`${open ? 'open' : 'closed'}-${project?.id ?? 'new'}-${project?.updatedAt ?? ''}`} project={project} onClose={onClose} />
    </Modal>
  )
}

function ProjectFormBody({ project, onClose }: { project?: Project; onClose: () => void }) {
  const [form, setForm] = useState<ProjectInput>(() =>
    project
      ? { ...project, hwType: project.hwType || 'FT', startDate: project.startDate || project.createdAt?.slice(0, 10) || todayStr() }
      : emptyProject(),
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload: ProjectInput = {
        ...form,
        hwType: form.hwType || 'FT',
        name: form.deviceName.trim() || form.code.trim(),
      }
      if (project) await updateProject(project.id, payload)
      else await createProject(payload)
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
        <Field label="HRS Number" required>
          <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="123456" maxLength={6} />
        </Field>
        <Field label="HW Type" required>
          <Select options={HW_TYPES} value={form.hwType || 'FT'} onChange={(e) => set('hwType', e.target.value as ProjectInput['hwType'])} />
        </Field>
        <Field label="Device Name">
          <Input value={form.deviceName} onChange={(e) => set('deviceName', e.target.value)} />
        </Field>
        <Field label="ATE Platform">
          <Input value={form.atePlatform} onChange={(e) => set('atePlatform', e.target.value)} />
        </Field>
        <Field label="Status">
          <Select options={PROJECT_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value as ProjectInput['status'])} />
        </Field>
        <Field label="Start Date (Creation Date)">
          <Input type="date" value={form.startDate} disabled readOnly className="bg-slate-100 text-slate-500 cursor-not-allowed" />
        </Field>
        <Field label="HW Required Date">
          <Input type="date" value={form.baselineDate} onChange={(e) => set('baselineDate', e.target.value)} />
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save Project'}</Button>
      </div>
    </form>
  )
}
