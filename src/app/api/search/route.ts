import { searchDocs } from '@/core'
import { errorResponse, getState } from '@/server/state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  try {
    const q = new URL(req.url).searchParams
    const state = getState()
    const limit = Number(q.get('limit')) || undefined
    return Response.json(searchDocs(state.db, state.index, q.get('q') ?? '', { project: q.get('project') || undefined, limit }))
  } catch (err) {
    return errorResponse(err)
  }
}
