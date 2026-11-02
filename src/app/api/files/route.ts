import { addFile, DodoError, fileMarkdown, MAX_FILE_BYTES } from '@/core'
import { errorResponse, getState, pathParam, refresh } from '@/server/state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Multipart upload with a single `file` field.
export async function POST(req: Request): Promise<Response> {
  try {
    const path = pathParam(req)
    if (Number(req.headers.get('content-length')) > MAX_FILE_BYTES + 64 * 1024) {
      return Response.json({ error: { code: 'invalid', message: 'file exceeds 25 MB' } }, { status: 413 })
    }
    const file = (await req.formData().catch(() => null))?.get('file')
    if (!(file instanceof File)) throw new DodoError('usage', 'expected multipart form data with a "file" field')
    const state = getState()
    const meta = addFile(state.db, path, { filename: file.name, mime: file.type, data: new Uint8Array(await file.arrayBuffer()) })
    refresh(state)
    return Response.json({ ...meta, markdown: fileMarkdown(meta) })
  } catch (err) {
    return errorResponse(err)
  }
}
