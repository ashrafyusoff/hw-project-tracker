import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftRight, Check, CheckSquare, Sparkles, Star, X } from 'lucide-react'
import { NON_NPI_TASK_STATUSES, PRIORITIES, TASK_STATUSES, type Project, type Task, type Workstream } from '@/types'
import { createTask, emptyTask, updateTask, type TaskInput } from '@/services/taskService'
import { addWorkingDays, countWorkingDays, nextWorkingDay } from '@/services/deliverableTemplateService'
import { MilestoneFormBody } from './MilestoneForm'
import { useTable } from '@/hooks/useTable'
import { cn, todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Select, Textarea } from '@/components/ui'

// `defaultProjectId` pre-selects the project when adding from inside a project.
// `nonNpiOnly` restricts the project dropdown strictly to Non-NPI Work items (excluding HRS projects).
export function TaskForm({
  open,
  task,
  defaultProjectId,
  defaultWorkstreamId,
  defaultDueDate,
  nonNpiOnly = false,
  onClose,
}: {
  open: boolean
  task?: Task
  defaultProjectId?: string
  defaultWorkstreamId?: string
  defaultDueDate?: string
  nonNpiOnly?: boolean
  onClose: () => void
}) {
  const [itemKind, setItemKind] = useState<'task' | 'milestone'>('task')
  const isNew = !task
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (open) setItemKind('task')
  }, [open, task])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (panelRef.current?.contains(target)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', onPointerDown)
    }, 30)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, onClose])

  return createPortal(
    <aside
      ref={panelRef}
      data-task-drawer
      aria-hidden={!open}
      className={cn(
        'fixed inset-y-0 left-0 z-[60] w-full max-w-md flex flex-col gap-3 p-3 transition-transform duration-300 ease-in-out pointer-events-none',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Island 1: Top Header Island (same h-12 rounded-full capsule style as "HW Tracker" sidebar island, extended right) */}
      <div className="pointer-events-auto flex h-12 items-center justify-between rounded-full liquid-glass shadow-xl px-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20 shrink-0">
            {isNew && itemKind === 'milestone' ? (
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
            ) : (
              <CheckSquare className="h-3.5 w-3.5 text-primary" />
            )}
          </div>
          <h3 className="text-sm font-bold text-slate-900 truncate leading-tight">
            {task ? 'Edit Task' : itemKind === 'milestone' ? 'Add Milestone' : 'Add Task'}
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

      {/* Island 2: Content Island (same rounded-3xl style as Workspace sidebar island, extended right) */}
      <div className="pointer-events-auto flex-1 flex flex-col rounded-3xl liquid-glass shadow-2xl overflow-hidden min-h-0">
        {isNew && !nonNpiOnly && (
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-1 shrink-0">
            <span className="text-xs font-semibold text-slate-500 mr-1">Type:</span>
            <Button
              type="button"
              variant={itemKind === 'task' ? 'primary' : 'secondary'}
              onClick={() => setItemKind('task')}
            >
              <CheckSquare className="h-3.5 w-3.5" /> Task {itemKind === 'task' && <Check className="h-3.5 w-3.5 ml-0.5" />}
            </Button>
            <Button
              type="button"
              variant={itemKind === 'milestone' ? 'primary' : 'secondary'}
              onClick={() => setItemKind('milestone')}
            >
              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" /> Milestone {itemKind === 'milestone' && <Check className="h-3.5 w-3.5 ml-0.5" />}
            </Button>
          </div>
        )}

        <div className="p-4 overflow-y-auto flex-1">
          {isNew && itemKind === 'milestone' ? (
            <MilestoneFormBody
              key={`drawer-ms-${open ? 'open' : 'closed'}-${defaultProjectId ?? ''}`}
              defaultProjectId={defaultProjectId}
              defaultTargetDate={defaultDueDate}
              compact
              onClose={onClose}
            />
          ) : (
            <TaskFormBody
              key={`${open ? 'open' : 'closed'}-${task?.id ?? 'new'}-${task?.updatedAt ?? ''}-${defaultProjectId ?? ''}-${defaultWorkstreamId ?? ''}-${nonNpiOnly ? 'nonnpi' : 'all'}`}
              task={task}
              defaultProjectId={defaultProjectId}
              defaultWorkstreamId={defaultWorkstreamId}
              defaultDueDate={defaultDueDate}
              nonNpiOnly={nonNpiOnly}
              compact
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </aside>,
    document.body,
  )
}

export function TaskFormBody({
  task,
  defaultProjectId,
  defaultWorkstreamId,
  defaultDueDate,
  nonNpiOnly = false,
  compact = false,
  onClose,
}: {
  task?: Task
  defaultProjectId?: string
  defaultWorkstreamId?: string
  defaultDueDate?: string
  nonNpiOnly?: boolean
  compact?: boolean
  onClose: () => void
}) {
  const projects = useTable<Project>('projects') ?? []
  const workstreams = useTable<Workstream>('workstreams') ?? []
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
    const start = defaultDueDate || base.startDate || todayStr()
    return {
      ...base,
      workstreamId: defaultWorkstreamId ?? '',
      startDate: start,
      dueDate: defaultDueDate || addWorkingDays(start, 1),
      workingDays: 1,
      dependsOnTaskId: '',
    }
  })
  const [error, setError] = useState('')
  const [syncNotice, setSyncNotice] = useState<{ field: 'dueDate' | 'workingDays' | 'startDate'; text: string } | null>(null)
  const syncTimerRef = useRef<number | null>(null)
  const prevDefaultDateRef = useRef(defaultDueDate)
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  function triggerSyncNotice(field: 'dueDate' | 'workingDays' | 'startDate', text: string) {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current)
    setSyncNotice({ field, text })
    syncTimerRef.current = window.setTimeout(() => {
      setSyncNotice(null)
    }, 2200)
  }

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current)
    }
  }, [])

  // When adding a new task, clicking another calendar date updates Start Date (and recalculates Due Date) live
  useEffect(() => {
    if (!task && defaultDueDate && defaultDueDate !== prevDefaultDateRef.current) {
      prevDefaultDateRef.current = defaultDueDate
      setForm((f) => {
        const dur = Math.max(1, f.workingDays ?? 1)
        const nextDue = addWorkingDays(defaultDueDate, dur)
        triggerSyncNotice(
          'startDate',
          `Start Date set to ${defaultDueDate} → Due Date auto-updated to ${nextDue} (${dur} working day${dur > 1 ? 's' : ''})`,
        )
        return { ...f, startDate: defaultDueDate, dueDate: nextDue }
      })
    } else {
      prevDefaultDateRef.current = defaultDueDate
    }
  }, [defaultDueDate, task])

  const selectedProject = projects.find((p) => p.id === form.projectId)
  const isNonNpiProject = !!nonNpiOnly || !!selectedProject?.isNonNpi
  const selectableProjects = nonNpiOnly ? projects.filter((p) => !!p.isNonNpi) : projects
  const statusOptions = isNonNpiProject ? NON_NPI_TASK_STATUSES : TASK_STATUSES

  const selectedDeliverable = workstreams.find((w) => w.id === form.workstreamId)
  const effectiveSupplierId = selectedDeliverable ? selectedDeliverable.supplierId : form.supplierId

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
      if (pred?.dueDate) {
        triggerSyncNotice('dueDate', `Starts after "${pred.name}" (${nextStart}) → Due Date updated to ${nextDue}`)
      }
      return { ...f, dependsOnTaskId, startDate: nextStart, dueDate: nextDue }
    })
  }

  function handleStartDateChange(startDate: string) {
    setForm((f) => {
      const dur = Math.max(1, f.workingDays ?? 1)
      const nextDue = startDate ? addWorkingDays(startDate, dur) : f.dueDate
      if (startDate) {
        triggerSyncNotice('dueDate', `Due Date auto-updated to ${nextDue} (${dur} working day${dur > 1 ? 's' : ''} from ${startDate})`)
      }
      return { ...f, startDate, dueDate: nextDue }
    })
  }

  function handleWorkingDaysChange(workingDays: number) {
    const dur = Math.max(1, Math.round(workingDays || 1))
    setForm((f) => {
      const base = f.startDate || todayStr()
      const nextDue = addWorkingDays(base, dur)
      triggerSyncNotice('dueDate', `Due Date auto-updated to ${nextDue} (${dur} working day${dur > 1 ? 's' : ''})`)
      return { ...f, workingDays: dur, startDate: base, dueDate: nextDue }
    })
  }

  function handleDueDateChange(dueDate: string) {
    setForm((f) => {
      if (!dueDate) return { ...f, dueDate }
      const baseStart = f.startDate && f.startDate <= dueDate ? f.startDate : dueDate
      const nextWorkingDays = countWorkingDays(baseStart, dueDate)
      triggerSyncNotice(
        'workingDays',
        `Working Days auto-calculated: ${nextWorkingDays} day${nextWorkingDays > 1 ? 's' : ''} (${baseStart} → ${dueDate})`,
      )
      return {
        ...f,
        startDate: baseStart,
        dueDate,
        workingDays: nextWorkingDays,
      }
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
        <Field label="Start Date">
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className={cn(
              'transition-all duration-300',
              syncNotice?.field === 'startDate' && 'ring-2 ring-primary !border-primary !bg-primary-soft',
            )}
          />
        </Field>
        <Field label="Working Days (⇄ Due Date)">
          <Input
            type="number"
            min={1}
            max={365}
            value={form.workingDays ?? 1}
            onChange={(e) => handleWorkingDaysChange(Number(e.target.value))}
            className={cn(
              'transition-all duration-300',
              syncNotice?.field === 'workingDays' && 'ring-2 ring-primary !border-primary !bg-primary-soft',
            )}
          />
        </Field>
        <Field label="Due Date (⇄ Working Days)">
          <Input
            type="date"
            value={form.dueDate}
            onChange={(e) => handleDueDateChange(e.target.value)}
            className={cn(
              'transition-all duration-300',
              (syncNotice?.field === 'dueDate' || syncNotice?.field === 'startDate') && 'ring-2 ring-primary !border-primary !bg-primary-soft',
            )}
          />
        </Field>
        <Field label="Completion Date">
          <Input type="date" value={form.completionDate} onChange={(e) => set('completionDate', e.target.value)} />
        </Field>
      </div>

      {syncNotice && (
        <div
          role="status"
          className="flex items-center gap-1.5 rounded-xl border border-primary/35 bg-primary-soft px-3 py-1.5 text-[11px] font-semibold text-primary shadow-sm transition-all"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{syncNotice.text}</span>
          <ArrowLeftRight className="h-3 w-3 ml-auto shrink-0 opacity-75" />
        </div>
      )}

      <Field label="Remarks"><Textarea rows={compact ? 2 : 3} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Task</Button>
      </div>
    </form>
  )
}
