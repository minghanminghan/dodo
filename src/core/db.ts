import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DodoError } from './errors'

export type Db = DatabaseSync

// Migration N is MIGRATIONS[N - 1]. PRAGMA user_version holds the last one applied. Append only.
export const MIGRATIONS: (string | ((db: Db) => void))[] = [
  `
  CREATE TABLE docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL,
    updated TEXT NOT NULL,
    client_id TEXT,
    deleted_at TEXT
  );
  CREATE UNIQUE INDEX docs_path ON docs (path) WHERE deleted_at IS NULL;
  CREATE UNIQUE INDEX docs_client_id ON docs (client_id) WHERE client_id IS NOT NULL;
  CREATE TABLE doc_projects (doc_id INTEGER NOT NULL REFERENCES docs(id), project TEXT NOT NULL, PRIMARY KEY (doc_id, project));
  CREATE TABLE files (id TEXT PRIMARY KEY, doc_id INTEGER NOT NULL REFERENCES docs(id), filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created TEXT NOT NULL);
  CREATE INDEX files_doc ON files (doc_id);
  CREATE VIRTUAL TABLE docs_fts USING fts5(path, body, content='docs', content_rowid='id', tokenize='trigram');
  CREATE TRIGGER docs_ai AFTER INSERT ON docs BEGIN
    INSERT INTO docs_fts (rowid, path, body) VALUES (new.id, new.path, new.body);
  END;
  CREATE TRIGGER docs_ad AFTER DELETE ON docs BEGIN
    INSERT INTO docs_fts (docs_fts, rowid, path, body) VALUES ('delete', old.id, old.path, old.body);
  END;
  CREATE TRIGGER docs_au AFTER UPDATE ON docs BEGIN
    INSERT INTO docs_fts (docs_fts, rowid, path, body) VALUES ('delete', old.id, old.path, old.body);
    INSERT INTO docs_fts (rowid, path, body) VALUES (new.id, new.path, new.body);
  END;
  `,
]

export function dbPath(): string {
  return process.env.DODO_DB ?? path.join(os.homedir(), '.dodo', 'dodo.db')
}

export function migrate(db: Db): { from: number; to: number } {
  const from = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  if (from > MIGRATIONS.length) {
    throw new DodoError('invalid', `database is at migration ${from}, this build only knows ${MIGRATIONS.length}`)
  }
  for (let v = from + 1; v <= MIGRATIONS.length; v++) {
    tx(db, () => {
      const m = MIGRATIONS[v - 1]
      if (typeof m === 'string') db.exec(m)
      else m(db)
      db.exec(`PRAGMA user_version = ${v}`)
    })
  }
  return { from, to: MIGRATIONS.length }
}

export function connect(file = dbPath()): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON')
  return db
}

export function openDb(file = dbPath()): Db {
  const db = connect(file)
  migrate(db)
  return db
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
