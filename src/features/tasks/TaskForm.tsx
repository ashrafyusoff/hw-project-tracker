import { useState } from 'react'
import { NON_NPI_TASK_STATUSES, PRIORITIES, TASK_STATUSES, type Project, type Supplier, type Task, type Workstream } from '@/types'
import { createTask, emptyTask, updateTask, type TaskInput } from '@/services/taskService'
import { addWorkingDays, countWorkingDays, nextWorkingDay } from '@/services/deliverableTemplateService'
import { useTable } from '@/hooks/useTable'
import { todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

// `defaultProjectId` pre-selects the project when adding from inside a project.
// `nonNpiOnly` restricts the project dropdown strictly to Non-NPI Work items (excluding HRS projects).
export function TaskForm({
  open,
  task,
  defaultProjectId,
  defaultWorkstreamId,
  nonNpiOnly = false,
  onClose,
}: {
  open: boolean
  task?: Task
  defaultProjectId?: string
  defaultWorkstreamId?: string
  nonNpiOnly?: boolean
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit Task' : 'Add Task'} wide>
      <TaskFormBody
        key={`${open ? 'open' : 'closed'}-${task?.id ?? 'new'}-${task?.updatedAt ?? ''}-${defaultProjectId ?? ''}-${defaultWorkstreamId ?? ''}-${nonNpiOnly ? 'nonnpi' : 'all'}`}
        task={task}
        defaultProjectId={defaultProjectId}
        defaultWorkstreamId={defaultWorkstreamId}
        nonNpiOnly={nonNpiOnly}
        onClose={onClose}
      />
    </Modal>
  )
}

export function TaskFormBody({
  task,
  defaultProjectId,
  defaultWorkstreamId,
  nonNpiOnly = false,
  compact = false,
  onClose,
}: {
  task?: Task
  defaultProjectId?: string
  defaultWorkstreamId?: string
  nonNpiOnly?: boolean
  compact?: boolean
  onClose: () => void
}) {
  const projects = useTable<Project>('projects') ?? []
  const workstreams = useTable<Workstream>('workstreams') ?? []
  const suppliers = useTable<Supplier>('suppliers') ?? []
  const allTasks = useTable<Task>('tasks') ?? []
  const [form, setForm] = useState<TaskInput>(() => {
    if (task) {
      return {
        ...task,
        startDate: task.startDate || task.createdAt?.slice(0, 10) || todayStr(),
        workingDays: task.workingDays ?? (task.startDate && task.dueDate ? countWorkingDays(task.startDate, task.dueDate) : 1),
        dependsOnTaskId: task.dependsOnTaskId ?? '',
      }
    }
    const base = emptyTask(defaultProjectId)
    const start = base.startDate || todayStr()
    return {
      ...base,
      workstreamId: defaultWorkstreamId ?? '',
      startDate: start,
      dueDate: addWorkingDays(start, 1),
      workingDays: 1,
      dependsOnTaskId: '',
    }
  })
  const [error, setError] = useState('')
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const selectedProject = projects.find((p) => p.id === form.projectId)
  const isNonNpiProject = !!nonNpiOnly || !!selectedProject?.isNonNpi
  const selectableProjects = nonNpiOnly ? projects.filter((p) => !!p.isNonNpi) : projects
  const statusOptions = isNonNpiProject ? NON_NPI_TASK_STATUSES : TASK_STATUSES

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

  function handleDependencyChange(dependsOnTaskId: string) {
    const pred = allTasks.find((t) => t.id === dependsOnTaskId)
    setForm((f) => {
      const nextStart = pred?.dueDate ? nextWorkingDay(pred.dueDate) : f.startDate
      const dur = Math.max(1, f.workingDays ?? 1)
      const nextDue = nextStart ? addWorkingDays(nextStart, dur) : f.dueDate
      return { ...f, dependsOnTaskId, startDate: nextStart, dueDate: nextDue }
    })
  }

  function handleStartDateChange(startDate: string) {
    setForm((f) => {
      const dur = Math.max(1, f.workingDays ?? 1)
      const nextDue = startDate ? addWorkingDays(startDate, dur) : f.dueDate
      return { ...f, startDate, dueDate: nextDue }
    })
  }

  function handleWorkingDaysChange(workingDays: number) {
    const dur = Math.max(1, Math.round(workingDays || 1))
    setForm((f) => {
      const base = f.startDate || todayStr()
      return { ...f, workingDays: dur, startDate: base, dueDate: addWorkingDays(base, dur) }
    })
  }

  const dependencyOptions = allTasks.filter(
    (t) =>
      t.id !== task?.id &&
      (!form.projectId || t.projectId === form.projectId) &&
      (!form.workstreamId || t.workstreamId === form.workstreamId),
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const payload: TaskInput = {
        ...form,
        startDate: form.startDate || todayStr(),
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
    <form onSubmit={submit} className={compact ? 'space-y-2.5' : 'space-y-4'}>
      <FormError message={error} />
      <Field label="Task Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid sm:grid-cols-2 gap-3'}>
        <Field label={nonNpiOnly ? 'Non-NPI Work' : 'Project (HRS / Non-NPI)'} required>
          <Select
            value={form.projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            options={[
              { value: '', label: nonNpiOnly ? 'Select Non-NPI Work…' : 'Select project…' },
              ...selectableProjects.map((p) => ({
                value: p.id,
                label: p.isNonNpi
                  ? `${p.code} – ${p.name}`
                  : `${p.code}${p.deviceName ? ` – ${p.deviceName}` : ''}`,
              })),
            ]}
          />
        </Field>
        {!isNonNpiProject && (
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
        )}
        {!isNonNpiProject && (
          <Field label="Supplier (Auto-filled from Deliverable)">
            <Input value={supplierName} disabled readOnly className="bg-slate-100 text-slate-600 cursor-not-allowed" />
          </Field>
        )}
        <Field label="Priority">
          <Select options={PRIORITIES} value={form.priority} onChange={(e) => set('priority', e.target.value as TaskInput['priority'])} />
        </Field>
        <Field label="Status">
          <Select
            options={statusOptions}
            value={statusOptions.includes(form.status as never) ? form.status : 'Not Started'}
            onChange={(e) => set('status', e.target.value as TaskInput['status'])}
          />
        </Field>
        <Field label="Depends On (Predecessor)">
          <Select
            value={form.dependsOnTaskId ?? ''}
            onChange={(e) => handleDependencyChange(e.target.value)}
            options={[
              { value: '', label: '— None —' },
              ...dependencyOptions.map((t) => ({ value: t.id, label: `${t.name}${t.dueDate ? ` (Due ${t.dueDate})` : ''}` })),
            ]}
          />
        </Field>
        <Field label="Working Days">
          <Input
            type="number"
            min={1}
            max={365}
            value={form.workingDays ?? 1}
            onChange={(e) => handleWorkingDaysChange(Number(e.target.value))}
          />
        </Field>
        <Field label="Start Date">
          <Input type="date" value={form.startDate} onChange={(e) => handleStartDateChange(e.target.value)} />
        </Field>
        <Field label="Due Date">
          <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Field label="Completion Date">
          <Input type="date" value={form.completionDate} onChange={(e) => set('completionDate', e.target.value)} />
        </Field>
      </div>
      <Field label="Remarks"><Textarea rows={compact ? 2 : 3} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Task</Button>
      </div>
    </form>
  )
}
