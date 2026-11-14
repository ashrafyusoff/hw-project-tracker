import { Construction } from 'lucide-react'
import { Card } from '@/components/ui'

// Shown for sections that arrive in a later phase. No fake buttons — just a clear note.
export function ComingSoon({ title, phase, items }: { title: string; phase: number; items: string[] }) {
  return (
    <Card>
      <div className="flex flex-col items-center py-12 text-center">
        <Construction className="h-9 w-9 text-slate-300 mb-3" />
        <h2 className="text-lg font-semibold">{title} — coming in Phase {phase}</h2>
        <p className="text-sm text-slate-500 mt-1">This section will include:</p>
        <ul className="text-sm text-slate-600 mt-2 space-y-1">{items.map((i) => <li key={i}>• {i}</li>)}</ul>
        <p className="text-xs text-slate-400 mt-4">Sample data for this area already exists and appears on the Overview and in project details.</p>
      </div>
    </Card>
  )
}
