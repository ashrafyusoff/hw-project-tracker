import { Loader2, Inbox, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/utils/helpers'

// ---------- Button ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-primary border border-primary text-white hover:bg-primary-hover shadow-sm',
  secondary: 'liquid-glass-pill text-slate-700 hover:bg-slate-200/60 shadow-sm',
  ghost: 'border border-transparent text-slate-600 hover:bg-slate-200/50',
  danger: 'bg-red-600 border border-red-600 text-white hover:bg-red-700 shadow-sm',
}
export function Button({ variant = 'secondary', size = 'md', className, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-semibold leading-none whitespace-nowrap transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3.5 text-xs' : 'h-8 px-3.5 text-xs',
        variants[variant], className,
      )}
    />
  )
}

// ---------- Badge ----------
const badgeColors: Record<string, string> = {
  grey: 'bg-slate-100 text-slate-600', blue: 'bg-blue-50 text-blue-700', green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', violet: 'bg-violet-50 text-violet-700',
}
const statusColor: Record<string, string> = {
  Planning: 'violet', 'In Progress': 'blue', 'On Hold': 'amber', Delayed: 'red', Completed: 'green', Cancelled: 'grey',
  'Not Started': 'grey', Low: 'grey', Medium: 'blue', High: 'amber', Critical: 'red',
}
export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  const key = color ?? statusColor[String(children)] ?? 'grey'
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', badgeColors[key])}>{children}</span>
}

// ---------- Progress bar ----------
export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{value}%</span>
    </div>
  )
}

// ---------- Card ----------
export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl liquid-glass overflow-hidden', className)}>
      {title && (
        <header className="flex items-center justify-between px-3.5 py-2.5 liquid-card-header">
          <h2 className="text-sm font-semibold text-slate-800 tracking-tight">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  )
}

// ---------- States ----------
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Inbox className="h-8 w-8 text-slate-300 mb-2" />
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="text-xs text-slate-400 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
export function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
    </div>
  )
}

// ---------- Form fields ----------
const inputCls = 'w-full h-8 rounded-full border border-slate-200/90 bg-white/90 px-3.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow'
const textareaCls = 'w-full rounded-2xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow'
export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  )
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(inputCls, p.className)} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cn(textareaCls, p.className)} />
export function Select({ options, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: readonly (string | { value: string; label: string })[] }) {
  return (
    <select {...p} className={cn(inputCls, p.className)}>
      {options.map((o) => {
        const v = typeof o === 'string' ? { value: o, label: o } : o
        return <option key={v.value} value={v.value}>{v.label}</option>
      })}
    </select>
  )
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/30 z-40" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn('fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-h-[90vh] overflow-y-auto rounded-2xl liquid-glass', wide ? 'max-w-3xl' : 'max-w-md')}
        >
          <div className="flex items-center justify-between px-5 py-3.5 liquid-card-header sticky top-0 z-10">
            <Dialog.Title className="text-base font-semibold tracking-tight text-slate-900">{title}</Dialog.Title>
            <Dialog.Close className="p-1 rounded-lg hover:bg-slate-200/60" aria-label="Close"><X className="h-4 w-4" /></Dialog.Close>
          </div>
          <div className="p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }:
  { open: boolean; title: string; message: ReactNode; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="text-sm text-slate-600">{message}</div>
      <div className="flex justify-end gap-2 mt-5">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}

export function FormError({ message }: { message: string }) {
  return message ? <p className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{message}</p> : null
}
