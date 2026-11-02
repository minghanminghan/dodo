export type ErrorCode = 'usage' | 'not_found' | 'conflict' | 'invalid' | 'version' | 'unavailable'

export class DodoError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DodoError'
  }
}

export const EXIT: Record<ErrorCode, number> = {
  usage: 1,
  not_found: 2,
  conflict: 3,
  invalid: 4,
  version: 5,
  unavailable: 6,
}
