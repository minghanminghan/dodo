import fs from 'node:fs'
import { DodoError, getFile, isInlineImage, removeFile } from '@/core'
import { errorResponse, getState, refresh } from '@/server/state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const { id } = await params
    const meta = getFile(getState().db, id)
    if (!fs.existsSync(meta.file)) throw new DodoError('not_found', `file ${id} is missing`)
    const inline = isInlineImage(meta.mime)
    const ascii = meta.filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
    return new Response(new Uint8Array(fs.readFileSync(meta.file)), {
      headers: {
        'Content-Type': inline ? meta.mime : 'application/octet-stream',
        'Content-Length': String(meta.size),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const state = getState()
    removeFile(state.db, (await params).id)
    refresh(state)
    return Response.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
