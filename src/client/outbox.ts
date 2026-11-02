import { get, set } from 'idb-keyval'
import type { SaveResult } from '@/core'
import { ApiError } from './api'
import { storageKey } from './env'

export type OutboxEntry = {
  clientId: string
  kind: 'create' | 'write'
  path: string
  body: string
  baseHash?: string
  projects?: string[]
  createdAt: number
  error?: string
}

export type OutboxDeps = { send(e: OutboxEntry, signal: AbortSignal): Promise<SaveResult> }

export const SEND_TIMEOUT_MS = 8000

const KEY = () => storageKey('outbox')

// One entry per path: a later edit replaces the body and keeps the first base hash, so the
// server still sees what the doc was when editing started.
export function queueEdit(entries: OutboxEntry[], next: Omit<OutboxEntry, 'clientId' | 'createdAt'>): OutboxEntry[] {
  const i = entries.findIndex((e) => e.path === next.path)
  if (i === -1) return [...entries, { ...next, clientId: crypto.randomUUID(), createdAt: Date.now() }]
  return entries.map((e, j) => (j === i ? { ...e, body: next.body, error: undefined } : e))
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError) return false
  return err instanceof TypeError || (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const aborted = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new DOMException('Timed out', 'TimeoutError'))
    }, ms)
  })
  try {
    return await Promise.race([run(controller.signal), aborted])
  } finally {
    clearTimeout(timer)
  }
}

export async function flushEntry(e: OutboxEntry, deps: OutboxDeps): Promise<{ entry: OutboxEntry | null; result?: SaveResult }> {
  try {
    const result = await withTimeout(SEND_TIMEOUT_MS, (signal) => deps.send(e, signal))
    return { entry: null, result }
  } catch (err) {
    return { entry: isNetworkError(err) ? e : { ...e, error: err instanceof Error ? err.message : String(err) } }
  }
}

export async function loadOutbox(): Promise<OutboxEntry[]> {
  try {
    return (await get<OutboxEntry[]>(KEY())) ?? []
  } catch {
    return []
  }
}

export async function saveOutbox(entries: OutboxEntry[]): Promise<void> {
  try {
    await set(KEY(), entries)
  } catch {}
}
