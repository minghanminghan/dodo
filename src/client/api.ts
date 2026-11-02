import type { Doc, DocIndex, ErrorCode, FileMeta, Hit, SaveResult } from '@/core'
import { VERSION, VERSION_HEADER } from '@/core/version'

export class ApiError extends Error {
  code: ErrorCode | 'internal'
  constructor(code: ErrorCode | 'internal', message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.error?.code ?? 'internal', body?.error?.message ?? res.statusText)
  }
  return res.json() as Promise<T>
}

const HEADERS = { [VERSION_HEADER]: VERSION }
const JSON_HEADERS = { ...HEADERS, 'Content-Type': 'application/json' }
const q = (path: string) => `?path=${encodeURIComponent(path)}`
const send = <T>(url: string, method: string, data: unknown, signal?: AbortSignal) =>
  fetch(url, { method, headers: JSON_HEADERS, body: JSON.stringify(data), signal }).then((res) => handle<T>(res))

export type IndexWithRev = DocIndex & { rev: string }

// null when the server answered 304 (the index has not changed since `rev`).
export async function fetchIndex(rev?: string): Promise<IndexWithRev | null> {
  const res = await fetch('/api/docs', { headers: rev ? { ...HEADERS, 'If-None-Match': `"${rev}"` } : HEADERS })
  return res.status === 304 ? null : handle<IndexWithRev>(res)
}

export function createDoc(
  input: { path: string; body: string; projects?: string[]; clientId?: string; onConflict?: 'copy' },
  signal?: AbortSignal,
): Promise<SaveResult> {
  return send('/api/docs', 'POST', input, signal)
}

export function writeDoc(
  path: string,
  input: { body: string; baseHash: string; clientId?: string; onConflict?: 'copy' },
  signal?: AbortSignal,
): Promise<SaveResult> {
  return send(`/api/doc${q(path)}`, 'PUT', input, signal)
}

export function moveDoc(path: string, moveTo: string): Promise<{ paths: string[] }> {
  return send(`/api/doc${q(path)}`, 'PATCH', { moveTo })
}

export function setProjects(path: string, projects: string[]): Promise<Doc> {
  return send(`/api/doc${q(path)}`, 'PATCH', { projects })
}

export function deleteDoc(path: string): Promise<{ ok: true }> {
  return fetch(`/api/doc${q(path)}`, { method: 'DELETE', headers: HEADERS }).then((res) => handle<{ ok: true }>(res))
}

export function search(query: string, project?: string, signal?: AbortSignal): Promise<Hit[]> {
  const params = new URLSearchParams({ q: query })
  if (project) params.set('project', project)
  return fetch(`/api/search?${params}`, { headers: HEADERS, signal }).then((res) => handle<Hit[]>(res))
}

export function uploadFile(path: string, file: File): Promise<FileMeta & { markdown: string }> {
  const form = new FormData()
  form.append('file', file)
  return fetch(`/api/files${q(path)}`, { method: 'POST', headers: HEADERS, body: form }).then((res) =>
    handle<FileMeta & { markdown: string }>(res),
  )
}
