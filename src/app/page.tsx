'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { useDodo, visibleDocs } from '@/client/store'
import { DocView, NewDoc } from '@/components/DocView'
import { Search } from '@/components/Search'
import { Tree } from '@/components/Tree'

function Home() {
  const params = useSearchParams()
  const open = params.get('doc')
  const isNew = params.has('new')
  const index = useDodo((s) => s.index)
  const outbox = useDodo((s) => s.outbox)
  const offline = useDodo((s) => s.offline)
  const [project, setProject] = useState('')
  const docs = useMemo(() => visibleDocs(index, outbox), [index, outbox])
  const projects = useMemo(() => [...new Set(docs.flatMap((d) => d.projects))].sort(), [docs])
  const filtered = project ? docs.filter((d) => d.projects.includes(project)) : docs
  const doc = open ? docs.find((d) => d.path === open) : undefined
  const pane = Boolean(open || isNew)

  return (
    <div className="flex h-full">
      <aside className={`${pane ? 'hidden md:flex' : 'flex'} w-full flex-col gap-2 border-r border-gray-200 p-3 md:w-72`}>
        <select value={project} onChange={(e) => setProject(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Search docs={filtered} project={project} offline={offline}>
          {index ? <Tree docs={filtered} active={open} /> : <p className="px-2 text-sm text-gray-500">Loading…</p>}
        </Search>
      </aside>
      <section className={`${pane ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {pane && (
          <Link href="/" className="px-4 pt-3 text-sm text-gray-600 md:hidden">
            ← Docs
          </Link>
        )}
        <div className="min-h-0 flex-1">
          {isNew ? (
            <NewDoc />
          ) : doc ? (
            <DocView key={doc.path} doc={doc} />
          ) : open ? (
            <p className="p-4 text-sm text-gray-500">{index ? `No doc at ${open}.` : 'Loading…'}</p>
          ) : (
            <p className="p-4 text-sm text-gray-500">Pick a doc.</p>
          )}
        </div>
      </section>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  )
}
