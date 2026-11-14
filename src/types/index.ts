// All data shapes used by the app. Each table in the database uses one of these.
// Every record has a unique text `id`. `isSample` marks demo data so it can be cleared safely.

export interface BaseRecord {
  id: string
  isSample?: boolean
  createdAt: string // ISO date-time
  updatedAt: string
}

export const PROJECT_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Delayed', 'Completed', 'Cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const
export type Priority = (typeof PRIORITIES)[number]

export const HW_TYPES = ['FT', 'WT', 'Eng'] as const
export type HwType = (typeof HW_TYPES)[number]

export const HARDWARE_CATEGORIES = ['PCB', 'Socket', 'Handler Kit', 'Stiffener', 'Probe Card', 'Probe Head', 'Others'] as const
export type HardwareCategory = (typeof HARDWARE_CATEGORIES)[number] | string

export const HARDWARE_STATUSES = ['Not Started', 'In Fabrication', 'In Delivery', 'Delivered'] as const
export type HardwareStatus = (typeof HARDWARE_STATUSES)[number]

export const PROGRESS_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const

export const WORKSTREAM_STATUSES = ['Not Started', 'In Progress', 'On Hold', 'Delayed', 'Completed'] as const
export type WorkstreamStatus = (typeof WORKSTREAM_STATUSES)[number]

export const TASK_STATUSES = ['Not Started', 'In Progress', 'Waiting for Supplier', 'Under Review', 'Completed', 'Cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const MILESTONE_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Delayed'] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

export const SUPPLIER_CATEGORIES = ['PCB Fabrication', 'Test Socket', 'Handler Kit', 'Components', 'Assembly', 'Other'] as const

export interface Project extends BaseRecord {
  code: string
  name: string
  hwType?: HwType
  deviceName: string
  atePlatform: string
  description: string
  objectives: string
  priority: Priority
  status: ProjectStatus
  startDate: string // YYYY-MM-DD or ''
  baselineDate: string
  revisedDate: string
  actualDate: string
  progress: number // 0-100
  remarks: string
}

export interface Workstream extends BaseRecord {
  projectId: string
  name: string
  category: HardwareCategory
  mpn?: string
  supplierId: string // '' means none
  status: WorkstreamStatus
  progress: number
  startDate: string
  targetDate: string
  actualDate: string
  remarks: string
}

export interface Supplier extends BaseRecord {
  name: string
  contactPerson: string
  email: string
  phone: string
  location: string
  category: string
  remarks: string
}

// Links a supplier to a project (many-to-many). Unique per (projectId, supplierId).
export interface ProjectSupplier extends BaseRecord {
  projectId: string
  supplierId: string
}

export interface Task extends BaseRecord {
  projectId: string
  workstreamId: string
  name: string
  assignee: string
  supplierId: string
  startDate: string
  dueDate: string
  completionDate: string
  priority: Priority
  status: TaskStatus
  progress: number
  remarks: string
}

export interface Milestone extends BaseRecord {
  projectId: string
  workstreamId: string
  name: string
  description: string
  targetDate: string
  actualDate: string
  status: MilestoneStatus
  remarks: string
}

export interface Quotation extends BaseRecord {
  number: string
  projectId: string
  workstreamId?: string // linked Deliverable (Workstream)
  supplierId: string
  requestDate: string
  receivedDate: string
  amount: number
  currency: string
  status: string
  remarks: string
}

export interface PetRecord extends BaseRecord {
  reference: string
  projectId: string
  workstreamId?: string // linked Deliverable (Workstream)
  supplierId: string
  submissionDate: string
  approvalDate: string
  status: string
  remarks: string
}

export interface PrRecord extends BaseRecord {
  number: string
  projectId: string
  supplierId: string
  submissionDate: string
  approvalDate: string
  status: string
  remarks: string
}

export interface PoRecord extends BaseRecord {
  number: string
  projectId: string
  workstreamId?: string // linked Deliverable (Workstream)
  supplierId: string
  issueDate: string
  amount: number
  currency: string
  expectedDelivery: string
  actualDelivery: string
  status: string
  supplierConfirmation?: string
  hardwareDelivery?: string
  deliveryStatus?: string
  remarks: string
}

export interface Meeting extends BaseRecord {
  title: string
  projectId: string
  date: string
  participants: string
  summary: string
  decisions: string
  remarks: string
}

export interface MeetingAction extends BaseRecord {
  meetingId: string
  action: string
  assignee: string
  dueDate: string
  status: string
  taskId: string // optional link to a Task
}

export interface Risk extends BaseRecord {
  title: string
  projectId: string
  description: string
  probability: string
  impact: string
  level: string
  mitigation: string
  owner: string
  status: string
}

export interface Issue extends BaseRecord {
  title: string
  projectId: string
  workstreamId: string
  description: string
  rootCause: string
  correctiveAction: string
  responsible: string
  dateRaised: string
  targetDate: string
  actualDate: string
  status: string
}

export interface ActivityLog extends BaseRecord {
  entity: string // e.g. "Project"
  entityId: string
  projectId: string // '' if not tied to a project
  action: 'Created' | 'Updated' | 'Deleted' | 'Status Changed'
  message: string
}
