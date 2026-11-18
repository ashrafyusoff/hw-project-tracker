import Dexie, { type EntityTable } from 'dexie'
import type {
  ActivityLog, Issue, Meeting, MeetingAction, Milestone, PetRecord, PoRecord, PrRecord,
  Project, ProjectSupplier, Quotation, Risk, Supplier, Task, Workstream,
} from '@/types'

// The local browser database. Each property below is one table.
// The text after the "id" in .stores() lists the fields we can search/filter quickly (indexes).
export class NpiDatabase extends Dexie {
  projects!: EntityTable<Project, 'id'>
  workstreams!: EntityTable<Workstream, 'id'>
  suppliers!: EntityTable<Supplier, 'id'>
  projectSuppliers!: EntityTable<ProjectSupplier, 'id'>
  tasks!: EntityTable<Task, 'id'>
  milestones!: EntityTable<Milestone, 'id'>
  quotations!: EntityTable<Quotation, 'id'>
  petRecords!: EntityTable<PetRecord, 'id'>
  prRecords!: EntityTable<PrRecord, 'id'>
  poRecords!: EntityTable<PoRecord, 'id'>
  meetings!: EntityTable<Meeting, 'id'>
  meetingActions!: EntityTable<MeetingAction, 'id'>
  risks!: EntityTable<Risk, 'id'>
  issues!: EntityTable<Issue, 'id'>
  activityLogs!: EntityTable<ActivityLog, 'id'>

  constructor() {
    super('npi-project-manager')
    this.version(1).stores({
      projects: 'id, &code, status, priority',
      workstreams: 'id, projectId, supplierId',
      suppliers: 'id, &name',
      // [projectId+supplierId] is unique, so the same supplier cannot be linked twice to one project
      projectSuppliers: 'id, &[projectId+supplierId], projectId, supplierId',
      tasks: 'id, projectId, workstreamId, supplierId, status, dueDate',
      milestones: 'id, projectId, workstreamId, targetDate',
      quotations: 'id, projectId, supplierId',
      petRecords: 'id, projectId, supplierId',
      prRecords: 'id, projectId, supplierId',
      poRecords: 'id, projectId, supplierId',
      meetings: 'id, projectId',
      meetingActions: 'id, meetingId, taskId',
      risks: 'id, projectId',
      issues: 'id, projectId, workstreamId',
      activityLogs: 'id, projectId, createdAt',
    })
    this.version(2).stores({
      quotations: 'id, projectId, workstreamId, supplierId',
      petRecords: 'id, projectId, workstreamId, supplierId',
      poRecords: 'id, projectId, workstreamId, supplierId',
    })
  }
}

export const db = new NpiDatabase()

// Request persistent browser storage so IndexedDB data is never evicted automatically
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => {})
}

// One list of every table name, used by backup / reset / export code.
export const TABLE_NAMES = [
  'projects', 'workstreams', 'suppliers', 'projectSuppliers', 'tasks', 'milestones',
  'quotations', 'petRecords', 'prRecords', 'poRecords', 'meetings', 'meetingActions',
  'risks', 'issues', 'activityLogs',
] as const
export type TableName = (typeof TABLE_NAMES)[number]
