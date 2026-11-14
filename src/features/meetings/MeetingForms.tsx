import { useState } from 'react'
import { useTable } from '@/hooks/useTable'
import type { Meeting, MeetingAction, Project, Task } from '@/types'
import {
  createMeeting, createMeetingAction, emptyMeeting, emptyMeetingAction,
  updateMeeting, updateMeetingAction, type MeetingActionInput, type MeetingInput,
} from '@/services/meetingService'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

const ACTION_STATUSES = ['Open', 'In Progress', 'Completed', 'Cancelled'] as const

// ---------- Meeting Form ----------
export function MeetingForm({ open, meeting, defaultProjectId, onClose }: { open: boolean; meeting?: Meeting; defaultProjectId?: string; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={meeting ? 'Edit Meeting Minutes' : 'Add Meeting Minutes'} wide>
      <MeetingBody key={meeting?.id ?? 'new'} meeting={meeting} defaultProjectId={defaultProjectId} onClose={onClose} />
    </Modal>
  )
}

function MeetingBody({ meeting, defaultProjectId, onClose }: { meeting?: Meeting; defaultProjectId?: string; onClose: () => void }) {
  const projects = useTable<Project>('projects') ?? []
  const [form, setForm] = useState<MeetingInput>(meeting ? { ...meeting } : emptyMeeting(defaultProjectId))
  const [error, setError] = useState('')
  const set = <K extends keyof MeetingInput>(k: K, v: MeetingInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try { if (meeting) await updateMeeting(meeting.id, form); else await createMeeting(form); onClose() } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <Field label="Meeting Title" required><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Weekly Sync" /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Project" required>
          <Select value={form.projectId} onChange={(e) => set('projectId', e.target.value)}
            options={[{ value: '', label: 'Select project…' }, ...projects.map((p) => ({ value: p.id, label: `${p.code} – ${p.name}` }))]} />
        </Field>
        <Field label="Meeting Date" required><Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
      </div>
      <Field label="Participants"><Input value={form.participants} onChange={(e) => set('participants', e.target.value)} placeholder="Names or roles…" /></Field>
      <Field label="Discussion Summary"><Textarea value={form.summary} onChange={(e) => set('summary', e.target.value)} rows={4} /></Field>
      <Field label="Decisions"><Textarea value={form.decisions} onChange={(e) => set('decisions', e.target.value)} /></Field>
      <Field label="Remarks"><Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2} /></Field>
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save Meeting</Button></div>
    </form>
  )
}

// ---------- Meeting Action Item Form ----------
export function MeetingActionForm({ open, meetingId, projectId, record, onClose }: { open: boolean; meetingId: string; projectId?: string; record?: MeetingAction; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={record ? 'Edit Action Item' : 'Add Action Item'}>
      <ActionBody key={record?.id ?? 'new'} meetingId={meetingId} projectId={projectId} record={record} onClose={onClose} />
    </Modal>
  )
}

function ActionBody({ meetingId, projectId, record, onClose }: { meetingId: string; projectId?: string; record?: MeetingAction; onClose: () => void }) {
  const tasks = useTable<Task>('tasks') ?? []
  const projects = useTable<Project>('projects') ?? []
  const [form, setForm] = useState<MeetingActionInput>(record ? { ...record } : emptyMeetingAction(meetingId))
  const [error, setError] = useState('')
  const set = <K extends keyof MeetingActionInput>(k: K, v: MeetingActionInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  // Show tasks for this meeting's project first, then other tasks
  const sortedTasks = [...tasks].sort((a, b) => (a.projectId === projectId ? -1 : b.projectId === projectId ? 1 : 0))
  const projCode = (pid: string) => projects.find((p) => p.id === pid)?.code ?? ''

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try { if (record) await updateMeetingAction(record.id, form); else await createMeetingAction(form); onClose() } catch (err) { setError(errorMessage(err)) }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <FormError message={error} />
      <Field label="Action Item" required><Input value={form.action} onChange={(e) => set('action', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Assigned Person"><Input value={form.assignee} onChange={(e) => set('assignee', e.target.value)} /></Field>
        <Field label="Due Date"><Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
      </div>
      <Field label="Status"><Select options={ACTION_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value)} /></Field>
      <Field label="Related Task (optional link to central Task Tracker)">
        <Select value={form.taskId} onChange={(e) => set('taskId', e.target.value)}
          options={[{ value: '', label: '— No linked task —' }, ...sortedTasks.map((t) => ({ value: t.id, label: `[${projCode(t.projectId)}] ${t.name}` }))]} />
      </Field>
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save Action Item</Button></div>
    </form>
  )
}
