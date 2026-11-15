import { useState } from 'react'
import { HW_TYPES, PROJECT_STATUSES, PROGRESS_STEPS, isArchivedStatus, type Project } from '@/types'
import { emptyProject, createProject, updateProject, type ProjectInput } from '@/services/projectService'
import { todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { Button, ConfirmDialog, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

const PROGRESS_OPTIONS = PROGRESS_STEPS.map((p) => ({ value: String(p), label: `${p}%` }))

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
  const [confirmArchive, setConfirmArchive] = useState(false)
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const roundedProgress = String(Math.round((form.progress || 0) / 10) * 10)
  const willMoveToArchive = isArchivedStatus(form.status) && (!project || !isArchivedStatus(project.status))

  async function doSave() {
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
      setConfirmArchive(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (willMoveToArchive) {
      setConfirmArchive(true)
      return
    }
    await doSave()
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
        <Field label="Progress (%)">
          <Select options={PROGRESS_OPTIONS} value={roundedProgress} onChange={(e) => set('progress', Number(e.target.value))} />
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
      {willMoveToArchive && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Setting status to <b>{form.status}</b> will move this project and all its data to <b>Archived</b>. This action is non-returnable.
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save Project'}</Button>
      </div>
      <ConfirmDialog
        open={confirmArchive}
        title={`Move HRS ${form.code || ''} to Archived?`}
        confirmLabel={`Confirm & Archive (${form.status})`}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={doSave}
        message={
          <>
            Changing the project status to <b>{form.status}</b> will move all project data for <b>HRS {form.code || 'this project'}</b> to the <b>Archived</b> tab. <b>This action is non-returnable.</b> Do you want to proceed?
          </>
        }
      />
    </form>
  )
}
