import { DodoError } from './errors'

const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/
const PROJECT = /^[A-Z][A-Z0-9]{0,5}$/

export function normalizePath(input: string): string {
  const p = input.trim().toLowerCase().replace(/^\/+|\/+$/g, '').replace(/\.md$/, '')
  const parts = p.split('/')
  if (parts.length > 8 || !parts.every((s) => SEGMENT.test(s) && s !== '.' && s !== '..')) {
    throw new DodoError('usage', 'path must look like deploy/mini-pc')
  }
  return p
}

export function normalizeProject(input: string): string {
  const key = input.trim().toUpperCase()
  if (!PROJECT.test(key)) throw new DodoError('usage', 'project key must be 1-6 letters or digits, starting with a letter')
  return key
}

export function titleOf(path: string, body: string): string {
  return body.match(/^#\s+(.+)$/m)?.[1].trim() ?? path.split('/').pop()!
}
