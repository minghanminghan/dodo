import fs from 'node:fs'
import path from 'node:path'
import { connect } from '../core/db'
import type { Db } from '../core/db'

// Nightly job (dodo-backup.service): back up the DB, prune old backups, delete orphan files.
// `node dist/backup.js --backup-only` only makes the backup; deploys run it before migrating.
const KEEP_DAYS = 7
const KEEP_NEWEST = 3

const dbFile = process.env.DODO_DB ?? '/var/lib/dodo/dodo.db'
const backupDir = process.env.DODO_BACKUPS ?? '/var/backups/dodo'
const filesDir = process.env.DODO_FILES ?? path.join(path.dirname(dbFile), 'files')
const cutoff = Date.now() - KEEP_DAYS * 86_400_000
const mtime = (file: string) => fs.statSync(file).mtimeMs

// VACUUM INTO reads one snapshot, so the copy is consistent while the server writes in WAL mode.
function backup(db: Db): string {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '')
  const out = path.join(backupDir, `dodo-${stamp}.db`)
  const tmp = `${out}.tmp`
  fs.mkdirSync(backupDir, { recursive: true })
  fs.rmSync(tmp, { force: true })
  db.prepare('VACUUM INTO ?').run(tmp)
  const fd = fs.openSync(tmp, 'r')
  fs.fsyncSync(fd)
  fs.closeSync(fd)
  fs.renameSync(tmp, out)
  return out
}

function pruneBackups(): number {
  const old = fs
    .readdirSync(backupDir)
    .filter((f) => /^dodo-.*\.db$/.test(f))
    .map((f) => path.join(backupDir, f))
    .sort((a, b) => mtime(b) - mtime(a))
    .slice(KEEP_NEWEST)
    .filter((f) => mtime(f) < cutoff)
  for (const f of old) fs.rmSync(f)
  return old.length
}

function pruneFiles(db: Db): number {
  if (!fs.existsSync(filesDir)) return 0
  const ids = new Set((db.prepare('SELECT id FROM files').all() as { id: string }[]).map((r) => r.id))
  const orphans = fs
    .readdirSync(filesDir, { withFileTypes: true })
    .filter((e) => e.isFile() && !ids.has(e.name))
    .map((e) => path.join(filesDir, e.name))
    .filter((f) => mtime(f) < cutoff)
  for (const f of orphans) fs.rmSync(f)
  return orphans.length
}

try {
  if (!fs.existsSync(dbFile)) throw new Error(`${dbFile} does not exist`)
  const db = connect(dbFile)
  console.log(`backup: ${backup(db)}`)
  if (!process.argv.includes('--backup-only')) {
    console.log(`pruned ${pruneBackups()} old backups from ${backupDir}`)
    console.log(`removed ${pruneFiles(db)} orphan files from ${filesDir}`)
  }
  db.close()
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
