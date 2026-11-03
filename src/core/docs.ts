import { tx } from './db'
import type { Db } from './db'
import { DodoError } from './errors'
import { hash } from './format'
import { loadFiles } from './files'
import { normalizePath, normalizeProject, titleOf } from './paths'
import type { Doc, DocIndex, FileMeta } from './types'

export type SaveResult = { doc: Doc; conflictOf?: string }
type Row = { id: number; path: string; body: string; created: string; updated: string; projects: string | null }

export const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

const SELECT = `SELECT d.id, d.path, d.body, d.created, d.updated,
  (SELECT group_concat(project, ',') FROM (SELECT project FROM doc_projects WHERE doc_id = d.id ORDER BY project)) AS projects
  FROM docs d WHERE d.deleted_at IS NULL`

function toDoc(r: Row, files: FileMeta[] = []): Doc {
  return {
    path: r.path,
    title: titleOf(r.path, r.body),
    body: r.body,
    projects: r.projects ? r.projects.split(',') : [],
    created: r.created,
    updated: r.updated,
    bodyHash: hash(r.body),
    files,
  }
}

function findRow(db: Db, path: string): Row | undefined {
  return db.prepare(`${SELECT} AND d.path = ?`).get(path) as Row | undefined
}

export function readDoc(db: Db, path: string): Doc {
  const p = normalizePath(path)
  const row = findRow(db, p)
  if (!row) throw new DodoError('not_found', `doc ${p} not found`)
  return toDoc(row, loadFiles(db, row.id).get(row.id))
}

export function loadIndex(db: Db): DocIndex {
  const files = loadFiles(db)
  return { docs: (db.prepare(`${SELECT} ORDER BY d.path`).all() as Row[]).map((r) => toDoc(r, files.get(r.id))) }
}

function normalizeProjects(projects: string[]): string[] {
  return [...new Set(projects.map(normalizeProject))].sort()
}

function insert(db: Db, path: string, body: string, projects: string[], clientId?: string): Doc {
  const t = now()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO docs (path, body, created, updated, client_id) VALUES (?, ?, ?, ?, ?)')
    .run(path, body, t, t, clientId ?? null)
  const add = db.prepare('INSERT INTO doc_projects (doc_id, project) VALUES (?, ?)')
  for (const p of projects) add.run(lastInsertRowid, p)
  return readDoc(db, path)
}

function byClientId(db: Db, clientId: string | undefined, path: string): SaveResult | undefined {
  if (!clientId) return
  const row = db.prepare('SELECT path, deleted_at FROM docs WHERE client_id = ?').get(clientId) as
    | { path: string; deleted_at: string | null }
    | undefined
  if (!row) return
  if (row.deleted_at) throw new DodoError('not_found', `doc ${row.path} not found`)
  const doc = readDoc(db, row.path)
  return doc.path === path ? { doc } : { doc, conflictOf: path }
}

function saveCopy(db: Db, path: string, body: string, projects: string[], clientId?: string): SaveResult {
  let n = 1
  while (findRow(db, `${path}.conflict-${n}`)) n++
  return { doc: insert(db, `${path}.conflict-${n}`, body, projects, clientId), conflictOf: path }
}

export function createDoc(
  db: Db,
  input: { path: string; body: string; projects?: string[]; clientId?: string; onConflict?: 'copy' },
): SaveResult {
  const path = normalizePath(input.path)
  const projects = normalizeProjects(input.projects ?? [])
  return tx(db, () => {
    const prior = byClientId(db, input.clientId, path)
    if (prior) return prior
    if (!findRow(db, path)) return { doc: insert(db, path, input.body, projects, input.clientId) }
    if (input.onConflict !== 'copy') throw new DodoError('conflict', `doc ${path} already exists`)
    return saveCopy(db, path, input.body, projects, input.clientId)
  })
}

export function writeDoc(
  db: Db,
  path: string,
  input: { body: string; baseHash: string; clientId?: string; onConflict?: 'copy' },
): SaveResult {
  const p = normalizePath(path)
  return tx(db, () => {
    const current = readDoc(db, p)
    if (current.bodyHash === hash(input.body)) return { doc: current }
    const last = db.prepare('SELECT write_client_id AS id FROM docs WHERE path = ? AND deleted_at IS NULL').get(p) as { id: string | null }
    // A retry of a write that landed (its response lost) may carry a newer body; it is not a conflict.
    if (input.baseHash === current.bodyHash || (input.clientId && last.id === input.clientId)) {
      db.prepare('UPDATE docs SET body = ?, updated = ?, write_client_id = ? WHERE path = ? AND deleted_at IS NULL').run(
        input.body,
        now(),
        input.clientId ?? null,
        p,
      )
      return { doc: readDoc(db, p) }
    }
    if (input.onConflict !== 'copy') throw new DodoError('conflict', `doc ${p} changed since it was read`)
    return byClientId(db, input.clientId, p) ?? saveCopy(db, p, input.body, current.projects, input.clientId)
  })
}

export function movePath(db: Db, from: string, to: string): string[] {
  const src = normalizePath(from)
  const dst = normalizePath(to)
  if (dst === src || dst.startsWith(src + '/')) throw new DodoError('usage', `cannot move ${src} into itself`)
  return tx(db, () => {
    const rows = db.prepare('SELECT id, path FROM docs WHERE deleted_at IS NULL').all() as { id: number; path: string }[]
    const moving = rows.filter((r) => r.path === src || r.path.startsWith(src + '/'))
    if (!moving.length) throw new DodoError('not_found', `nothing at ${src}`)
    const targets = moving.map((r) => ({ id: r.id, path: normalizePath(dst + r.path.slice(src.length)) }))
    const staying = new Set(rows.filter((r) => !moving.includes(r)).map((r) => r.path))
    const taken = targets.find((t) => staying.has(t.path))
    if (taken) throw new DodoError('conflict', `doc ${taken.path} already exists`)
    const set = db.prepare('UPDATE docs SET path = ?, updated = ? WHERE id = ?')
    const t = now()
    // Two passes so a target that is also a source path never trips the unique index mid-move.
    for (const m of targets) set.run(`\0${m.id}`, t, m.id)
    for (const m of targets) set.run(m.path, t, m.id)
    return targets.map((m) => m.path)
  })
}

export function deleteDoc(db: Db, path: string): void {
  const p = normalizePath(path)
  tx(db, () => {
    readDoc(db, p)
    db.prepare('UPDATE docs SET deleted_at = ? WHERE path = ? AND deleted_at IS NULL').run(now(), p)
  })
}

export function setProjects(db: Db, path: string, projects: string[]): Doc {
  const p = normalizePath(path)
  const keys = normalizeProjects(projects)
  return tx(db, () => {
    const id = findRow(db, p)?.id
    if (id === undefined) throw new DodoError('not_found', `doc ${p} not found`)
    db.prepare('DELETE FROM doc_projects WHERE doc_id = ?').run(id)
    const add = db.prepare('INSERT INTO doc_projects (doc_id, project) VALUES (?, ?)')
    for (const k of keys) add.run(id, k)
    db.prepare('UPDATE docs SET updated = ? WHERE id = ?').run(now(), id)
    return readDoc(db, p)
  })
}
