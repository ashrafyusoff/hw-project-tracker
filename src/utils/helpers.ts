// Small helper functions used across the app.

export const newId = () => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()
export const todayStr = () => new Date().toISOString().slice(0, 10)

/** Date `n` days from today, as YYYY-MM-DD. Used by sample data so it always looks current. */
export function daysFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function formatDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(s: string): string {
  return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** True if a YYYY-MM-DD date is before today. */
export const isPast = (s?: string) => !!s && s < todayStr()

export function daysUntil(s: string): number {
  const a = new Date(todayStr()).getTime()
  const b = new Date(s).getTime()
  return Math.round((b - a) / 86400000)
}

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export const clampProgress = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))
