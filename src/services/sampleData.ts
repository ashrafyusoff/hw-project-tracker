import { db } from '@/database/db'
import { daysFromToday as d, newId, nowIso } from '@/utils/helpers'
import { logActivity } from './activityService'

// Demo data (all fictional). Every record is flagged isSample = true,
// so "Clear Sample Data" can remove it without touching your own records.
// Dates are relative to today so the dashboard always looks current.

const SAMPLE_PROJECT_CODES = [
  '240101',
  '240102',
  '240103',
  '240104',
  '240105',
  '239804',
  '239602',
  'DOE A-001',
  'Web Development A-002',
  'Process Improvement A-003',
  'Automation / Tooling A-004',
  'Lab & Equipment A-005',
]

const SAMPLE_SUPPLIER_NAMES = [
  'Nova Circuits Pte Ltd',
  'Meridian Socket Technologies',
  'Apex Handler Solutions',
  'FormFactor Probe Systems',
  'Kestrel Assembly Services',
  'Brightline Components Co.',
]

export async function hasSampleData(): Promise<boolean> {
  const sampleProjCount = await db.projects.filter((p) => !!p.isSample).count()
  const sampleSupCount = await db.suppliers.filter((s) => !!s.isSample).count()
  return sampleProjCount > 0 || sampleSupCount > 0
}

