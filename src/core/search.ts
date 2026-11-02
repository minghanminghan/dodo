import Fuse from 'fuse.js'
import type { Db } from './db'
import { normalizeProject, titleOf } from './paths'
import type { DocIndex } from './types'

export type Hit = { path: string; title: string; snippet?: string }

// Fuzzy over paths and titles, then FTS5 trigram over bodies (3+ chars), deduped by path.
export function searchDocs(db: Db, index: DocIndex, q: string, opts: { project?: string; limit?: number } = {}): Hit[] {
  const query = q.trim()
  if (!query) return []
  const limit = opts.limit ?? 20
  const project = opts.project ? normalizeProject(opts.project) : undefined
  const docs = project ? index.docs.filter((d) => d.projects.includes(project)) : index.docs
  const hits: Hit[] = new Fuse(docs, { keys: ['path', 'title'], threshold: 0.4 })
    .search(query)
    .map(({ item }) => ({ path: item.path, title: item.title }))
  if (query.length >= 3) {
    const rows = db
      .prepare(
        `SELECT d.path, d.body, snippet(docs_fts, 1, '', '', '…', 12) AS snippet
         FROM docs_fts JOIN docs d ON d.id = docs_fts.rowid
         WHERE docs_fts MATCH ? AND d.deleted_at IS NULL
         ${project ? 'AND EXISTS (SELECT 1 FROM doc_projects p WHERE p.doc_id = d.id AND p.project = ?)' : ''}
         ORDER BY rank LIMIT ?`,
      )
      .all(`"${query.replaceAll('"', '""')}"`, ...(project ? [project] : []), limit) as { path: string; body: string; snippet: string }[]
    const seen = new Set(hits.map((h) => h.path))
    for (const r of rows) if (!seen.has(r.path)) hits.push({ path: r.path, title: titleOf(r.path, r.body), snippet: r.snippet })
  }
  return hits.slice(0, limit)
}
