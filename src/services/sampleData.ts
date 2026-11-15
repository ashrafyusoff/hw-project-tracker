import { db } from '@/database/db'
import { daysFromToday as d, newId, nowIso } from '@/utils/helpers'
import { logActivity } from './activityService'

// Demo data (all fictional). Every record is flagged isSample = true,
// so "Clear Sample Data" can remove it without touching your own records.
// Dates are relative to today so the dashboard always looks current.

export async function hasSampleData(): Promise<boolean> {
  return (await db.projects.filter((p) => !!p.isSample).count()) > 0
}

export async function loadSampleData() {
  const now = nowIso()
  const base = () => ({ id: newId(), isSample: true, createdAt: now, updatedAt: now })

  // ---------- Suppliers ----------
  const nova = { ...base(), name: 'Nova Circuits Pte Ltd', contactPerson: 'Daniel Tan', email: 'daniel.tan@novacircuits.example', phone: '+65 6123 4501', location: 'Singapore', category: 'PCB Fabrication', remarks: 'Preferred vendor for high-layer-count load boards.' }
  const meridian = { ...base(), name: 'Meridian Socket Technologies', contactPerson: 'Lisa Wong', email: 'lisa.wong@meridiansocket.example', phone: '+60 4 555 8820', location: 'Penang, Malaysia', category: 'Test Socket', remarks: 'Pogo-pin and elastomer sockets.' }
  const apex = { ...base(), name: 'Apex Handler Solutions', contactPerson: 'Kenji Mori', email: 'k.mori@apexhandler.example', phone: '+81 3 5550 1188', location: 'Yokohama, Japan', category: 'Handler Kit', remarks: 'Change kits for pick-and-place handlers.' }
  const bright = { ...base(), name: 'Brightline Components Co.', contactPerson: 'Priya Nair', email: 'priya@brightline.example', phone: '+65 6234 7712', location: 'Singapore', category: 'Components', remarks: 'Passives and connectors, short lead times.' }
  const kestrel = { ...base(), name: 'Kestrel Assembly Services', contactPerson: 'Marcus Lee', email: 'marcus.lee@kestrelassy.example', phone: '+60 3 7788 9900', location: 'Selangor, Malaysia', category: 'Assembly', remarks: 'PCBA assembly and rework.' }
  const suppliers = [nova, meridian, apex, bright, kestrel]

  // ---------- Projects ----------
  const falcon = { ...base(), code: '240101', name: 'FX7200 PMIC', hwType: 'FT' as const, deviceName: 'FX7200 PMIC', atePlatform: 'Advantest V93000', description: 'Load board and socket for final test of the FX7200 multi-rail PMIC.', objectives: '', priority: 'High' as const, status: 'In Progress' as const, startDate: d(-60), baselineDate: d(45), revisedDate: '', actualDate: '', progress: 60, remarks: '' }
  const orion = { ...base(), code: '240102', name: 'OR5G-200', hwType: 'FT' as const, deviceName: 'OR5G-200', atePlatform: 'Teradyne UltraFLEX', description: 'RF test hardware including a 24-layer load board and handler kit.', objectives: '', priority: 'Critical' as const, status: 'Delayed' as const, startDate: d(-90), baselineDate: d(30), revisedDate: '', actualDate: '', progress: 40, remarks: '' }
  const atlas = { ...base(), code: '240103', name: 'AT32M3', hwType: 'WT' as const, deviceName: 'AT32M3', atePlatform: 'Teradyne J750', description: 'Hardware for a new 32-bit microcontroller family.', objectives: '', priority: 'Medium' as const, status: 'Planning' as const, startDate: d(0), baselineDate: d(120), revisedDate: '', actualDate: '', progress: 10, remarks: '' }
  const lynx = { ...base(), code: '239804', name: 'LX-110', hwType: 'Eng' as const, deviceName: 'LX-110', atePlatform: 'Advantest V93000', description: 'Sensor hub test hardware, now in production.', objectives: '', priority: 'Low' as const, status: 'Completed' as const, startDate: d(-200), baselineDate: d(-40), revisedDate: '', actualDate: '', progress: 100, remarks: '' }
  const projects = [falcon, orion, atlas, lynx]

  // ---------- Deliverables ----------
  const ws = (projectId: string, category: 'PCB' | 'Socket' | 'Handler Kit' | 'Stiffener' | 'Probe Card' | 'Probe Head' | 'Others', mpn: string, supplierId: string, status: 'Not Started' | 'In Progress' | 'On Hold' | 'Delayed' | 'Completed', progress: number) =>
    ({ ...base(), projectId, name: category, category, mpn, supplierId, status, progress, startDate: '', targetDate: '', actualDate: '', remarks: '' })
  const wFalconPcb = ws(falcon.id, 'PCB', '71F104201', nova.id, 'In Progress', 70)
  const wFalconSock = ws(falcon.id, 'Socket', '71F104202', meridian.id, 'In Progress', 50)
  const wOrionPcb = ws(orion.id, 'PCB', '71F208110', nova.id, 'Delayed', 50)
  const wOrionHandler = ws(orion.id, 'Handler Kit', '71F208115', apex.id, 'In Progress', 30)
  const wOrionStiff = ws(orion.id, 'Stiffener', '71F208119', kestrel.id, 'Not Started', 0)
  const wAtlasPcb = ws(atlas.id, 'Probe Card', '71F309001', '', 'Not Started', 0)
  const wLynxPcb = ws(lynx.id, 'PCB', '71F098401', nova.id, 'Completed', 100)
  const wLynxSock = ws(lynx.id, 'Socket', '71F098402', meridian.id, 'Completed', 100)
  const workstreams = [wFalconPcb, wFalconSock, wOrionPcb, wOrionHandler, wOrionStiff, wAtlasPcb, wLynxPcb, wLynxSock]

  // ---------- Project ↔ Supplier links ----------
  const links: [string, string][] = [
    [falcon.id, nova.id], [falcon.id, meridian.id], [falcon.id, bright.id],
    [orion.id, nova.id], [orion.id, apex.id], [orion.id, kestrel.id],
    [lynx.id, nova.id], [lynx.id, meridian.id],
  ]
  const projectSuppliers = links.map(([projectId, supplierId]) => ({ ...base(), projectId, supplierId }))

  // ---------- Tasks ----------
  type TS = 'Not Started' | 'In Progress' | 'Waiting for Supplier' | 'Under Review' | 'Completed' | 'Cancelled'
  const task = (projectId: string, workstreamId: string, name: string, assignee: string, supplierId: string, s: number, due: number, priority: 'Low' | 'Medium' | 'High' | 'Critical', status: TS, progress: number) =>
    ({ ...base(), projectId, workstreamId, name, assignee, supplierId, startDate: d(s), dueDate: d(due), completionDate: status === 'Completed' ? d(due) : '', priority, status, progress, remarks: '' })
  const t1 = task(falcon.id, wFalconPcb.id, 'Complete load board schematic review', 'Me', '', -20, -3, 'High', 'Under Review', 90)
  const t2 = task(falcon.id, wFalconPcb.id, 'Release Gerber files to Nova Circuits', 'Me', nova.id, -2, 4, 'High', 'In Progress', 60)
  const t3 = task(falcon.id, wFalconSock.id, 'Confirm socket pin-map with Meridian', 'Me', meridian.id, -10, 2, 'Medium', 'Waiting for Supplier', 50)
  const t4 = task(falcon.id, '', 'Prepare test program hardware checklist', 'Alex Chen', '', 0, 12, 'Medium', 'Not Started', 0)
  const t5 = task(orion.id, wOrionPcb.id, 'Chase revised fabrication schedule', 'Me', nova.id, -15, -4, 'Critical', 'Waiting for Supplier', 40)
  const t6 = task(orion.id, wOrionHandler.id, 'Review handler kit 3D drawing', 'Me', apex.id, -8, 5, 'High', 'In Progress', 55)
  const t7 = task(orion.id, wOrionStiff.id, 'Book stiffener slot with Kestrel', 'Me', kestrel.id, 5, 20, 'Medium', 'Not Started', 0)
  const t8 = task(atlas.id, wAtlasPcb.id, 'Define interface board requirements', 'Me', '', 10, 25, 'Medium', 'Not Started', 0)
  const t9 = task(lynx.id, wLynxPcb.id, 'Hand over hardware documentation', 'Me', '', -60, -45, 'Low', 'Completed', 100)
  const tasks = [t1, t2, t3, t4, t5, t6, t7, t8, t9]

  // ---------- Milestones ----------
  type MS = 'Not Started' | 'In Progress' | 'Completed' | 'Delayed'
  const ms = (projectId: string, workstreamId: string, name: string, description: string, target: number, status: MS, actual = '') =>
    ({ ...base(), projectId, workstreamId, name, description, targetDate: d(target), actualDate: actual, status, remarks: '' })
  const milestones = [
    ms(falcon.id, '', 'Tape Out Date', 'Silicon tape-out frozen.', -10, 'Completed', d(-10)),
    ms(falcon.id, '', 'Drawing Approval Cut-off', 'Final mechanical & layout drawing approval cut-off.', 6, 'In Progress'),
    ms(falcon.id, '', 'PCB Fabrication Complete', 'Bare boards received from Nova.', 18, 'In Progress'),
    ms(falcon.id, '', 'Socket Delivery', 'Sockets delivered and inspected.', 35, 'Not Started'),
    ms(falcon.id, '', 'Hardware Ready for Debug', 'Assembled hardware ready on tester.', 45, 'Not Started'),
    ms(orion.id, '', 'PCB Fabrication Complete', 'Original date missed.', -3, 'Delayed'),
    ms(orion.id, '', 'Handler Kit 3D Freeze', '3D mechanical drawing approved.', 11, 'In Progress'),
    ms(orion.id, '', 'Handler Kit Delivery', 'Change kit shipped from Japan.', 40, 'Not Started'),
    ms(atlas.id, '', 'Project Kick-off', 'Requirements review with design team.', 8, 'Not Started'),
    ms(lynx.id, '', 'Hardware Release', 'Final hardware release.', -42, 'Completed', d(-42)),
  ]

  // ---------- Commercial (Quotation + PET + PO + Delivery Tracking per Deliverable) ----------
  const quotations = [
    { ...base(), number: 'Q-NOVA-1182', projectId: falcon.id, workstreamId: wFalconPcb.id, supplierId: nova.id, remarks: '24-layer load board fabrication quote.' },
    { ...base(), number: 'Q-MSTL-0457', projectId: falcon.id, workstreamId: wFalconSock.id, supplierId: meridian.id, remarks: 'Pogo-pin socket assembly.' },
    { ...base(), number: 'Q-NOVA-1195', projectId: orion.id, workstreamId: wOrionPcb.id, supplierId: nova.id, remarks: 'High-frequency RF laminate load board.' },
    { ...base(), number: 'Q-APEX-2209', projectId: orion.id, workstreamId: wOrionHandler.id, supplierId: apex.id, remarks: 'Handler change kit quote.' },
    { ...base(), number: 'Q-MSTL-0390', projectId: lynx.id, workstreamId: wLynxSock.id, supplierId: meridian.id, remarks: 'Production test socket.' },
  ]
  const petRecords = [
    { ...base(), reference: 'PET-24-0132', projectId: falcon.id, workstreamId: wFalconPcb.id, supplierId: nova.id, remarks: '' },
    { ...base(), reference: 'PET-24-0139', projectId: falcon.id, workstreamId: wFalconSock.id, supplierId: meridian.id, remarks: '' },
    { ...base(), reference: 'PET-24-0118', projectId: orion.id, workstreamId: wOrionPcb.id, supplierId: nova.id, remarks: '' },
    { ...base(), reference: 'PET-24-0151', projectId: orion.id, workstreamId: wOrionHandler.id, supplierId: apex.id, remarks: '' },
    { ...base(), reference: 'PET-24-0088', projectId: lynx.id, workstreamId: wLynxSock.id, supplierId: meridian.id, remarks: '' },
  ]
  const poRecords = [
    { ...base(), number: 'PO-4500711', projectId: falcon.id, workstreamId: wFalconPcb.id, supplierId: nova.id, issueDate: d(-33), amount: 8450, currency: 'USD', expectedDelivery: d(20), actualDelivery: '', status: 'Issued', supplierConfirmation: 'Confirmed', hardwareDelivery: 'Fabrication', deliveryStatus: 'Fabrication', remarks: '' },
    { ...base(), number: 'PO-4500728', projectId: falcon.id, workstreamId: wFalconSock.id, supplierId: meridian.id, issueDate: d(-12), amount: 3200, currency: 'USD', expectedDelivery: d(35), actualDelivery: '', status: 'Issued', supplierConfirmation: 'Confirmed', hardwareDelivery: 'In Delivery', deliveryStatus: 'In Delivery', remarks: '' },
    { ...base(), number: 'PO-4500690', projectId: orion.id, workstreamId: wOrionPcb.id, supplierId: nova.id, issueDate: d(-65), amount: 11200, currency: 'USD', expectedDelivery: d(-5), actualDelivery: '', status: 'Issued', supplierConfirmation: 'Revised Schedule', hardwareDelivery: 'Fabrication', deliveryStatus: 'Fabrication', remarks: 'PCB fabrication slipped due to laminate shortage.' },
    { ...base(), number: 'PO-4500650', projectId: lynx.id, workstreamId: wLynxSock.id, supplierId: meridian.id, issueDate: d(-160), amount: 2900, currency: 'USD', expectedDelivery: d(-55), actualDelivery: d(-52), status: 'Delivered', supplierConfirmation: 'Confirmed', hardwareDelivery: 'Delivered', deliveryStatus: 'Delivered', remarks: '' },
  ]

  // ---------- Meetings & actions ----------
  const m1 = { ...base(), title: 'Falcon-X Weekly Sync', projectId: falcon.id, date: d(-3), participants: 'Me, Alex Chen, Daniel Tan (Nova)', summary: 'Reviewed load board layout status and fabrication timeline.', decisions: 'Proceed with Gerber release after schematic review sign-off.', remarks: '' }
  const m2 = { ...base(), title: 'Orion Delay Recovery Call', projectId: orion.id, date: d(-1), participants: 'Me, Program Manager, Nova sales team', summary: 'Discussed material shortage and recovery plan.', decisions: 'Nova to provide revised schedule within 3 days.', remarks: '' }
  const meetings = [m1, m2]
  const meetingActions = [
    { ...base(), meetingId: m1.id, action: 'Release Gerber files', assignee: 'Me', dueDate: d(4), status: 'Open', taskId: t2.id },
    { ...base(), meetingId: m1.id, action: 'Send pin-map to Meridian', assignee: 'Me', dueDate: d(2), status: 'Open', taskId: t3.id },
    { ...base(), meetingId: m2.id, action: 'Get revised fabrication schedule', assignee: 'Nova', dueDate: d(2), status: 'Open', taskId: t5.id },
  ]

  // ---------- Risks & Issues ----------
  const risks = [
    { ...base(), title: 'Material shortage delays PCB laminate', projectId: orion.id, description: 'High-speed laminate has long lead time.', probability: 'High', impact: 'High', level: 'High', mitigation: 'Evaluate alternate laminate with Nova.', owner: 'Me', status: 'Open' },
    { ...base(), title: 'Socket pin wear before qualification ends', projectId: falcon.id, description: 'Pogo pins may wear early at high insertion counts.', probability: 'Medium', impact: 'Medium', level: 'Medium', mitigation: 'Order spare contactor set.', owner: 'Me', status: 'Mitigating' },
  ]
  const issues = [
    { ...base(), title: 'Impedance mismatch on RF trace', projectId: orion.id, workstreamId: wOrionPcb.id, description: 'Simulated impedance is 8% off target.', rootCause: 'Stack-up assumption differs from fabricator.', correctiveAction: 'Update stack-up and re-simulate.', responsible: 'Me', dateRaised: d(-14), targetDate: d(-2), actualDate: '', status: 'Open' },
    { ...base(), title: 'Socket lid clearance clash', projectId: falcon.id, workstreamId: wFalconSock.id, description: 'Socket lid touches nearby capacitor.', rootCause: 'Component placed too close to socket outline.', correctiveAction: 'Move capacitor 1.5 mm.', responsible: 'Me', dateRaised: d(-6), targetDate: d(6), actualDate: '', status: 'In Progress' },
    { ...base(), title: 'Connector footprint error', projectId: lynx.id, workstreamId: wLynxPcb.id, description: 'Footprint pitch was wrong in v1.', rootCause: 'Wrong library part.', correctiveAction: 'Corrected in v2.', responsible: 'Me', dateRaised: d(-120), targetDate: d(-110), actualDate: d(-112), status: 'Resolved' },
  ]

  await db.transaction('rw', db.tables, async () => {
    await db.suppliers.bulkAdd(suppliers as never)
    await db.projects.bulkAdd(projects as never)
    await db.workstreams.bulkAdd(workstreams as never)
    await db.projectSuppliers.bulkAdd(projectSuppliers as never)
    await db.tasks.bulkAdd(tasks as never)
    await db.milestones.bulkAdd(milestones as never)
    await db.quotations.bulkAdd(quotations as never)
    await db.petRecords.bulkAdd(petRecords as never)
    await db.poRecords.bulkAdd(poRecords as never)
    await db.meetings.bulkAdd(meetings as never)
    await db.meetingActions.bulkAdd(meetingActions as never)
    await db.risks.bulkAdd(risks as never)
    await db.issues.bulkAdd(issues as never)
    await logActivity('Project', falcon.id, falcon.id, 'Created', 'Project NPI-2401 created', true)
    await logActivity('Project', orion.id, orion.id, 'Status Changed', 'Project NPI-2402 status: In Progress → Delayed', true)
    await logActivity('Deliverable', wLynxPcb.id, lynx.id, 'Status Changed', 'Deliverable "LX-110 Load Board" status: In Progress → Completed', true)
    await logActivity('Supplier', nova.id, '', 'Created', 'Supplier Nova Circuits Pte Ltd added', true)
  })
}

