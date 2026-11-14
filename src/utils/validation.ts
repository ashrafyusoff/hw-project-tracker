// Shared validation helpers. Services throw ValidationError; forms show its message.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function requireText(value: string, label: string) {
  if (!value || !value.trim()) throw new ValidationError(`${label} is required.`)
}

export function checkDateOrder(start: string, end: string, startLabel: string, endLabel: string) {
  if (start && end && end < start) throw new ValidationError(`${endLabel} cannot be before ${startLabel}.`)
}

export function checkEmail(email: string) {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('Email address is not valid.')
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'ConstraintError') return 'This record already exists (duplicate value).'
    return e.message
  }
  return 'Something went wrong.'
}
