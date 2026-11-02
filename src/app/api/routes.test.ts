import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import { PUT as putDoc } from './doc/route'
import { POST as postDocs } from './docs/route'

beforeEach(() => {
  process.env.DODO_DB = path.join(mkdtempSync(path.join(tmpdir(), 'dodo-api-')), 'x.db')
  globalThis.__dodo = undefined
})

const jsonReq = (body: unknown, method = 'POST', query = '') =>
  new Request(`http://x/api${query}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('PUT with a stale hash is 409; with onConflict copy it is 200 and names the copy', async () => {
  const created = await (await postDocs(jsonReq({ path: 'a', body: 'one' }))).json()
  await putDoc(jsonReq({ body: 'two', baseHash: created.doc.bodyHash }, 'PUT', '?path=a'))
  const stale = await putDoc(jsonReq({ body: 'three', baseHash: created.doc.bodyHash }, 'PUT', '?path=a'))
  expect(stale.status).toBe(409)
  const copy = await (await putDoc(jsonReq({ body: 'three', baseHash: created.doc.bodyHash, clientId: 'c', onConflict: 'copy' }, 'PUT', '?path=a'))).json()
  expect(copy).toMatchObject({ conflictOf: 'a', doc: { path: 'a.conflict-1' } })
})
