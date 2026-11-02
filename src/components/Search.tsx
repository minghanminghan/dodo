'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { search } from '@/client/api'
import type { Doc, Hit } from '@/core'

// Server search when online; offline it filters the cached docs by path and title.
export function Search({ docs, project, offline, children }: { docs: Doc[]; project: string; offline: boolean; children: ReactNode }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const query = q.trim()

  useEffect(() => {
    if (!query || offline) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      search(query, project || undefined, controller.signal)
        .then(setHits)
        .catch(() => {})
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, project, offline])

  const lower = query.toLowerCase()
  const shown: Hit[] = offline
    ? docs.filter((d) => d.path.includes(lower) || d.title.toLowerCase().includes(lower)).map((d) => ({ path: d.path, title: d.title }))
    : hits

  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      {query && offline && <p className="text-[11px] text-amber-700">Offline: searching titles only</p>}
      <div className="min-h-0 flex-1 overflow-auto">
        {!query ? (
          children
        ) : shown.length ? (
          <ul>
            {shown.map((h) => (
              <li key={h.path}>
                <Link href={`/?doc=${h.path}`} className="block rounded px-2 py-1 hover:bg-gray-100">
                  <div className="truncate text-sm text-gray-900">{h.title}</div>
                  <div className="truncate text-xs text-gray-500">{h.path}</div>
                  {h.snippet && <div className="truncate text-xs text-gray-600">{h.snippet}</div>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 text-sm text-gray-500">No matches.</p>
        )}
      </div>
    </>
  )
}