// Removes ONLY records flagged as sample. Records you created yourself stay.
// A user-created record that points at a sample project/supplier is cleaned up too, to avoid broken links.
export async function clearSampleData() {
  await db.transaction('rw', db.tables, async () => {
    const sampleProjectIds = (await db.projects.filter((p) => !!p.isSample).primaryKeys()) as string[]
    const sampleSupplierIds = (await db.suppliers.filter((s) => !!s.isSample).primaryKeys()) as string[]
    for (const t of db.tables) await t.filter((r) => !!r.isSample).delete()
    // Remove leftovers that referenced deleted sample projects / suppliers
    const projectTables = [db.workstreams, db.projectSuppliers, db.tasks, db.milestones, db.quotations, db.petRecords, db.prRecords, db.poRecords, db.meetings, db.risks, db.issues, db.activityLogs]
    for (const t of projectTables) await t.where('projectId').anyOf(sampleProjectIds).delete()
    await db.projectSuppliers.where('supplierId').anyOf(sampleSupplierIds).delete()
    for (const t of [db.workstreams, db.tasks, db.quotations, db.petRecords, db.prRecords, db.poRecords]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (t as any).where('supplierId').anyOf(sampleSupplierIds).modify({ supplierId: '' })
    }
    // Remove meeting actions whose meeting no longer exists
    const meetingIds = new Set((await db.meetings.toCollection().primaryKeys()) as string[])
    await db.meetingActions.filter((a) => !meetingIds.has(a.meetingId)).delete()
  })
}
