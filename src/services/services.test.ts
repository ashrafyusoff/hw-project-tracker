import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { createProject, deleteProject, emptyProject, updateProject } from './projectService'
import { createSupplier, deleteSupplier, emptySupplier, linkSupplierToProject, unlinkSupplierFromProject, updateSupplier } from './supplierService'
import { createWorkstream, deleteWorkstream, emptyWorkstream, updateWorkstream } from './workstreamService'
import { createTask, deleteTask, duplicateTaskToDate, emptyTask, rescheduleTask, updateTask } from './taskService'
import { createMilestone, deleteMilestone, duplicateMilestoneToDate, emptyMilestone, rescheduleMilestone, updateMilestone } from './milestoneService'
import { clearDeliverableCommercial, createPet, createPo, createQuotation, deletePet, deletePo, deleteQuotation, emptyDeliverableCommercial, emptyPet, emptyPo, emptyQuotation, saveDeliverableCommercial, updatePo } from './commercialService'
import { createMeeting, createMeetingAction, deleteMeeting, emptyMeeting, emptyMeetingAction } from './meetingService'
import { createIssue, createRisk, deleteIssue, deleteRisk, emptyIssue, emptyRisk, updateIssue } from './riskIssueService'
import { buildBackup, getDatabaseStatus, resetAllData, restoreBackup, validateBackup } from './backupService'
import { buildSheets, REPORT_NAMES } from './exportService'
import { clearSampleData, hasSampleData, loadSampleData } from './sampleData'

