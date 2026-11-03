import { deleteDoc, DodoError, movePath, readDoc, setProjects, writeDoc } from '@/core'
import { errorResponse, getState, jsonBody, pathParam, refresh } from '@/server/state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  try {
    return Response.json(readDoc(getState().db, pathParam(req)))
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PUT(req: Request): Promise<Response> {
  try {
    const state = getState()
    const result = writeDoc(
      state.db,
      pathParam(req),
      await jsonBody(req, { body: 'string', baseHash: 'string', clientId: 'string?', onConflict: 'string?' }),
    )
    refresh(state)
    return Response.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const state = getState()
    const path = pathParam(req)
    const input = await jsonBody<{ moveTo?: string; projects?: string[] }>(req, { moveTo: 'string?', projects: 'string[]?' })
    let out: unknown
    if (input.moveTo !== undefined) out = { paths: movePath(state.db, path, input.moveTo) }
    else if (input.projects) out = setProjects(state.db, path, input.projects)
    else throw new DodoError('usage', 'expected { moveTo } or { projects }')
    refresh(state)
    return Response.json(out)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const state = getState()
    deleteDoc(state.db, pathParam(req))
    refresh(state)
    return Response.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
