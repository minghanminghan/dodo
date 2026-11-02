'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Doc } from '@/core'

type Node = { name: string; path: string; doc?: Doc; children: Map<string, Node> }

function build(docs: Doc[]): Node {
  const root: Node = { name: '', path: '', children: new Map() }
  for (const d of docs) {
    let node = root
    for (const part of d.path.split('/')) {
      const path = node.path ? `${node.path}/${part}` : part
      if (!node.children.has(part)) node.children.set(part, { name: part, path, children: new Map() })
      node = node.children.get(part)!
    }
    node.doc = d
  }
  return root
}

export function Tree({ docs, active }: { docs: Doc[]; active: string | null }) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const toggle = (path: string) =>
    setClosed((s) => {
      const next = new Set(s)
      if (!next.delete(path)) next.add(path)
      return next
    })

  function render(node: Node, depth: number) {
    return [...node.children.values()].map((n) => (
      <li key={n.path}>
        <div className="flex items-center" style={{ paddingLeft: depth * 12 }}>
          {n.children.size > 0 ? (
            <button onClick={() => toggle(n.path)} className="w-4 text-xs text-gray-400" aria-label="Toggle folder">
              {closed.has(n.path) ? '▸' : '▾'}
            </button>
          ) : (
            <span className="w-4" />
          )}
          {n.doc ? (
            <Link
              href={`/?doc=${n.path}`}
              className={`flex-1 truncate rounded px-1 py-1 text-sm ${active === n.path ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {n.name}
            </Link>
          ) : (
            <button onClick={() => toggle(n.path)} className="flex-1 truncate px-1 py-1 text-left text-sm font-medium text-gray-500">
              {n.name}/
            </button>
          )}
        </div>
        {n.children.size > 0 && !closed.has(n.path) && <ul>{render(n, depth + 1)}</ul>}
      </li>
    ))
  }

  if (!docs.length) return <p className="px-2 text-sm text-gray-500">No docs yet.</p>
  return <ul>{render(build(docs), 0)}</ul>
}