describe('NPI Project Manager — Full Database & Service Suite', () => {
  beforeEach(async () => {
    await resetAllData()
  })

  it('creates, updates, validates, and cascades project deletion safely', async () => {
    const pId = await createProject({ ...emptyProject(), code: 'NPI-9001', name: 'Test SoC Load Board' })
    expect((await db.projects.count())).toBe(1)

    // Duplicate project code must be rejected (case-insensitive)
    await expect(createProject({ ...emptyProject(), code: 'npi-9001', name: 'Duplicate' })).rejects.toThrow(/already used/i)

    // Invalid date order must be rejected
    await expect(updateProject(pId, { ...emptyProject(), code: 'NPI-9001', name: 'Test', startDate: '2026-06-10', baselineDate: '2026-06-01' })).rejects.toThrow(/cannot be before/i)

    // Update status and verify Activity Log records 'Status Changed'
    await updateProject(pId, { ...emptyProject(), code: 'NPI-9001', name: 'Test SoC Load Board', status: 'In Progress', progress: 45 })
    const logs = await db.activityLogs.where('projectId').equals(pId).toArray()
    expect(logs.some((l) => l.action === 'Status Changed')).toBe(true)

    // Create child records across all modules and verify deleteProject cascades everything cleanly
    await createWorkstream({ ...emptyWorkstream(pId), name: 'PCB Fab' })
    await createTask({ ...emptyTask(pId), name: 'Layout review' })
    await createMilestone({ ...emptyMilestone(pId), name: 'Design Freeze', targetDate: '2026-12-01' })
    await createQuotation({ ...emptyQuotation(pId), number: 'Q-100' })
    const mId = await createMeeting({ ...emptyMeeting(pId), title: 'Kickoff', date: '2026-11-15' })
    await createMeetingAction({ ...emptyMeetingAction(mId), action: 'Send schematic' })
    await createRisk({ ...emptyRisk(pId), title: 'Substrate lead time' })
    await createIssue({ ...emptyIssue(pId), title: 'Via clearance' })

    await deleteProject(pId)
    const status = await getDatabaseStatus()
    expect(status.counts.projects).toBe(0)
    expect(status.counts.workstreams).toBe(0)
    expect(status.counts.tasks).toBe(0)
    expect(status.counts.milestones).toBe(0)
    expect(status.counts.quotations).toBe(0)
    expect(status.counts.meetings).toBe(0)
    expect(status.counts.meetingActions).toBe(0)
    expect(status.counts.risks).toBe(0)
    expect(status.counts.issues).toBe(0)
  })

  it('manages suppliers, workstreams, auto-linking, and safe supplier/workstream deletion', async () => {
    const pId = await createProject({ ...emptyProject(), code: 'NPI-9002', name: 'PMIC Handler' })
    await createSupplier({ ...emptySupplier(), name: 'Test Vendor', email: 'contact@vendor.example' })
    const sup = (await db.suppliers.toArray())[0]

    // Invalid email must fail validation
    await expect(updateSupplier(sup.id, { ...emptySupplier(), name: 'Test Vendor', email: 'not-an-email' })).rejects.toThrow(/email/i)

    // Creating a workstream with a supplier auto-links that supplier to the project
    await createWorkstream({ ...emptyWorkstream(pId), name: 'Socket Design', supplierId: sup.id })
    const ws = (await db.workstreams.toArray())[0]
    expect(await db.projectSuppliers.count()).toBe(1)

    // Link a task to this workstream and supplier
    await createTask({ ...emptyTask(pId), name: 'Approve drawing', workstreamId: ws.id, supplierId: sup.id })

    // Deleting the workstream keeps the task, but detaches workstreamId
    await deleteWorkstream(ws.id)
    const tAfterWs = (await db.tasks.toArray())[0]
    expect(tAfterWs.workstreamId).toBe('')

    // Unlinking or deleting the supplier clears supplierId on tasks without deleting the task
    await linkSupplierToProject(pId, sup.id)
    await unlinkSupplierFromProject(pId, sup.id)
    await deleteSupplier(sup.id)
    const tAfterSup = (await db.tasks.toArray())[0]
    expect(tAfterSup.supplierId).toBe('')
  })

  it('handles tasks, milestones, meeting action links, commercial records, risks, and issues', async () => {
    const pId = await createProject({ ...emptyProject(), code: 'NPI-9003', name: 'RF Transceiver' })

    // Task auto-completion sets progress = 100 and completionDate
    await createTask({ ...emptyTask(pId), name: 'Gerber Release', startDate: '2026-11-10', dueDate: '2026-11-12', status: 'Not Started', progress: 20 })
    const task = (await db.tasks.toArray())[0]
    await rescheduleTask(task.id, '2026-11-19')
    await duplicateTaskToDate(task.id, '2026-11-26')
    expect(await db.tasks.count()).toBe(2)
    const movedTask = await db.tasks.get(task.id)
    expect(movedTask?.dueDate).toBe('2026-11-19')
    expect(movedTask?.startDate).toBe('2026-11-17')
    await updateTask(task.id, { ...movedTask!, status: 'Completed' })
    const updatedTask = await db.tasks.get(task.id)
    expect(updatedTask?.progress).toBe(100)
    expect(updatedTask?.completionDate).toBeTruthy()

    // Milestone auto-fills actualDate when marked Completed and supports drag-rescheduling + copy
    await createMilestone({ ...emptyMilestone(pId), name: 'Tapeout', targetDate: '2026-12-10' })
    const ms = (await db.milestones.toArray())[0]
    await rescheduleMilestone(ms.id, '2026-12-17')
    await duplicateMilestoneToDate(ms.id, '2026-12-24')
    expect(await db.milestones.count()).toBe(2)
    expect((await db.milestones.get(ms.id))?.targetDate).toBe('2026-12-17')
    await updateMilestone(ms.id, { ...(await db.milestones.get(ms.id))!, status: 'Completed' })
    expect((await db.milestones.get(ms.id))?.actualDate).toBeTruthy()
    await deleteMilestone(ms.id)

    // Meeting action item linked to task; deleting task unlinks action item without deleting it
    const mId = await createMeeting({ ...emptyMeeting(pId), title: 'Design Review', date: '2026-11-13' })
    await createMeetingAction({ ...emptyMeetingAction(mId), action: 'Follow up Gerber', taskId: task.id })
    await deleteTask(task.id)
    const actionAfter = (await db.meetingActions.toArray())[0]
    expect(actionAfter.taskId).toBe('')
    await deleteMeeting(mId)
    expect(await db.meetingActions.count()).toBe(0)

    // Commercial CRUD (Unified Deliverable Commercial: Quotation + PET + PO + Delivery Tracking)
    const wsId = await createWorkstream({ ...emptyWorkstream(pId), name: 'RF Load Board' })
    await saveDeliverableCommercial({
      ...emptyDeliverableCommercial(pId, wsId),
      quotationNumber: 'Q-RF-100',
      quotationAmount: 4200,
      quotationStatus: 'Accepted',
      petReference: 'PET-RF-100',
      petStatus: 'Approved',
      poNumber: 'PO-RF-100',
      poAmount: 4200,
      poStatus: 'Issued',
      supplierConfirmation: 'Confirmed',
      hardwareDelivery: 'Shipped / In Transit',
      deliveryStatus: 'In Transit',
    })
    const qRec = (await db.quotations.where('workstreamId').equals(wsId).toArray())[0]
    const petRec = (await db.petRecords.where('workstreamId').equals(wsId).toArray())[0]
    const poRec = (await db.poRecords.where('workstreamId').equals(wsId).toArray())[0]
    expect(qRec.number).toBe('Q-RF-100')
    expect(petRec.reference).toBe('PET-RF-100')
    expect(poRec.deliveryStatus).toBe('In Transit')

    await clearDeliverableCommercial(pId, wsId, { quotationId: qRec.id, petId: petRec.id, poId: poRec.id })
    expect(await db.quotations.count()).toBe(0)
    expect(await db.petRecords.count()).toBe(0)
    expect(await db.poRecords.count()).toBe(0)

    await createQuotation({ ...emptyQuotation(pId, wsId), number: 'Q-1', amount: 1500 })
    await createPet({ ...emptyPet(pId, wsId), reference: 'PET-1' })
    await createPo({ ...emptyPo(pId, wsId), number: 'PO-1', amount: 1500 })
    const po = (await db.poRecords.toArray())[0]
    await updatePo(po.id, { ...po, supplierConfirmation: 'Confirmed', hardwareDelivery: 'Shipped / In Transit', deliveryStatus: 'In Transit' })
    expect((await db.poRecords.get(po.id))?.deliveryStatus).toBe('In Transit')

    await deleteQuotation((await db.quotations.toArray())[0].id)
    await deletePet((await db.petRecords.toArray())[0].id)
    await deletePo(po.id)

    // Risk & Engineering Issue CRUD (Issue auto-fills actualDate when Resolved)
    await createRisk({ ...emptyRisk(pId), title: 'Pin wear', level: 'High' })
    await createIssue({ ...emptyIssue(pId), title: 'Trace impedance', status: 'Open' })
    const issue = (await db.issues.toArray())[0]
    await updateIssue(issue.id, { ...issue, status: 'Resolved' })
    expect((await db.issues.get(issue.id))?.actualDate).toBeTruthy()
    await deleteRisk((await db.risks.toArray())[0].id)
    await deleteIssue(issue.id)
  })

  it('loads sample data, clears only sample data while preserving user records, and validates JSON backup/restore & Excel sheets', async () => {
    await loadSampleData()
    expect(await hasSampleData()).toBe(true)

    // Add a user-created project alongside sample data
    const userProjId = await createProject({ ...emptyProject(), code: 'USER-01', name: 'My Real NPI Project' })
    expect(await db.projects.count()).toBe(5)

    // Test Excel sheet builders for all 8 report types
    for (const report of REPORT_NAMES) {
      const sheets = await buildSheets(report)
      expect(Object.keys(sheets).length).toBeGreaterThan(0)
    }

    // Build and validate JSON backup
    const backup = await buildBackup()
    expect(() => validateBackup(backup)).not.toThrow()
    expect(() => validateBackup({ app: 'wrong' })).toThrow()

    // Clear sample data: sample projects removed, USER-01 preserved
    await clearSampleData()
    expect(await hasSampleData()).toBe(false)
    expect(await db.projects.count()).toBe(1)
    expect((await db.projects.get(userProjId))?.code).toBe('USER-01')

    // Restore from backup brings back all 5 projects
    await restoreBackup(backup)
    expect(await db.projects.count()).toBe(5)
  })
})