export async function loadSampleData() {
  await clearSampleData()
  const now = nowIso()
  const base = () => ({ id: newId(), isSample: true, createdAt: now, updatedAt: now })

  // Ensure no unique-index collision on &code (projects) or &name (suppliers)
  const existingCodes = new Set((await db.projects.toArray()).map((p) => p.code))
  const existingNames = new Set((await db.suppliers.toArray()).map((s) => s.name))
  const safeCode = (code: string) => (existingCodes.has(code) ? `${code} (Sample)` : code)
  const safeName = (name: string) => (existingNames.has(name) ? `${name} (Sample)` : name)

  // ---------- Suppliers (with multiple contacts & Deliverable-aligned categories) ----------
  const nova = {
    ...base(),
    name: safeName('Nova Circuits Pte Ltd'),
    contactPerson: 'Daniel Tan (Sales Lead)',
    email: 'daniel.tan@novacircuits.example',
    phone: '+65 6123 4501',
    contacts: [
      { contactPerson: 'Daniel Tan (Sales Lead)', phone: '+65 6123 4501', email: 'daniel.tan@novacircuits.example' },
      { contactPerson: 'Rachel Lim (CAM Engineer)', phone: '+65 6123 4508', email: 'rachel.lim@novacircuits.example' },
      { contactPerson: 'Kevin Goh (Logistics)', phone: '+65 6123 4515', email: 'kevin.goh@novacircuits.example' },
    ],
    location: 'Singapore',
    category: 'PCB',
    remarks: 'Preferred vendor for high-layer-count ATE load boards and probe PCBs.',
  }
  const meridian = {
    ...base(),
    name: safeName('Meridian Socket Technologies'),
    contactPerson: 'Lisa Wong (Account Manager)',
    email: 'lisa.wong@meridiansocket.example',
    phone: '+60 4 555 8820',
    contacts: [
      { contactPerson: 'Lisa Wong (Account Manager)', phone: '+60 4 555 8820', email: 'lisa.wong@meridiansocket.example' },
      { contactPerson: 'Ahmad Faiz (Mechanical Design)', phone: '+60 4 555 8829', email: 'ahmad.faiz@meridiansocket.example' },
      { contactPerson: 'Chong Wei (FAE Support)', phone: '+60 4 555 8835', email: 'chong.wei@meridiansocket.example' },
    ],
    location: 'Penang, Malaysia',
    category: 'Socket',
    remarks: 'High-speed coaxial pogo-pin and elastomer test sockets.',
  }
  const apex = {
    ...base(),
    name: safeName('Apex Handler Solutions'),
    contactPerson: 'Kenji Mori (Key Account)',
    email: 'k.mori@apexhandler.example',
    phone: '+81 3 5550 1188',
    contacts: [
      { contactPerson: 'Kenji Mori (Key Account)', phone: '+81 3 5550 1188', email: 'k.mori@apexhandler.example' },
      { contactPerson: 'Yuki Sato (Field Application)', phone: '+81 3 5550 1195', email: 'y.sato@apexhandler.example' },
    ],
    location: 'Yokohama, Japan',
    category: 'Handler Kit',
    remarks: 'Tri-temp pick-and-place handler change kits and contactors.',
  }
  const formfactor = {
    ...base(),
    name: safeName('FormFactor Probe Systems'),
    contactPerson: 'David Park (Regional Sales)',
    email: 'david.park@ffprobe.example',
    phone: '+82 2 3456 7810',
    contacts: [
      { contactPerson: 'David Park (Regional Sales)', phone: '+82 2 3456 7810', email: 'david.park@ffprobe.example' },
      { contactPerson: 'Min-Jae Kim (Probe Card Design)', phone: '+82 2 3456 7822', email: 'mj.kim@ffprobe.example' },
    ],
    location: 'Suwon, South Korea',
    category: 'Probe Card',
    remarks: 'MEMS vertical probe cards and probe heads for wafer sort.',
  }
  const kestrel = {
    ...base(),
    name: safeName('Kestrel Assembly Services'),
    contactPerson: 'Marcus Lee (Operations)',
    email: 'marcus.lee@kestrelassy.example',
    phone: '+60 3 7788 9900',
    contacts: [
      { contactPerson: 'Marcus Lee (Operations)', phone: '+60 3 7788 9900', email: 'marcus.lee@kestrelassy.example' },
      { contactPerson: 'Siti Aminah (QA Lead)', phone: '+60 3 7788 9912', email: 'siti.aminah@kestrelassy.example' },
    ],
    location: 'Selangor, Malaysia',
    category: 'Stiffener',
    remarks: 'CNC stainless steel stiffeners, frames, and PCBA assembly.',
  }
  const bright = {
    ...base(),
    name: safeName('Brightline Components Co.'),
    contactPerson: 'Priya Nair (Sales Director)',
    email: 'priya@brightline.example',
    phone: '+65 6234 7712',
    contacts: [
      { contactPerson: 'Priya Nair (Sales Director)', phone: '+65 6234 7712', email: 'priya@brightline.example' },
      { contactPerson: 'Jason Teo (Inside Sales)', phone: '+65 6234 7719', email: 'jason.teo@brightline.example' },
    ],
    location: 'Singapore',
    category: 'Others (Thermal & RF Components)',
    remarks: 'Active thermal chucks, high-frequency relays, and blind-mate connectors.',
  }
  const suppliers = [nova, meridian, apex, formfactor, kestrel, bright]

  // ---------- Projects (NPI / HRS + Non-NPI Work across different categories) ----------
  const falcon = {
    ...base(),
    code: safeCode('240101'),
    name: 'FX7200 PMIC',
    hwType: 'FT' as const,
    deviceName: 'FX7200 PMIC',
    atePlatform: 'Advantest V93000',
    description: '8-site final test load board, pogo socket, and stiffener for FX7200 multi-rail automotive PMIC.',
    objectives: '',
    priority: 'High' as const,
    status: 'In Progress' as const,
    startDate: d(-60),
    baselineDate: d(24),
    revisedDate: '',
    actualDate: '',
    progress: 65,
    remarks: '',
  }
  const orion = {
    ...base(),
    code: safeCode('240102'),
    name: 'OR5G-200 RF',
    hwType: 'FT' as const,
    deviceName: 'OR5G-200 RF',
    atePlatform: 'Teradyne UltraFLEX',
    description: 'mmWave RF test hardware including a 28-layer Megatron-6 load board, coaxial socket, and handler kit.',
    objectives: '',
    priority: 'Critical' as const,
    status: 'Delayed' as const,
    startDate: d(-75),
    baselineDate: d(14),
    revisedDate: '',
    actualDate: '',
    progress: 45,
    remarks: '',
  }
  const atlas = {
    ...base(),
    code: safeCode('240103'),
    name: 'AT32M3 MCU',
    hwType: 'WT' as const,
    deviceName: 'AT32M3 MCU',
    atePlatform: 'Teradyne J750',
    description: 'Wafer sort MEMS probe card and probe head for 32-bit automotive microcontroller family.',
    objectives: '',
    priority: 'Medium' as const,
    status: 'Planning' as const,
    startDate: d(-10),
    baselineDate: d(55),
    revisedDate: '',
    actualDate: '',
    progress: 20,
    remarks: '',
  }
  const novaAi = {
    ...base(),
    code: safeCode('240104'),
    name: 'NV900 AI SoC',
    hwType: 'FT' as const,
    deviceName: 'NV900 AI SoC',
    atePlatform: 'Advantest V93000 EXA',
    description: 'High-power characterization load board and 450W active thermal head for AI accelerator.',
    objectives: '',
    priority: 'High' as const,
    status: 'In Validation' as const,
    startDate: d(-35),
    baselineDate: d(38),
    revisedDate: '',
    actualDate: '',
    progress: 50,
    remarks: '',
  }
  const bmsQual = {
    ...base(),
    code: safeCode('240105'),
    name: 'BM480 BMS',
    hwType: 'Eng' as const,
    deviceName: 'BM480 BMS',
    atePlatform: 'Eagle ETS-88',
    description: 'High-voltage battery monitor qualification board awaiting silicon rev B respin confirmation.',
    objectives: '',
    priority: 'Low' as const,
    status: 'On Hold' as const,
    startDate: d(-45),
    baselineDate: d(70),
    revisedDate: '',
    actualDate: '',
    progress: 30,
    remarks: '',
  }
  const lynx = {
    ...base(),
    code: safeCode('239804'),
    name: 'LX-110 Sensor',
    isArchived: true,
    hwType: 'Eng' as const,
    deviceName: 'LX-110 Sensor',
    atePlatform: 'Advantest V93000',
    description: 'Sensor hub test hardware released to high-volume production.',
    objectives: '',
    priority: 'Low' as const,
    status: 'Completed' as const,
    startDate: d(-180),
    baselineDate: d(-35),
    revisedDate: '',
    actualDate: d(-37),
    progress: 100,
    remarks: '',
  }
  const legacyRf = {
    ...base(),
    code: safeCode('239602'),
    name: 'RX-090 Legacy',
    isArchived: true,
    hwType: 'FT' as const,
    deviceName: 'RX-090 Legacy',
    atePlatform: 'Teradyne UltraFLEX',
    description: 'Derivative package option cancelled by product line.',
    objectives: '',
    priority: 'Low' as const,
    status: 'Cancelled' as const,
    startDate: d(-150),
    baselineDate: d(-60),
    revisedDate: '',
    actualDate: '',
    progress: 20,
    remarks: '',
  }

  // Non-NPI Work Sample Items across 5 categories
  const doeWork = {
    ...base(),
    code: safeCode('DOE A-001'),
    name: 'Pogo Pin Contact Resistance & Cleaning Frequency DOE',
    isNonNpi: true,
    nonNpiCategory: 'DOE',
    hwType: 'FT' as const,
    deviceName: 'DOE A-001',
    atePlatform: '',
    description: 'Evaluate 3 pogo-pin tip geometries and laser vs. brush cleaning intervals across 50k touchdowns.',
    objectives: '',
    priority: 'High' as const,
    status: 'In Progress' as const,
    startDate: d(-40),
    baselineDate: d(18),
    revisedDate: '',
    actualDate: '',
    progress: 60,
    remarks: '',
  }
  const webWork = {
    ...base(),
    code: safeCode('WEB A-002'),
    name: 'NPI Hardware & Lab Inventory Web Portal',
    isNonNpi: true,
    nonNpiCategory: 'Web Development',
    hwType: 'FT' as const,
    deviceName: 'WEB A-002',
    atePlatform: '',
    description: 'Internal web dashboard for tracking load board storage racks, socket spare counts, and calibration dates.',
    objectives: '',
    priority: 'Medium' as const,
    status: 'In Progress' as const,
    startDate: d(-50),
    baselineDate: d(28),
    revisedDate: '',
    actualDate: '',
    progress: 50,
    remarks: '',
  }
  const impWork = {
    ...base(),
    code: safeCode('PI A-003'),
    name: 'Standardize PCB Design Rule Check (DRC) Checklist',
    isNonNpi: true,
    nonNpiCategory: 'Process Improvement',
    hwType: 'FT' as const,
    deviceName: 'PI A-003',
    atePlatform: '',
    description: 'Unify V93000 and UltraFLEX schematic & layout review checklist to cut fabrication respins.',
    objectives: '',
    priority: 'Critical' as const,
    status: 'Delayed' as const,
    startDate: d(-55),
    baselineDate: d(7),
    revisedDate: '',
    actualDate: '',
    progress: 40,
    remarks: '',
  }
  const autoWork = {
    ...base(),
    code: safeCode('AUTO A-004'),
    name: 'Automated Gerber & Pin-Map Verification Script',
    isNonNpi: true,
    nonNpiCategory: 'Automation / Tooling',
    hwType: 'FT' as const,
    deviceName: 'AUTO A-004',
    atePlatform: '',
    description: 'Python utility to cross-check Cadence Allegro netlist pin-maps against socket drawing coordinates.',
    objectives: '',
    priority: 'Low' as const,
    status: 'Planning' as const,
    startDate: d(-14),
    baselineDate: d(42),
    revisedDate: '',
    actualDate: '',
    progress: 25,
    remarks: '',
  }
  const labWork = {
    ...base(),
    code: safeCode('LAB A-005'),
    name: 'TDR & VNA Probe Station Annual Calibration',
    isNonNpi: true,
    isArchived: true,
    nonNpiCategory: 'Lab & Equipment',
    hwType: 'Eng' as const,
    deviceName: 'LAB A-005',
    atePlatform: '',
    description: 'Verify 40GHz VNA calibration standards and replace worn SMA torque wrenches in NPI lab.',
    objectives: '',
    priority: 'Medium' as const,
    status: 'Completed' as const,
    startDate: d(-45),
    baselineDate: d(-10),
    revisedDate: '',
    actualDate: d(-12),
    progress: 100,
    remarks: '',
  }

  const projects = [
    falcon,
    orion,
    atlas,
    novaAi,
    bmsQual,
    lynx,
    legacyRf,
    doeWork,
    webWork,
    impWork,
    autoWork,
    labWork,
  ]

  // ---------- Individual Deliverables (each HRS.Deliverable tracked individually) ----------
  const ws = (
    projectId: string,
    category: 'PCB' | 'Socket' | 'Handler Kit' | 'Stiffener' | 'Probe Card' | 'Probe Head' | 'Others',
    customName: string,
    mpn: string,
    supplierId: string,
    status: 'Not Started' | 'In Progress' | 'On Hold' | 'Delayed' | 'Completed',
    progress: number,
  ) => ({
    ...base(),
    projectId,
    name: customName || category,
    category,
    mpn,
    supplierId,
    status,
    progress,
    startDate: '',
    targetDate: '',
    actualDate: '',
    remarks: '',
  })

  const wFalconPcb = ws(falcon.id, 'PCB', 'PCB', '71F104201', nova.id, 'In Progress', 70)
  const wFalconSock = ws(falcon.id, 'Socket', 'Socket', '71F104202', meridian.id, 'In Progress', 60)
  const wFalconStiff = ws(falcon.id, 'Stiffener', 'Stiffener', '71F104209', kestrel.id, 'Completed', 100)

  const wOrionPcb = ws(orion.id, 'PCB', 'PCB', '71F208110', nova.id, 'Delayed', 50)
  const wOrionHandler = ws(orion.id, 'Handler Kit', 'Handler Kit', '71F208115', apex.id, 'In Progress', 40)
  const wOrionSock = ws(orion.id, 'Socket', 'Socket', '71F208118', meridian.id, 'In Progress', 30)

  const wAtlasProbeCard = ws(atlas.id, 'Probe Card', 'Probe Card', '71W309001', formfactor.id, 'In Progress', 20)
  const wAtlasProbeHead = ws(atlas.id, 'Probe Head', 'Probe Head', '71W309002', formfactor.id, 'Not Started', 0)

  const wNovaPcb = ws(novaAi.id, 'PCB', 'PCB', '71C410501', nova.id, 'In Progress', 50)
  const wNovaThermal = ws(novaAi.id, 'Others', 'Active Thermal Chuck', '71C410508', bright.id, 'In Progress', 40)

  const wBmsPcb = ws(bmsQual.id, 'PCB', 'PCB', '71Q512001', nova.id, 'On Hold', 30)

  const wLynxPcb = ws(lynx.id, 'PCB', 'PCB', '71F098401', nova.id, 'Completed', 100)
  const wLynxSock = ws(lynx.id, 'Socket', 'Socket', '71F098402', meridian.id, 'Completed', 100)

  const workstreams = [
    wFalconPcb,
    wFalconSock,
    wFalconStiff,
    wOrionPcb,
    wOrionHandler,
    wOrionSock,
    wAtlasProbeCard,
    wAtlasProbeHead,
    wNovaPcb,
    wNovaThermal,
    wBmsPcb,
    wLynxPcb,
    wLynxSock,
  ]

  // ---------- Project ↔ Supplier links ----------
  const links: [string, string][] = [
    [falcon.id, nova.id],
    [falcon.id, meridian.id],
    [falcon.id, kestrel.id],
    [orion.id, nova.id],
    [orion.id, apex.id],
    [orion.id, meridian.id],
    [atlas.id, formfactor.id],
    [novaAi.id, nova.id],
    [novaAi.id, bright.id],
    [bmsQual.id, nova.id],
    [lynx.id, nova.id],
    [lynx.id, meridian.id],
  ]
  const projectSuppliers = links.map(([projectId, supplierId]) => ({ ...base(), projectId, supplierId }))

  // ---------- Tasks (Spanning Past 8 Weeks, Current Week, and Next 8 Weeks for the 17-Week Workload Chart) ----------
  type TS = 'Not Started' | 'In Progress' | 'On Hold' | 'Waiting for Supplier' | 'Under Review' | 'Completed' | 'Cancelled'
  const TIME_SLOTS: readonly [string, string][] = [
    ['08:30', '10:00'],
    ['09:00', '10:30'],
    ['10:00', '11:30'],
    ['11:00', '12:00'],
    ['13:00', '14:30'],
    ['14:00', '16:00'],
    ['15:00', '16:30'],
    ['16:00', '17:30'],
    ['09:30', '11:00'],
    ['13:30', '15:00'],
  ]
  let taskSlotIdx = 0
  const task = (
    projectId: string,
    workstreamId: string,
    name: string,
    assignee: string,
    supplierId: string,
    s: number,
    due: number,
    priority: 'Low' | 'Medium' | 'High' | 'Critical',
    status: TS,
    progress: number,
  ) => {
    const [startTime, endTime] = TIME_SLOTS[(taskSlotIdx++ * 3) % TIME_SLOTS.length]
    return {
      ...base(),
      projectId,
      workstreamId,
      name,
      assignee,
      supplierId,
      startDate: d(s),
      dueDate: d(due),
      startTime,
      endTime,
      completionDate: status === 'Completed' ? d(due) : '',
      priority,
      status,
      progress,
      remarks: '',
    }
  }

  // Historical NPI & Non-NPI Tasks across Past 8 Weeks (-56d to -7d)
  const hist1 = task(falcon.id, wFalconPcb.id, 'Define FX7200 power rail decoupling budget', 'Me', '', -56, -53, 'High', 'Completed', 100)
  const hist2 = task(orion.id, wOrionPcb.id, 'Select low-loss RF laminate material with Nova', 'Me', nova.id, -50, -46, 'Critical', 'Completed', 100)
  const hist3 = task(webWork.id, '', 'Gather lab storage rack requirements from test engineers', 'Me', '', -48, -45, 'Medium', 'Completed', 100)
  const hist4 = task(falcon.id, wFalconSock.id, 'Approve preliminary socket outline drawing', 'Me', meridian.id, -42, -39, 'High', 'Completed', 100)
  const hist5 = task(impWork.id, '', 'Audit past 12 months PCB ECO root causes', 'Me', '', -41, -38, 'High', 'Completed', 100)
  const hist6 = task(orion.id, wOrionHandler.id, 'Send package BGA pod drawing to Apex Japan', 'Me', apex.id, -35, -32, 'High', 'Completed', 100)
  const hist7 = task(doeWork.id, '', 'Prepare 3 pogo-pin tip sample lots with Meridian', 'Me', '', -34, -31, 'High', 'Completed', 100)
  const hist8 = task(novaAi.id, wNovaPcb.id, 'Complete V93000 EXA pin-channel mapping', 'Me', '', -28, -25, 'High', 'Completed', 100)
  const hist9 = task(webWork.id, '', 'Design IndexedDB schema for hardware rack tracking', 'Me', '', -27, -24, 'Medium', 'Completed', 100)
  const hist10 = task(falcon.id, wFalconStiff.id, 'Release CNC stiffener step file to Kestrel', 'Me', kestrel.id, -21, -18, 'Medium', 'Completed', 100)
  const hist11 = task(doeWork.id, '', 'Run 10k touchdown contact resistance baseline', 'Me', '', -20, -17, 'High', 'Completed', 100)
  const hist12 = task(novaAi.id, wNovaThermal.id, 'Confirm 450W thermal head PID controller specs', 'Me', bright.id, -14, -10, 'High', 'Completed', 100)
  const hist13 = task(labWork.id, '', 'Complete 40GHz VNA SOLT calibration verification', 'Me', '', -13, -11, 'Medium', 'Completed', 100)

  // Carry-over & Current Week Tasks (-5d to +5d)
  const t1 = task(orion.id, wOrionPcb.id, 'Chase revised RF PCB fabrication schedule', 'Me', nova.id, -9, -3, 'Critical', 'In Progress', 50)
  const t2 = task(impWork.id, '', 'Consolidate high-speed RF layout rules into DRC checklist', 'Me', '', -8, -1, 'Critical', 'In Progress', 60)
  const t3 = task(falcon.id, wFalconPcb.id, 'Complete final load board Gerber & drill review', 'Me', nova.id, -4, 0, 'High', 'In Progress', 90)
  const t4 = task(doeWork.id, '', 'Collect 25k insertion CRes data across 3 socket sites', 'Me', '', -3, 0, 'High', 'In Progress', 70)
  const t5 = task(falcon.id, wFalconSock.id, 'Confirm coaxial pogo pin-map with Meridian', 'Me', meridian.id, -2, 1, 'High', 'In Progress', 60)
  const t6 = task(webWork.id, '', 'Build barcode scanner lookup view for rack tracker', 'Me', '', -3, 1, 'Medium', 'In Progress', 50)
  const t7 = task(orion.id, wOrionHandler.id, 'Review handler change kit 3D thermal clearance', 'Me', apex.id, -2, 2, 'High', 'In Progress', 60)
  const t8 = task(novaAi.id, wNovaPcb.id, 'Run 3D EM simulation on SERDES differential pairs', 'Me', '', -1, 2, 'Critical', 'In Progress', 40)
  const t9 = task(autoWork.id, '', 'Write parser for Cadence Allegro netlist export', 'Me', '', -1, 2, 'Medium', 'In Progress', 30)
  const t10 = task(atlas.id, wAtlasProbeCard.id, 'Verify wafer pad coordinates with design team', 'Me', formfactor.id, 0, 2, 'High', 'In Progress', 40)
  const t11 = task(orion.id, wOrionSock.id, 'Approve 40GHz elastomer socket S-parameter model', 'Me', meridian.id, 0, 3, 'High', 'In Progress', 80)
  const t12 = task(falcon.id, wFalconPcb.id, 'Order high-precision power sense resistors', 'Me', bright.id, 1, 4, 'Medium', 'In Progress', 30)

  // Upcoming 8 Weeks Tasks (+7d to +55d)
  const fut1 = task(doeWork.id, '', 'Analyze 50k insertion wear SEM microscope images', 'Me', '', 5, 9, 'High', 'Not Started', 0)
  const fut2 = task(falcon.id, wFalconPcb.id, 'Perform bare board flying-probe continuity check', 'Me', nova.id, 8, 12, 'High', 'Not Started', 0)
  const fut3 = task(impWork.id, '', 'Conduct peer review on unified DRC checklist v1.0', 'Me', '', 10, 15, 'Medium', 'Not Started', 0)
  const fut4 = task(orion.id, wOrionPcb.id, 'Inspect assembled RF load board TDR impedance coupons', 'Me', nova.id, 12, 18, 'Critical', 'Not Started', 0)
  const fut5 = task(webWork.id, '', 'Deploy lab inventory portal to internal server', 'Me', '', 16, 22, 'Medium', 'Not Started', 0)
  const fut6 = task(falcon.id, wFalconSock.id, 'Mount pogo sockets and verify coplanarity on V93000', 'Me', meridian.id, 18, 24, 'High', 'Not Started', 0)
  const fut7 = task(autoWork.id, '', 'Add automated DRC PDF report generator to script', 'Me', '', 22, 29, 'Low', 'Not Started', 0)
  const fut8 = task(novaAi.id, wNovaThermal.id, 'Bench-test 450W active thermal chuck ramp rate', 'Me', bright.id, 25, 33, 'High', 'Not Started', 0)
  const fut9 = task(atlas.id, wAtlasProbeCard.id, 'Complete probe card針 (needle) planarity inspection', 'Me', formfactor.id, 32, 40, 'Medium', 'Not Started', 0)
  const fut10 = task(autoWork.id, '', 'Roll out pin-map verification tool to NPI team', 'Me', '', 38, 46, 'Low', 'Not Started', 0)
  const fut11 = task(atlas.id, wAtlasProbeHead.id, 'Validate wafer sort correlation on J750 tester', 'Me', formfactor.id, 45, 53, 'High', 'Not Started', 0)
  const fut12 = task(bmsQual.id, wBmsPcb.id, 'Resume BM480 schematic update after silicon rev B', 'Me', nova.id, 20, 48, 'Low', 'On Hold', 10)
  const fut13 = task(lynx.id, wLynxPcb.id, 'Archive final production Gerber & BOM package', 'Me', '', -60, -40, 'Low', 'Completed', 100)

  const tasks = [
    hist1, hist2, hist3, hist4, hist5, hist6, hist7, hist8, hist9, hist10, hist11, hist12, hist13,
    t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12,
    fut1, fut2, fut3, fut4, fut5, fut6, fut7, fut8, fut9, fut10, fut11, fut12, fut13,
  ]

  // ---------- Milestones ----------
  type MS = 'Not Started' | 'In Progress' | 'Completed' | 'Delayed'
  const ms = (projectId: string, workstreamId: string, name: string, description: string, target: number, status: MS, actual = '') => ({
    ...base(),
    projectId,
    workstreamId,
    name,
    description,
    targetDate: d(target),
    actualDate: actual,
    status,
    remarks: '',
  })
  const milestones = [
    ms(falcon.id, '', 'Tape Out Date', 'Silicon tape-out frozen.', -20, 'Completed', d(-20)),
    ms(falcon.id, wFalconPcb.id, 'Drawing Approval Cut-off', 'Final mechanical & layout drawing approval cut-off.', 2, 'In Progress'),
    ms(falcon.id, wFalconPcb.id, 'PCB Fabrication Complete', 'Bare boards received from Nova Circuits.', 14, 'In Progress'),
    ms(falcon.id, wFalconSock.id, 'Socket Delivery', 'Sockets delivered and inspected.', 20, 'Not Started'),
    ms(falcon.id, '', 'Hardware Ready for Debug', 'Assembled hardware ready on V93000 tester.', 24, 'Not Started'),
    ms(orion.id, wOrionPcb.id, 'RF PCB Fabrication Complete', 'Original date slipped due to laminate lead time.', -2, 'Delayed'),
    ms(orion.id, wOrionHandler.id, 'Handler Kit 3D Freeze', '3D mechanical drawing approved.', 4, 'In Progress'),
    ms(orion.id, wOrionHandler.id, 'Handler Kit Delivery', 'Change kit shipped from Yokohama.', 14, 'Not Started'),
    ms(novaAi.id, wNovaThermal.id, 'Thermal Chuck Bench Sign-off', '450W thermal transient qualification.', 30, 'In Progress'),
    ms(atlas.id, wAtlasProbeCard.id, 'Probe Card Design Freeze', 'Final probe head layout sign-off.', 10, 'Not Started'),
    ms(lynx.id, '', 'Production Hardware Release', 'Final hardware release to manufacturing.', -37, 'Completed', d(-37)),
  ]

  // ---------- Individual Commercial & Hardware Status per HRS.Deliverable ----------
  const quotations = [
    { ...base(), number: 'Q-NOVA-1182', projectId: falcon.id, workstreamId: wFalconPcb.id, supplierId: nova.id, remarks: '24-layer load board fabrication quote.' },
    { ...base(), number: 'Q-MSTL-0457', projectId: falcon.id, workstreamId: wFalconSock.id, supplierId: meridian.id, remarks: '8-site pogo-pin socket assembly.' },
    { ...base(), number: 'Q-KSTL-0094', projectId: falcon.id, workstreamId: wFalconStiff.id, supplierId: kestrel.id, remarks: 'CNC stainless steel stiffener frame.' },
    { ...base(), number: 'Q-NOVA-1195', projectId: orion.id, workstreamId: wOrionPcb.id, supplierId: nova.id, remarks: '28-layer Megatron-6 RF load board.' },
    { ...base(), number: 'Q-APEX-2209', projectId: orion.id, workstreamId: wOrionHandler.id, supplierId: apex.id, remarks: 'Tri-temp handler change kit quote.' },
    { ...base(), number: 'Q-MSTL-0468', projectId: orion.id, workstreamId: wOrionSock.id, supplierId: meridian.id, remarks: '40GHz coaxial elastomer socket.' },
    { ...base(), number: 'Q-FFPS-8821', projectId: atlas.id, workstreamId: wAtlasProbeCard.id, supplierId: formfactor.id, remarks: 'MEMS wafer probe card quote.' },
    { ...base(), number: 'Q-NOVA-1210', projectId: novaAi.id, workstreamId: wNovaPcb.id, supplierId: nova.id, remarks: 'EXA high-density characterization PCB.' },
    { ...base(), number: 'Q-BRTL-3304', projectId: novaAi.id, workstreamId: wNovaThermal.id, supplierId: bright.id, remarks: '450W active thermal chuck assembly.' },
    { ...base(), number: 'Q-MSTL-0390', projectId: lynx.id, workstreamId: wLynxSock.id, supplierId: meridian.id, remarks: 'Production test socket.' },
  ]
  const petRecords = [
    { ...base(), reference: 'PET-24-0132', projectId: falcon.id, workstreamId: wFalconPcb.id, supplierId: nova.id, remarks: '' },
    { ...base(), reference: 'PET-24-0139', projectId: falcon.id, workstreamId: wFalconSock.id, supplierId: meridian.id, remarks: '' },
    { ...base(), reference: 'PET-24-0141', projectId: falcon.id, workstreamId: wFalconStiff.id, supplierId: kestrel.id, remarks: '' },
    { ...base(), reference: 'PET-24-0118', projectId: orion.id, workstreamId: wOrionPcb.id, supplierId: nova.id, remarks: '' },
    { ...base(), reference: 'PET-24-0151', projectId: orion.id, workstreamId: wOrionHandler.id, supplierId: apex.id, remarks: '' },
    { ...base(), reference: 'PET-24-0156', projectId: orion.id, workstreamId: wOrionSock.id, supplierId: meridian.id, remarks: '' },
    { ...base(), reference: 'PET-24-0162', projectId: novaAi.id, workstreamId: wNovaPcb.id, supplierId: nova.id, remarks: '' },
    { ...base(), reference: 'PET-24-0165', projectId: novaAi.id, workstreamId: wNovaThermal.id, supplierId: bright.id, remarks: '' },
    { ...base(), reference: 'PET-24-0088', projectId: lynx.id, workstreamId: wLynxSock.id, supplierId: meridian.id, remarks: '' },
  ]
  const poRecords = [
    {
      ...base(),
      number: 'PO-4500711',
      projectId: falcon.id,
      workstreamId: wFalconPcb.id,
      supplierId: nova.id,
      issueDate: d(-30),
      amount: 14800,
      currency: 'USD',
      expectedDelivery: d(14),
      actualDelivery: '',
      status: 'Issued',
      supplierConfirmation: 'Confirmed',
      hardwareDelivery: 'Fabrication',
      deliveryStatus: 'Fabrication',
      remarks: 'Lamination complete; drilling in progress.',
    },
    {
      ...base(),
      number: 'PO-4500728',
      projectId: falcon.id,
      workstreamId: wFalconSock.id,
      supplierId: meridian.id,
      issueDate: d(-18),
      amount: 9600,
      currency: 'USD',
      expectedDelivery: d(20),
      actualDelivery: '',
      status: 'Issued',
      supplierConfirmation: 'Confirmed',
      hardwareDelivery: 'In Delivery',
      deliveryStatus: 'In Delivery',
      remarks: 'Shipped via DHL Express from Penang.',
    },
    {
      ...base(),
      number: 'PO-4500702',
      projectId: falcon.id,
      workstreamId: wFalconStiff.id,
      supplierId: kestrel.id,
      issueDate: d(-25),
      amount: 1850,
      currency: 'USD',
      expectedDelivery: d(-5),
      actualDelivery: d(-6),
      status: 'Delivered',
      supplierConfirmation: 'Confirmed',
      hardwareDelivery: 'Delivered',
      deliveryStatus: 'Delivered',
      remarks: 'Received in NPI lab rack B2.',
    },
    {
      ...base(),
      number: 'PO-4500690',
      projectId: orion.id,
      workstreamId: wOrionPcb.id,
      supplierId: nova.id,
      issueDate: d(-55),
      amount: 19400,
      currency: 'USD',
      expectedDelivery: d(-2),
      actualDelivery: '',
      status: 'Issued',
      supplierConfirmation: 'Revised Schedule',
      hardwareDelivery: 'Fabrication',
      deliveryStatus: 'Fabrication',
      remarks: 'PCB fabrication slipped due to Megatron-6 laminate lead time.',
    },
    {
      ...base(),
      number: 'PO-4500741',
      projectId: orion.id,
      workstreamId: wOrionHandler.id,
      supplierId: apex.id,
      issueDate: d(-15),
      amount: 16200,
      currency: 'USD',
      expectedDelivery: d(14),
      actualDelivery: '',
      status: 'Issued',
      supplierConfirmation: 'Confirmed',
      hardwareDelivery: 'Design',
      deliveryStatus: 'Design',
      remarks: '3D thermal clearance review in progress.',
    },
    {
      ...base(),
      number: '',
      projectId: orion.id,
      workstreamId: wOrionSock.id,
      supplierId: meridian.id,
      issueDate: '',
      amount: 11500,
      currency: 'USD',
      expectedDelivery: d(12),
      actualDelivery: '',
      status: 'Issued',
      supplierConfirmation: 'Pending',
      hardwareDelivery: 'Design',
      deliveryStatus: 'Design',
      remarks: 'Awaiting PO release after PET approval.',
    },
    {
      ...base(),
      number: '',
      projectId: atlas.id,
      workstreamId: wAtlasProbeCard.id,
      supplierId: formfactor.id,
      issueDate: '',
      amount: 28000,
      currency: 'USD',
      expectedDelivery: d(45),
      actualDelivery: '',
      status: 'Issued',
      supplierConfirmation: 'Pending',
      hardwareDelivery: 'Design',
      deliveryStatus: 'Design',
      remarks: 'Probe head layout in progress.',
    },
    {
      ...base(),
      number: 'PO-4500755',
      projectId: novaAi.id,
      workstreamId: wNovaPcb.id,
      supplierId: nova.id,
      issueDate: d(-10),
      amount: 22500,
      currency: 'USD',
      expectedDelivery: d(28),
      actualDelivery: '',
      status: 'Issued',
      supplierConfirmation: 'Confirmed',
      hardwareDelivery: 'Design',
      deliveryStatus: 'Design',
      remarks: 'SERDES stack-up simulation review.',
    },
    {
      ...base(),
      number: 'PO-4500760',
      projectId: novaAi.id,
      workstreamId: wNovaThermal.id,
      supplierId: bright.id,
      issueDate: d(-8),
      amount: 12900,
      currency: 'USD',
      expectedDelivery: d(30),
      actualDelivery: '',
      status: 'Issued',
      supplierConfirmation: 'Confirmed',
      hardwareDelivery: 'Fabrication',
      deliveryStatus: 'Fabrication',
      remarks: 'Copper heat-exchanger machining underway.',
    },
    {
      ...base(),
      number: 'PO-4500645',
      projectId: lynx.id,
      workstreamId: wLynxPcb.id,
      supplierId: nova.id,
      issueDate: d(-140),
      amount: 9200,
      currency: 'USD',
      expectedDelivery: d(-50),
      actualDelivery: d(-52),
      status: 'Delivered',
      supplierConfirmation: 'Confirmed',
      hardwareDelivery: 'Delivered',
      deliveryStatus: 'Delivered',
      remarks: '',
    },
    {
      ...base(),
      number: 'PO-4500650',
      projectId: lynx.id,
      workstreamId: wLynxSock.id,
      supplierId: meridian.id,
      issueDate: d(-135),
      amount: 5800,
      currency: 'USD',
      expectedDelivery: d(-45),
      actualDelivery: d(-44),
      status: 'Delivered',
      supplierConfirmation: 'Confirmed',
      hardwareDelivery: 'Delivered',
      deliveryStatus: 'Delivered',
      remarks: '',
    },
  ]

  // ---------- Meetings & actions ----------
  const m1 = {
    ...base(),
    title: 'Falcon-X Weekly Hardware Sync',
    projectId: falcon.id,
    date: d(-3),
    participants: 'Me, Alex Chen, Daniel Tan (Nova)',
    summary: 'Reviewed load board layout status and fabrication timeline.',
    decisions: 'Proceed with Gerber release after schematic review sign-off.',
    remarks: '',
  }
  const m2 = {
    ...base(),
    title: 'Orion RF Laminate Recovery Call',
    projectId: orion.id,
    date: d(-1),
    participants: 'Me, Program Manager, Nova CAM team',
    summary: 'Discussed Megatron-6 material shortage and expedite plan.',
    decisions: 'Nova to provide revised fabrication schedule within 48 hours.',
    remarks: '',
  }
  const meetings = [m1, m2]
  const meetingActions = [
    { ...base(), meetingId: m1.id, action: 'Complete final load board Gerber review', assignee: 'Me', dueDate: d(0), status: 'Open', taskId: t3.id },
    { ...base(), meetingId: m1.id, action: 'Confirm coaxial pogo pin-map with Meridian', assignee: 'Me', dueDate: d(1), status: 'Open', taskId: t5.id },
    { ...base(), meetingId: m2.id, action: 'Chase revised RF PCB fabrication schedule', assignee: 'Nova', dueDate: d(-3), status: 'Open', taskId: t1.id },
  ]

  // ---------- Risks & Issues ----------
  const risks = [
    {
      ...base(),
      title: 'Megatron-6 RF laminate shortage delays PCB',
      projectId: orion.id,
      description: 'High-speed RF laminate has extended lead time.',
      probability: 'High',
      impact: 'High',
      level: 'High',
      mitigation: 'Qualify alternate Rogers 4350B core stack-up with Nova.',
      owner: 'Me',
      status: 'Open',
    },
    {
      ...base(),
      title: 'Pogo pin wear before 50k qualification touchdowns',
      projectId: falcon.id,
      description: 'Fine-pitch pins may wear early at high current.',
      probability: 'Medium',
      impact: 'Medium',
      level: 'Medium',
      mitigation: 'Order spare pogo pin set and run DOE A-001.',
      owner: 'Me',
      status: 'Mitigating',
    },
  ]
  const issues = [
    {
      ...base(),
      title: 'Impedance mismatch on 28GHz RF launch trace',
      projectId: orion.id,
      workstreamId: wOrionPcb.id,
      description: 'Simulated return loss is -11dB vs -15dB target.',
      rootCause: 'Via anti-pad diameter too small on L3-L6.',
      correctiveAction: 'Widen anti-pad and re-simulate 3D EM model.',
      responsible: 'Me',
      dateRaised: d(-12),
      targetDate: d(2),
      actualDate: '',
      status: 'In Progress',
    },
    {
      ...base(),
      title: 'Socket lid clearance clash with decoupling cap',
      projectId: falcon.id,
      workstreamId: wFalconSock.id,
      description: 'Socket latch touches C142 capacitor body.',
      rootCause: 'Component keep-out zone updated in rev 2 drawing.',
      correctiveAction: 'Shift C142 outward by 1.8 mm.',
      responsible: 'Me',
      dateRaised: d(-6),
      targetDate: d(1),
      actualDate: '',
      status: 'In Progress',
    },
  ]

  // ---------- 16 Activity Logs so "Recent Activities (Latest 15)" is fully populated ----------
  const sampleLogs = [
    { ...base(), entity: 'Deliverable', entityId: wFalconStiff.id, projectId: falcon.id, action: 'Status Changed' as const, message: '240101.Stiffener HW Status: In Delivery → Delivered', createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString() },
    { ...base(), entity: 'PO', entityId: wFalconSock.id, projectId: falcon.id, action: 'Status Changed' as const, message: 'PO-4500728 (240101.Socket) HW Status → In Delivery', createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
    { ...base(), entity: 'Task', entityId: t3.id, projectId: falcon.id, action: 'Updated' as const, message: 'Task "Complete final load board Gerber & drill review" progress → 90%', createdAt: new Date(Date.now() - 1000 * 60 * 95).toISOString() },
    { ...base(), entity: 'Project', entityId: orion.id, projectId: orion.id, action: 'Status Changed' as const, message: 'HRS 240102 (OR5G-200 RF) status: In Progress → Delayed', createdAt: new Date(Date.now() - 1000 * 60 * 160).toISOString() },
    { ...base(), entity: 'Task', entityId: t4.id, projectId: doeWork.id, action: 'Updated' as const, message: 'DOE A-001 task "Collect 25k insertion CRes data" progress → 70%', createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString() },
    { ...base(), entity: 'Commercial', entityId: wNovaThermal.id, projectId: novaAi.id, action: 'Updated' as const, message: 'PO-4500760 issued for 240104.Active Thermal Chuck (USD 12,900)', createdAt: new Date(Date.now() - 1000 * 60 * 320).toISOString() },
    { ...base(), entity: 'Milestone', entityId: falcon.id, projectId: falcon.id, action: 'Updated' as const, message: 'Milestone "Drawing Approval Cut-off" status → In Progress', createdAt: new Date(Date.now() - 1000 * 60 * 410).toISOString() },
    { ...base(), entity: 'Quotation', entityId: wAtlasProbeCard.id, projectId: atlas.id, action: 'Created' as const, message: 'Quotation Q-FFPS-8821 added for 240103.Probe Card', createdAt: new Date(Date.now() - 1000 * 60 * 520).toISOString() },
    { ...base(), entity: 'Task', entityId: t8.id, projectId: novaAi.id, action: 'Created' as const, message: 'Task "Run 3D EM simulation on SERDES differential pairs" created', createdAt: new Date(Date.now() - 1000 * 60 * 680).toISOString() },
    { ...base(), entity: 'Supplier', entityId: formfactor.id, projectId: '', action: 'Created' as const, message: 'Supplier "FormFactor Probe Systems" added with 2 contacts', createdAt: new Date(Date.now() - 1000 * 60 * 840).toISOString() },
    { ...base(), entity: 'PET', entityId: wOrionHandler.id, projectId: orion.id, action: 'Created' as const, message: 'PET-24-0151 approved for 240102.Handler Kit', createdAt: new Date(Date.now() - 1000 * 60 * 1100).toISOString() },
    { ...base(), entity: 'Project', entityId: webWork.id, projectId: webWork.id, action: 'Updated' as const, message: 'Non-NPI Work "Web Development A-002" progress → 50%', createdAt: new Date(Date.now() - 1000 * 60 * 1440).toISOString() },
    { ...base(), entity: 'PO', entityId: wFalconPcb.id, projectId: falcon.id, action: 'Created' as const, message: 'PO-4500711 issued to Nova Circuits for 240101.PCB', createdAt: new Date(Date.now() - 1000 * 60 * 1900).toISOString() },
    { ...base(), entity: 'Project', entityId: bmsQual.id, projectId: bmsQual.id, action: 'Status Changed' as const, message: 'HRS 240105 (BM480 BMS) status → On Hold', createdAt: new Date(Date.now() - 1000 * 60 * 2400).toISOString() },
    { ...base(), entity: 'Deliverable', entityId: wLynxSock.id, projectId: lynx.id, action: 'Status Changed' as const, message: '239804.Socket status: In Progress → Completed', createdAt: new Date(Date.now() - 1000 * 60 * 3000).toISOString() },
    { ...base(), entity: 'Project', entityId: falcon.id, projectId: falcon.id, action: 'Created' as const, message: 'HRS 240101 (FX7200 PMIC) created', createdAt: new Date(Date.now() - 1000 * 60 * 3600).toISOString() },
  ]

  await db.transaction('rw', db.tables, async () => {
    await db.suppliers.bulkPut(suppliers as never)
    await db.projects.bulkPut(projects as never)
    await db.workstreams.bulkPut(workstreams as never)
    await db.projectSuppliers.bulkPut(projectSuppliers as never)
    await db.tasks.bulkPut(tasks as never)
    await db.milestones.bulkPut(milestones as never)
    await db.quotations.bulkPut(quotations as never)
    await db.petRecords.bulkPut(petRecords as never)
    await db.poRecords.bulkPut(poRecords as never)
    await db.meetings.bulkPut(meetings as never)
    await db.meetingActions.bulkPut(meetingActions as never)
    await db.risks.bulkPut(risks as never)
    await db.issues.bulkPut(issues as never)
    await db.activityLogs.bulkPut(sampleLogs as never)
    await logActivity('Project', falcon.id, falcon.id, 'Updated', 'Sample NPI & Non-NPI dataset loaded', true)
  })
}

// Removes ONLY records flagged as sample. Records you created yourself stay.
// A user-created record that points at a sample project/supplier is cleaned up too, to avoid broken links.
export async function clearSampleData() {
  await db.transaction('rw', db.tables, async () => {
    const sampleProjectIds = (
      await db.projects
        .filter((p) => !!p.isSample || SAMPLE_PROJECT_CODES.includes(p.code))
        .primaryKeys()
    ) as string[]
    const sampleSupplierIds = (
      await db.suppliers
        .filter((s) => !!s.isSample || SAMPLE_SUPPLIER_NAMES.includes(s.name))
        .primaryKeys()
    ) as string[]

    await db.projects.bulkDelete(sampleProjectIds)
    await db.suppliers.bulkDelete(sampleSupplierIds)
    for (const t of db.tables) await t.filter((r) => !!r.isSample).delete()

    // Remove leftovers that referenced deleted sample projects / suppliers
    const projectTables = [
      db.workstreams,
      db.projectSuppliers,
      db.tasks,
      db.milestones,
      db.quotations,
      db.petRecords,
      db.prRecords,
      db.poRecords,
      db.meetings,
      db.risks,
      db.issues,
      db.activityLogs,
    ]
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
