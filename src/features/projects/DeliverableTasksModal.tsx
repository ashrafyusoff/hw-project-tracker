import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { TASK_STATUSES, type Project, type Task, type Workstream } from '@/types'
import { Badge, Button, ConfirmDialog, EmptyState, Modal } from '@/components/ui'
import { useTable } from '@/hooks/useTable'
import { TaskForm } from '@/features/tasks/TaskForm'
import { deleteTask, updateTask } from '@/services/taskService'
import { createTasksFromDeliverableTemplate } from '@/services/deliverableTemplateService'
import { formatDate, todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

export function DeliverableTasksModal({
  open,
  workstream,
  project,
  onClose,
}: {
  open: boolean
  workstream?: Workstream
  project?: Project
  onClose: () => void
}) {
  const allTasks = useTable<Task>('tasks') ?? []
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [deletingTask, setDeletingTask] = useState<Task | undefined>()
  const [error, setError] = useState('')

  const deliverableTasks = useMemo(() => {
    if (!workstream) return []
    return allTasks
      .filter((t) => t.workstreamId === workstream.id)
      .sort((a, b) => (a.startDate || a.dueDate || '9999').localeCompare(b.startDate || b.dueDate || '9999') || a.createdAt.localeCompare(b.createdAt))
  }, [allTasks, workstream])

  if (!workstream) return null

  const delivName =
    workstream.category === 'Others' && workstream.name && workstream.name !== 'Others'
      ? `Others (${workstream.name})`
      : workstream.name || workstream.category

  async function handleMoveTask(index: number, direction: -1 | 1) {
    const targetIdx = index + direction
    if (targetIdx < 0 || targetIdx >= deliverableTasks.length) return
    const a = deliverableTasks[index]
    const b = deliverableTasks[targetIdx]
    try {
      // Swap start and due dates so their schedule order swaps cleanly
      await updateTask(a.id, { ...a, startDate: b.startDate, dueDate: b.dueDate })
      await updateTask(b.id, { ...b, startDate: a.startDate, dueDate: a.dueDate })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function handleGenerateFromTemplate() {
    if (!workstream) return
    setError('')
    try {
      await createTasksFromDeliverableTemplate({
        projectId: workstream.projectId,
        workstreamId: workstream.id,
        supplierId: workstream.supplierId,
        categoryOrName: workstream.name || workstream.category,
        startDate: todayStr(),
      })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Deliverable Tasks — ${project ? `${project.code} · ` : ''}${delivName}`}
        wide
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              All tasks for this deliverable (including tasks created in the <b>Tasks</b> tab). Each task appears on the <b>Overview</b> calendar on its Due Date.
            </p>
            <div className="flex items-center gap-2">
              {deliverableTasks.length === 0 && (
                <Button size="sm" onClick={handleGenerateFromTemplate}>
                  <Layers className="h-3.5 w-3.5" /> Load Template Tasks
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setEditingTask(undefined)
                  setTaskFormOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add Task
              </Button>
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {deliverableTasks.length === 0 ? (
            <EmptyState
              title="No tasks for this deliverable yet"
              hint="Click 'Load Template Tasks' to generate the default deliverable workflow, or '+ Add Task' to add one manually."
            />
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 text-left">
                  <tr>
                    <th className="px-2.5 py-2 font-semibold w-20">Order</th>
                    <th className="px-2.5 py-2 font-semibold">Task Name</th>
                    <th className="px-2.5 py-2 font-semibold">Days</th>
                    <th className="px-2.5 py-2 font-semibold">Start Date</th>
                    <th className="px-2.5 py-2 font-semibold">Due Date</th>
                    <th className="px-2.5 py-2 font-semibold">Priority</th>
                    <th className="px-2.5 py-2 font-semibold">Status</th>
                    <th className="px-2.5 py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deliverableTasks.map((t, idx) => (
                    <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <div className="inline-flex items-center gap-0.5">
                          <span className="w-4 text-center text-slate-400 font-semibold">{idx + 1}</span>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => void handleMoveTask(idx, -1)}
                            className="p-0.5 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:pointer-events-none"
                            title="Move up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === deliverableTasks.length - 1}
                            onClick={() => void handleMoveTask(idx, 1)}
                            className="p-0.5 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:pointer-events-none"
                            title="Move down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-2.5 py-2 font-semibold text-slate-800">{t.name}</td>
                      <td className="px-2.5 py-2 text-slate-600">{t.workingDays ?? 1}d</td>
                      <td className="px-2.5 py-2 whitespace-nowrap text-slate-600">{formatDate(t.startDate)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap font-medium text-slate-800">{formatDate(t.dueDate)}</td>
                      <td className="px-2.5 py-2"><Badge>{t.priority}</Badge></td>
                      <td className="px-2.5 py-2">
                        <select
                          value={t.status}
                          onChange={async (e) => {
                            try {
                              await updateTask(t.id, { ...t, status: e.target.value as Task['status'] })
                            } catch (err) {
                              setError(errorMessage(err))
                            }
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2.5 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edit task"
                            onClick={() => {
                              setEditingTask(t)
                              setTaskFormOpen(true)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete task"
                            onClick={() => setDeletingTask(t)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <TaskForm
        open={taskFormOpen}
        task={editingTask}
        defaultProjectId={workstream.projectId}
        defaultWorkstreamId={workstream.id}
        onClose={() => {
          setTaskFormOpen(false)
          setEditingTask(undefined)
        }}
      />

      <ConfirmDialog
        open={!!deletingTask}
        title="Delete task?"
        onCancel={() => setDeletingTask(undefined)}
        onConfirm={async () => {
          if (deletingTask) {
            try {
              await deleteTask(deletingTask.id)
            } catch (e) {
              setError(errorMessage(e))
            }
          }
          setDeletingTask(undefined)
        }}
        message={<>Delete task <b>{deletingTask?.name}</b> from this deliverable?</>}
      />
    </>
  )
}
