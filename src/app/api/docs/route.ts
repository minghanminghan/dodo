import { gzipSync } from 'node:zlib'
import { createDoc } from '@/core'
import { errorResponse, getState, jsonBody, refresh } from '@/server/state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  try {
    const state = getState()
    const etag = `"${state.rev}"`
    if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } })
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ETag: etag, Vary: 'Accept-Encoding' }
    const json = JSON.stringify({ ...state.index, rev: state.rev })
    // Next 16.4 hands route-handler Content-Type to its compression middleware as an array, which it then refuses to compress.
    if (/\bgzip\b/.test(req.headers.get('accept-encoding') ?? '')) {
      headers['Content-Encoding'] = 'gzip'
      return new Response(gzipSync(json), { headers })
    }
    return new Response(json, { headers })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const state = getState()
    const result = createDoc(
      state.db,
      await jsonBody(req, { path: 'string', body: 'string', projects: 'string[]?', clientId: 'string?', onConflict: 'string?' }),
    )
    refresh(state)
    return Response.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
