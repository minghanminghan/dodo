import { DodoError, hash, loadIndex, openDb } from '@/core'
import type { Db, DocIndex, ErrorCode } from '@/core'

export type State = { db: Db; index: DocIndex; rev: string }

declare global {
  // eslint-disable-next-line no-var
  var __dodo: State | undefined
}

export function getState(): State {
  if (!globalThis.__dodo) {
    const db = openDb()
    const index = loadIndex(db)
    globalThis.__dodo = { db, index, rev: hash(JSON.stringify(index)) }
  }
  return globalThis.__dodo
}

export function refresh(state: State): void {
  state.index = loadIndex(state.db)
  state.rev = hash(JSON.stringify(state.index))
}

const STATUS: Record<ErrorCode, number> = { usage: 400, not_found: 404, conflict: 409, invalid: 422, version: 426, unavailable: 503 }

export function errorResponse(err: unknown): Response {
  if (err instanceof DodoError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: STATUS[err.code] })
  }
  const message = err instanceof Error ? err.message : String(err)
  return Response.json({ error: { code: 'internal', message } }, { status: 500 })
}

export function pathParam(req: Request): string {
  const p = new URL(req.url).searchParams.get('path')
  if (!p) throw new DodoError('usage', 'missing ?path=')
  return p
}
