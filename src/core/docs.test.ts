import { beforeEach, expect, test } from 'vitest'
import { openDb } from './db'
import type { Db } from './db'
import { createDoc, deleteDoc, loadIndex, movePath, readDoc, writeDoc } from './docs'

let db: Db
beforeEach(() => {
  db = openDb(':memory:')
})

test('write with a stale hash conflicts; copy mode saves a copy once', () => {
  const { doc } = createDoc(db, { path: 'a', body: 'one' })
  writeDoc(db, 'a', { body: 'two', baseHash: doc.bodyHash })
  expect(() => writeDoc(db, 'a', { body: 'three', baseHash: doc.bodyHash })).toThrow(/conflict|changed/)
  const r1 = writeDoc(db, 'a', { body: 'three', baseHash: doc.bodyHash, clientId: 'c1', onConflict: 'copy' })
  const r2 = writeDoc(db, 'a', { body: 'three', baseHash: doc.bodyHash, clientId: 'c1', onConflict: 'copy' })
  expect(r1).toMatchObject({ conflictOf: 'a', doc: { path: 'a.conflict-1', body: 'three' } })
  expect(r2.doc.path).toBe('a.conflict-1')
  expect(readDoc(db, 'a').body).toBe('two')
})
test('retried write after it landed is a no-op success', () => {
  const { doc } = createDoc(db, { path: 'a', body: 'one' })
  writeDoc(db, 'a', { body: 'two', baseHash: doc.bodyHash })
  const r = writeDoc(db, 'a', { body: 'two', baseHash: doc.bodyHash, onConflict: 'copy' })
  expect(r.conflictOf).toBeUndefined()
  expect(loadIndex(db).docs.map((d) => d.path)).toEqual(['a'])
})
test('create is idempotent by clientId and conflicts on a taken path', () => {
  createDoc(db, { path: 'a', body: 'x', clientId: 'k' })
  expect(createDoc(db, { path: 'a', body: 'x', clientId: 'k' }).doc.path).toBe('a')
  expect(() => createDoc(db, { path: 'a', body: 'y' })).toThrow()
  expect(createDoc(db, { path: 'a', body: 'y', onConflict: 'copy' }).doc.path).toBe('a.conflict-1')
})
test('movePath moves a folder and refuses to overwrite', () => {
  createDoc(db, { path: 'x/one', body: '' }); createDoc(db, { path: 'x/two', body: '' }); createDoc(db, { path: 'y/one', body: '' })
  expect(() => movePath(db, 'x', 'y')).toThrow()
  expect(loadIndex(db).docs.map((d) => d.path)).toEqual(['x/one', 'x/two', 'y/one'])
  expect(movePath(db, 'x', 'z').sort()).toEqual(['z/one', 'z/two'])
})
test('a deleted path can be reused; projects are normalized', () => {
  createDoc(db, { path: 'a', body: '' }); deleteDoc(db, 'a')
  expect(createDoc(db, { path: 'a', body: '', projects: ['spar', 'crow'] }).doc.projects).toEqual(['CROW', 'SPAR'])
})
