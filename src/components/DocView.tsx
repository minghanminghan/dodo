'use client'

import type { EditorView } from '@codemirror/view'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { deleteDoc, moveDoc, setProjects, uploadFile } from '@/client/api'
import { useDodo, visibleDocs } from '@/client/store'
import type { Doc } from '@/core'
import { normalizePath, normalizeProject } from '@/core/paths'
import { go, setUnsaved } from './AppLink'
import { Markdown } from './Markdown'

// CodeMirror is most of the page's JS, so it loads only when editing starts.
const Editor = dynamic(() => import('./Editor').then((m) => m.Editor), {
  ssr: false,
  loading: () => <div className="flex-1" />,
})

function insertAtCursor(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
  view.focus()
}

const NEEDS_SIGNAL = 'Needs a signal'
const btn = 'rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40'

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function DocView({ doc }: { doc: Doc }) {
  const offline = useDodo((s) => s.offline)
  const pending = useDodo((s) => s.outbox.find((e) => e.path === doc.path))
  const saveEdit = useDodo((s) => s.saveEdit)
  const refreshIndex = useDodo((s) => s.refreshIndex)
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const view = useRef<EditorView | null>(null)
  const file = useRef<HTMLInputElement>(null)
  // A doc only in the outbox does not exist on the server yet.
  const onServer = !(pending?.kind === 'create')
  const dirty = draft !== null && draft !== doc.body

  useEffect(() => {
    if (!dirty) return
    setUnsaved(true)
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => {
      setUnsaved(false)
      window.removeEventListener('beforeunload', warn)
    }
  }, [dirty])

  async function online(run: () => Promise<void>) {
    setBusy(true)
    try {
      await run()
      await refreshIndex()
    } catch (err) {
      alert(message(err))
    } finally {
      setBusy(false)
    }
  }

  const move = () => {
    const to = prompt('Move to path', doc.path)
    if (!to || to === doc.path) return
    void online(async () => {
      await moveDoc(doc.path, to)
      go(`/?doc=${normalizePath(to)}`, { replace: true })
    })
  }
  const remove = () => {
    if (!confirm(`Delete ${doc.path}?`)) return
    void online(async () => {
      await deleteDoc(doc.path)
      go('/', { replace: true })
    })
  }
  const editProjects = () => {
    const keys = prompt('Project keys, comma separated', doc.projects.join(','))
    if (keys === null) return
    void online(async () => {
      await setProjects(doc.path, keys.split(',').map((k) => k.trim()).filter(Boolean))
    })
  }
  const upload = (f: File) =>
    void online(async () => {
      const meta = await uploadFile(doc.path, f)
      if (view.current) insertAtCursor(view.current, meta.markdown)
    })

  const save = async () => {
    if (draft !== null && draft !== doc.body) await saveEdit(doc.path, draft, doc.bodyHash)
    setDraft(null)
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-gray-500">{doc.path}</div>
          <div className="text-xs text-gray-400">
            {doc.projects.join(', ') || 'no projects'} · updated {doc.updated.slice(0, 16).replace('T', ' ')}
            {pending && ' · pending'}
          </div>
        </div>
        {draft === null ? (
          <>
            <button
              className={btn}
              onClick={() => {
                setPreview(false)
                setDraft(doc.body)
              }}
            >
              Edit
            </button>
            <button className={btn} disabled={offline || busy || !onServer} title={offline ? NEEDS_SIGNAL : undefined} onClick={move}>
              Move
            </button>
            <button className={btn} disabled={offline || busy || !onServer} title={offline ? NEEDS_SIGNAL : undefined} onClick={editProjects}>
              Projects
            </button>
            <button className={btn} disabled={offline || busy || !onServer} title={offline ? NEEDS_SIGNAL : undefined} onClick={remove}>
              Delete
            </button>
          </>
        ) : (
          <>
            <button
              className={btn}
              disabled={offline || busy || !onServer}
              title={offline ? NEEDS_SIGNAL : undefined}
              onClick={() => file.current?.click()}
            >
              Upload
            </button>
            <input
              ref={file}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) upload(f)
              }}
            />
            <button className={btn} onClick={() => setPreview(!preview)}>
              {preview ? 'Write' : 'Preview'}
            </button>
            <button className={btn} onClick={() => (!dirty || confirm('Discard your unsaved edit?')) && setDraft(null)}>
              Cancel
            </button>
            <button className="rounded bg-gray-900 px-3 py-1 text-xs text-white hover:bg-gray-700" onClick={() => void save()}>
              Save
            </button>
          </>
        )}
      </div>
      {offline && <p className="text-[11px] text-amber-700">Offline: edits are saved on this device. Move, delete, projects and uploads need a signal.</p>}
      {draft === null ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <Markdown>{doc.body}</Markdown>
        </div>
      ) : (
        <>
          {preview && (
            <div className="min-h-0 flex-1 overflow-auto">
              <Markdown>{draft}</Markdown>
            </div>
          )}
          {/* Hidden, not unmounted, so undo history and cursor survive a preview. */}
          <div className={preview ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
            <Editor initial={draft} onChange={setDraft} viewRef={view} />
          </div>
        </>
      )}
    </div>
  )
}

export function NewDoc() {
  const createDoc = useDodo((s) => s.createDoc)
  const [path, setPath] = useState('')
  const [projects, setProjectsText] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    try {
      const p = normalizePath(path)
      const keys = projects.split(',').map((k) => k.trim()).filter(Boolean).map(normalizeProject)
      const { index, outbox } = useDodo.getState()
      if (visibleDocs(index, outbox).some((d) => d.path === p)) throw new Error(`a doc already exists at ${p}`)
      await createDoc(p, `# ${p.split('/').pop()}\n`, keys)
      go(`/?doc=${p}`, { replace: true })
    } catch (err) {
      setError(message(err))
    }
  }

  return (
    <form
      className="flex max-w-md flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h2 className="text-sm font-semibold">New doc</h2>
      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="deploy/mini-pc"
        autoFocus
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <input
        value={projects}
        onChange={(e) => setProjectsText(e.target.value)}
        placeholder="Project keys (optional): SPAR, CROW"
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button className="self-start rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">Create</button>
    </form>
  )
}
