'use client'

import { AppLink } from '@/components/AppLink'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useDodo } from '@/client/store'
import { OfflineBar } from './OfflineBar'

export function Shell({ children, version }: { children: ReactNode; version: string }) {
  const load = useDodo((s) => s.load)

  useEffect(() => {
    void load()
    // Fetch the editor chunk now so the service worker has it for offline edits.
    void import('./Editor')
  }, [load])

  return (
    <div className="flex h-dvh flex-col">
      <OfflineBar />
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2">
        <AppLink href="/" className="text-sm font-semibold text-gray-900">
          dodo
        </AppLink>
        <span className="text-xs text-gray-400">v{version}</span>
        <AppLink href="/?new=1" className="ml-auto rounded bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700">
          + New
        </AppLink>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  )
}
