'use client'

import { create } from 'zustand'
import type { Doc, DocIndex } from '@/core'
import { titleOf } from '@/core/paths'
import { createDoc as apiCreateDoc, fetchIndex, writeDoc as apiWriteDoc } from './api'
import { loadCachedIndex, saveCachedIndex } from './cache'
import { flushEntry, isNetworkError, loadOutbox, queueEdit, saveOutbox } from './outbox'
import type { OutboxDeps, OutboxEntry } from './outbox'

export type DodoState = {
  index: DocIndex | null
  rev: string | null
  offline: boolean
  outbox: OutboxEntry[]
  conflicts: { path: string; copy: string }[]
  load(): Promise<void>
  refreshIndex(): Promise<void>
  saveEdit(path: string, body: string, baseHash: string): Promise<void>
  createDoc(path: string, body: string, projects: string[]): Promise<void>
  flush(): Promise<void>
  dismissConflict(copy: string): void
  discardEntry(clientId: string): void
  retryEntry(clientId: string): void
}

// Every send asks for a conflict copy and carries the entry's clientId, so a retry is never a duplicate.
const deps: OutboxDeps = {
  send: (e, signal) =>
    e.kind === 'create'
      ? apiCreateDoc({ path: e.path, body: e.body, projects: e.projects, clientId: e.clientId, onConflict: 'copy' }, signal)
      : apiWriteDoc(e.path, { body: e.body, baseHash: e.baseHash!, clientId: e.clientId, onConflict: 'copy' }, signal),
}

// The docs to show: the server index with pending outbox bodies laid over it.
export function visibleDocs(index: DocIndex | null, outbox: OutboxEntry[]): Doc[] {
  const docs = new Map((index?.docs ?? []).map((d) => [d.path, d]))
  for (const e of outbox) {
    const base = docs.get(e.path)
    const t = new Date(e.createdAt).toISOString()
    docs.set(e.path, {
      ...(base ?? { path: e.path, projects: e.projects ?? [], created: t, updated: t, bodyHash: '', files: [] }),
      body: e.body,
      title: titleOf(e.path, e.body),
    })
  }
  return [...docs.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

export const useDodo = create<DodoState>((set, get) => {
  let started = false
  let flushing = false

  function setOutbox(outbox: OutboxEntry[]): void {
    set({ outbox })
    void saveOutbox(outbox)
  }

  async function queue(next: Omit<OutboxEntry, 'clientId' | 'createdAt'>): Promise<void> {
    setOutbox(queueEdit(get().outbox, next))
    if (!get().offline) await get().flush()
  }

  return {
    index: null,
    rev: null,
    offline: false,
    outbox: [],
    conflicts: [],

    async load() {
      if (started) return
      started = true
      const [cached, outbox] = await Promise.all([loadCachedIndex(), loadOutbox()])
      if (cached && !get().index) set({ index: { docs: cached.index.docs }, rev: cached.index.rev })
      set({ outbox: [...outbox, ...get().outbox.filter((e) => !outbox.some((o) => o.clientId === e.clientId))] })
      window.addEventListener('online', () => void get().refreshIndex())
      window.addEventListener('offline', () => set({ offline: true }))
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void get().refreshIndex()
      })
      await get().refreshIndex()
    },

    async refreshIndex() {
      try {
        const next = await fetchIndex(get().rev ?? undefined)
        if (next) {
          set({ index: { docs: next.docs }, rev: next.rev })
          void saveCachedIndex(next)
        }
        set({ offline: false })
      } catch (err) {
        if (isNetworkError(err)) set({ offline: true })
        return
      }
      await get().flush()
    },

    saveEdit(path, body, baseHash) {
      return queue({ kind: 'write', path, body, baseHash })
    },

    createDoc(path, body, projects) {
      return queue({ kind: 'create', path, body, projects })
    },

    async flush() {
      if (flushing) return
      flushing = true
      let sent = false
      try {
        for (const e of get().outbox) {
          if (e.error) continue
          const { entry, result } = await flushEntry(e, deps)
          if (entry) {
            // Keep the live entry, not the sent copy: it may hold an edit made while this one was in flight.
            if (!entry.error) {
              set({ offline: true })
              break
            }
            setOutbox(get().outbox.map((o) => (o.clientId === e.clientId ? { ...o, error: entry.error } : o)))
            continue
          }
          if (!result) continue
          sent = true
          const now = get().outbox.find((o) => o.clientId === e.clientId)
          // A body the server does not have yet (edited in flight, or a retried create) becomes a new write on top.
          const rest = get().outbox.filter((o) => o.clientId !== e.clientId)
          const again: OutboxEntry[] =
            now && now.body !== result.doc.body
              ? [{ ...now, kind: 'write', path: result.doc.path, baseHash: result.doc.bodyHash, clientId: crypto.randomUUID() }]
              : []
          // Show the saved doc now, so the old body does not flash before refreshIndex returns.
          const index = get().index
          if (index) set({ index: { docs: [...index.docs.filter((d) => d.path !== result.doc.path), result.doc] } })
          setOutbox([...rest, ...again])
          if (result?.conflictOf) set({ conflicts: [...get().conflicts, { path: result.conflictOf, copy: result.doc.path }] })
        }
      } finally {
        flushing = false
      }
      if (sent) await get().refreshIndex()
    },

    dismissConflict(copy) {
      set({ conflicts: get().conflicts.filter((c) => c.copy !== copy) })
    },

    discardEntry(clientId) {
      setOutbox(get().outbox.filter((e) => e.clientId !== clientId))
    },

    retryEntry(clientId) {
      setOutbox(get().outbox.map((e) => (e.clientId === clientId ? { ...e, error: undefined } : e)))
      void get().flush()
    },
  }
})
