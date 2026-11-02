import { beforeEach, expect, test } from 'vitest'
import { openDb } from './db'
import type { Db } from './db'
import { createDoc, deleteDoc, loadIndex } from './docs'
import { searchDocs } from './search'

let db: Db
beforeEach(() => {
  db = openDb(':memory:')
})

test('fuzzy finds a path with a typo; full text finds body words', () => {
  createDoc(db, { path: 'deploy/mini-pc', body: '# Mini PC\nrun systemctl restart' })
  const index = loadIndex(db)
  expect(searchDocs(db, index, 'minipc')[0].path).toBe('deploy/mini-pc')
  expect(searchDocs(db, index, 'systemctl')[0]).toMatchObject({ path: 'deploy/mini-pc', snippet: expect.stringContaining('systemctl') })
})
test('short and odd queries never throw', () => {
  createDoc(db, { path: 'a', body: 'x' })
  for (const q of ['a', 'ab', '"', 'a AND', '-x*', '']) expect(() => searchDocs(db, loadIndex(db), q)).not.toThrow()
})
test('project filter and deleted docs', () => {
  createDoc(db, { path: 'one', body: 'needle', projects: ['SPAR'] }); createDoc(db, { path: 'two', body: 'needle' })
  createDoc(db, { path: 'three', body: 'needle' }); deleteDoc(db, 'three')
  expect(searchDocs(db, loadIndex(db), 'needle', { project: 'spar' }).map((h) => h.path)).toEqual(['one'])
  expect(searchDocs(db, loadIndex(db), 'needle').map((h) => h.path).sort()).toEqual(['one', 'two'])
})
