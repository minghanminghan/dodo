import { expect, test } from 'vitest'
import type { Doc } from '@/core'
import { ApiError } from './api'
import { flushEntry, queueEdit } from './outbox'

test('two offline edits to one doc become one entry with the first base hash', () => {
  let q = queueEdit([], { kind: 'write', path: 'a', body: 'one', baseHash: 'h0' })
  q = queueEdit(q, { kind: 'write', path: 'a', body: 'two', baseHash: 'h1' })
  expect(q).toHaveLength(1)
  expect(q[0]).toMatchObject({ body: 'two', baseHash: 'h0' })
})
test('network error keeps the entry; API error marks it; success clears it', async () => {
  const e = queueEdit([], { kind: 'write', path: 'a', body: 'x', baseHash: 'h' })[0]
  expect((await flushEntry(e, { send: () => Promise.reject(new TypeError('offline')) })).entry).toEqual(e)
  expect((await flushEntry(e, { send: () => Promise.reject(new ApiError('invalid', 'bad')) })).entry?.error).toBe('bad')
  const result = { doc: {} as Doc, conflictOf: 'a' }
  expect(await flushEntry(e, { send: () => Promise.resolve(result) })).toEqual({ entry: null, result })
})
