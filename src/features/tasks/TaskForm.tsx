import { useState } from 'react'
import { PRIORITIES, TASK_STATUSES, type Project, type Supplier, type Task, type Workstream } from '@/types'
import { createTask, emptyTask, updateTask, type TaskInput } from '@/services/taskService'
import { useTable } from '@/hooks/useTable'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

// `defaultProjectId` pre-selects the project when adding from inside a project.
export function TaskForm({ open, task, defaultProjectId, onClose }: { open: boolean; task?: Task; defaultProjectId?: string; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit Task' : 'Add Task'} wide>
      <Body key={task?.id ?? 'new'} task={task} defaultProjectId={defaultProjectId} onClose={onClose} />
    </Modal>
  )
}

function Body({ task, defaultProjectId, onClose }: { task?: Task; defaultProjectId?: string; onClose: () => void }) {
  const projects = useTable<Project>('projects') ?? []
  const workstreams = useTable<Workstream>('workstreams') ?? []
  const suppliers = useTable<Supplier>('suppliers') ?? []
  const [form, setForm] = useState<TaskInput>(task ? { ...task } : emptyTask(defaultProjectId))
  const [error, setError] = useState('')
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const selectedDeliverable = workstreams.find((w) => w.id === form.workstreamId)
  const effectiveSupplierId = selectedDeliverable ? selectedDeliverable.supplierId : form.supplierId
  const supplierName = suppliers.find((s) => s.id === effectiveSupplierId)?.name ?? '— None (set in Deliverable) —'

  function handleProjectChange(projectId: string) {
    setForm((f) => ({
      ...f,
      projectId,
      workstreamId: '',
      supplierId: '',
    }))
  }

  function handleDeliverableChange(workstreamId: string) {
    const ws = workstreams.find((w) => w.id === workstreamId)
    setForm((f) => ({
      ...f,
      workstreamId,
      supplierId: ws?.supplierId || '',
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const payload: TaskInput = {
        ...form,
        assignee: '',
        supplierId: effectiveSupplierId,
      }
      if (task) await updateTask(task.id, payload)
      else await createTask(payload)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <Field label="Task Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Project (HRS Number)" required>
          <Select
            value={form.projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            options={[{ value: '', label: 'Select project…' }, ...projects.map((p) => ({ value: p.id, label: `${p.code}${p.deviceName ? ` – ${p.deviceName}` : ''}` }))]}
          />
        </Field>
        <Field label="Deliverable">
          <Select
            value={form.workstreamId}
            onChange={(e) => handleDeliverableChange(e.target.value)}
            options={[
              { value: '', label: '— None —' },
              ...workstreams
                .filter((w) => w.projectId === form.projectId)
                .map((w) => ({ value: w.id, label: w.category === 'Others' && w.name !== 'Others' ? `Others (${w.name})` : w.name || w.category })),
            ]}
          />
        </Field>
        <Field label="Supplier (Auto-filled from Deliverable)">
          <Input value={supplierName} disabled readOnly className="bg-slate-100 text-slate-600 cursor-not-allowed" />
        </Field>
        <Field label="Status"><Select options={TASK_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value as TaskInput['status'])} /></Field>
        <Field label="Start Date"><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Due Date"><Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
        <Field label="Completion Date"><Input type="date" value={form.completionDate} onChange={(e) => set('completionDate', e.target.value)} /></Field>
        <Field label="Progress (%)"><Input type="number" min={0} max={100} value={form.progress} onChange={(e) => set('progress', Number(e.target.value))} /></Field>
        <Field label="Priority"><Select options={PRIORITIES} value={form.priority} onChange={(e) => set('priority', e.target.value as TaskInput['priority'])} /></Field>
      </div>
      <Field label="Remarks"><Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Task</Button>
      </div>
    </form>
  )
}
