import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import type { Issue, Project, Risk, Workstream } from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loading, Select } from '@/components/ui'
import { ISSUE_STATUSES, IssueForm, LEVELS, RISK_STATUSES, RiskForm } from '@/features/risks/RiskIssueForms'
import { deleteIssue, deleteRisk } from '@/services/riskIssueService'
import { formatDate, isPast } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

export const levelColor = (l: string) => (l === 'High' ? 'red' : l === 'Medium' ? 'amber' : 'green')
export const isIssueOpen = (i: Issue) => i.status !== 'Resolved' && i.status !== 'Closed'
export const isIssueOverdue = (i: Issue) => isIssueOpen(i) && !!i.targetDate && isPast(i.targetDate)

export function RisksIssuesPage() {
  const risks = useTable<Risk>('risks')
  const issues = useTable<Issue>('issues')
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')
  const [params, setParams] = useSearchParams()

  const [tab, setTab] = useState<'risks' | 'issues'>('risks')
  const [search, setSearch] = useState('')
  const [fProject, setFProject] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fLevel, setFLevel] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(false)

  const [rOpen, setROpen] = useState(false)
  const [rEdit, setREdit] = useState<Risk | undefined>()
  const [rDel, setRDel] = useState<Risk | undefined>()

  const [iOpen, setIOpen] = useState(false)
  const [iEdit, setIEdit] = useState<Issue | undefined>()
  const [iDel, setIDel] = useState<Issue | undefined>()
  const [error, setError] = useState('')

  useEffect(() => {
    const n = params.get('new')
    if (n === 'risk') { setTab('risks'); setREdit(undefined); setROpen(true); setParams({}, { replace: true }) }
    if (n === 'issue') { setTab('issues'); setIEdit(undefined); setIOpen(true); setParams({}, { replace: true }) }
  }, [params, setParams])

  const q = search.trim().toLowerCase()
  const fRisks = useMemo(() =>
    (risks ?? [])
      .filter((r) => !fProject || r.projectId === fProject)
      .filter((r) => !fStatus || r.status === fStatus)
      .filter((r) => !fLevel || r.level === fLevel)
      .filter((r) => !q || `${r.title} ${r.description} ${r.mitigation} ${r.owner}`.toLowerCase().includes(q)),
  [risks, fProject, fStatus, fLevel, q])

  const fIssues = useMemo(() =>
    (issues ?? [])
      .filter((i) => !fProject || i.projectId === fProject)
      .filter((i) => !fStatus || i.status === fStatus)
      .filter((i) => !onlyOverdue || isIssueOverdue(i))
      .filter((i) => !q || `${i.title} ${i.description} ${i.rootCause} ${i.correctiveAction} ${i.responsible}`.toLowerCase().includes(q)),
  [issues, fProject, fStatus, onlyOverdue, q])

  if (!risks || !issues || !projects || !workstreams) return <Loading />

  const proj = (id: string) => projects.find((p) => p.id === id)?.code ?? '—'
  const ws = (id: string) => workstreams.find((w) => w.id === id)?.name ?? '—'
  const openIssues = issues.filter(isIssueOpen).length
  const overdueIssues = issues.filter(isIssueOverdue).length
  const highRisks = risks.filter((r) => r.level === 'High' && r.status !== 'Closed').length

  const switchTab = (t: 'risks' | 'issues') => { setTab(t); setFStatus(''); setFLevel(''); setOnlyOverdue(false) }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
        <div className="flex gap-1">
          <button onClick={() => switchTab('risks')}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === 'risks' ? 'border-primary text-primary font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            Risk Tracker <span className="ml-1 text-xs text-slate-400">{risks.length}</span>
          </button>
          <button onClick={() => switchTab('issues')}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === 'issues' ? 'border-primary text-primary font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            Engineering Issue Tracker <span className="ml-1 text-xs text-slate-400">{issues.length}</span>
          </button>
        </div>
        <div className="flex gap-2 text-xs pb-1">
          <Badge color={highRisks > 0 ? 'red' : 'grey'}>High Risks: {highRisks}</Badge>
          <Badge color="blue">Open Issues: {openIssues}</Badge>
          {overdueIssues > 0 && <Badge color="red">Overdue Issues: {overdueIssues}</Badge>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={tab === 'risks' ? 'Search risks, mitigation, owner…' : 'Search issues, root cause, action…'} value={search} onChange={(e) => setSearch(e.target.value)} className="!w-64" />
        <Select className="!w-40" value={fProject} onChange={(e) => setFProject(e.target.value)}
          options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.code }))]} />
        <Select className="!w-40" value={fStatus} onChange={(e) => setFStatus(e.target.value)}
          options={[{ value: '', label: 'All statuses' }, ...(tab === 'risks' ? RISK_STATUSES : ISSUE_STATUSES)]} />
        {tab === 'risks' ? (
          <Select className="!w-40" value={fLevel} onChange={(e) => setFLevel(e.target.value)}
            options={[{ value: '', label: 'All risk levels' }, ...LEVELS]} />
        ) : (
          <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> Overdue only</label>
        )}
        <Button variant="primary" className="ml-auto" onClick={() => tab === 'risks' ? (setREdit(undefined), setROpen(true)) : (setIEdit(undefined), setIOpen(true))}>
          <Plus className="h-4 w-4" /> {tab === 'risks' ? 'Add Risk' : 'Add Issue'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card className="!p-0">
        {tab === 'risks' ? (
          fRisks.length === 0 ? <EmptyState title="No risks found" hint="Identify and mitigate project schedule, technical, or supply risks." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 text-left bg-slate-50">
                  <tr>{['Risk Title', 'Project', 'Probability', 'Impact', 'Risk Level', 'Mitigation Plan', 'Owner', 'Status', ''].map((h, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {fRisks.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5"><p className="font-medium">{r.title}</p>{r.description && <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{r.description}</p>}</td>
                      <td className="px-3 font-medium text-primary whitespace-nowrap">{proj(r.projectId)}</td>
                      <td className="px-3"><Badge color={levelColor(r.probability)}>{r.probability}</Badge></td>
                      <td className="px-3"><Badge color={levelColor(r.impact)}>{r.impact}</Badge></td>
                      <td className="px-3"><Badge color={levelColor(r.level)}>{r.level} Risk</Badge></td>
                      <td className="px-3 text-slate-600 max-w-xs">{r.mitigation || '—'}</td>
                      <td className="px-3">{r.owner || '—'}</td>
                      <td className="px-3"><Badge color={r.status === 'Closed' ? 'green' : r.status === 'Mitigating' ? 'blue' : 'amber'}>{r.status}</Badge></td>
                      <td className="px-3"><div className="flex gap-1">
                        <Button variant="ghost" size="sm" aria-label="Edit risk" onClick={() => { setREdit(r); setROpen(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" aria-label="Delete risk" onClick={() => setRDel(r)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : fIssues.length === 0 ? (
          <EmptyState title="No engineering issues found" hint="Log hardware bugs, clearance clashes, impedance mismatches, and their corrective actions." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 text-left bg-slate-50">
                <tr>{['Issue Title', 'Project', 'Workstream', 'Root Cause & Corrective Action', 'Responsible', 'Raised', 'Target', 'Resolved', 'Status', ''].map((h, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {fIssues.map((i) => {
                  const late = isIssueOverdue(i)
                  return (
                    <tr key={i.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5"><p className="font-medium">{i.title}</p>{i.description && <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{i.description}</p>}</td>
                      <td className="px-3 font-medium text-primary whitespace-nowrap">{proj(i.projectId)}</td>
                      <td className="px-3 text-slate-500">{ws(i.workstreamId)}</td>
                      <td className="px-3 text-xs max-w-xs">
                        {i.rootCause && <p><span className="font-medium text-slate-600">Cause:</span> {i.rootCause}</p>}
                        {i.correctiveAction && <p className="mt-0.5"><span className="font-medium text-slate-600">Action:</span> {i.correctiveAction}</p>}
                        {!i.rootCause && !i.correctiveAction && '—'}
                      </td>
                      <td className="px-3">{i.responsible || '—'}</td>
                      <td className="px-3 whitespace-nowrap">{formatDate(i.dateRaised)}</td>
                      <td className={`px-3 whitespace-nowrap ${late ? 'text-red-600 font-medium' : ''}`}>{formatDate(i.targetDate)}</td>
                      <td className="px-3 whitespace-nowrap">{formatDate(i.actualDate)}</td>
                      <td className="px-3"><Badge color={late ? 'red' : !isIssueOpen(i) ? 'green' : 'blue'}>{late ? 'Overdue' : i.status}</Badge></td>
                      <td className="px-3"><div className="flex gap-1">
                        <Button variant="ghost" size="sm" aria-label="Edit issue" onClick={() => { setIEdit(i); setIOpen(true) }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" aria-label="Delete issue" onClick={() => setIDel(i)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                      </div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RiskForm open={rOpen} record={rEdit} defaultProjectId={fProject} onClose={() => setROpen(false)} />
      <IssueForm open={iOpen} record={iEdit} defaultProjectId={fProject} onClose={() => setIOpen(false)} />

      <ConfirmDialog open={!!rDel} title="Delete risk?" onCancel={() => setRDel(undefined)}
        onConfirm={async () => { try { await deleteRisk(rDel!.id) } catch (e) { setError(errorMessage(e)) } setRDel(undefined) }}
        message={<>Delete risk <b>{rDel?.title}</b>?</>} />
      <ConfirmDialog open={!!iDel} title="Delete engineering issue?" onCancel={() => setIDel(undefined)}
        onConfirm={async () => { try { await deleteIssue(iDel!.id) } catch (e) { setError(errorMessage(e)) } setIDel(undefined) }}
        message={<>Delete engineering issue <b>{iDel?.title}</b>?</>} />
    </div>
  )
}
