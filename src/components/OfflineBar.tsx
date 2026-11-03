'use client'

import { AppLink } from '@/components/AppLink'
import { useDodo } from '@/client/store'

export function OfflineBar() {
  const offline = useDodo((s) => s.offline)
  const outbox = useDodo((s) => s.outbox)
  const conflicts = useDodo((s) => s.conflicts)
  const dismissConflict = useDodo((s) => s.dismissConflict)
  const discardEntry = useDodo((s) => s.discardEntry)
  const retryEntry = useDodo((s) => s.retryEntry)
  const failed = outbox.filter((e) => e.error)
  const waiting = outbox.length - failed.length

  return (
    <>
      {(offline || waiting > 0) && (
        <div className="bg-amber-50 px-3 py-1 text-[11px] text-amber-800">
          {offline ? 'Offline' : 'Sending'}
          {waiting > 0 && ` · ${waiting} pending`}
        </div>
      )}
      {failed.map((e) => (
        <div key={e.clientId} className="flex items-center gap-2 bg-red-50 px-3 py-1 text-xs text-red-800">
          <span>
            Could not save {e.path}: {e.error}
          </span>
          <button onClick={() => retryEntry(e.clientId)} className="ml-auto underline">
            Retry
          </button>
          <button onClick={() => confirm(`Discard your edit to ${e.path}?`) && discardEntry(e.clientId)} className="underline">
            Discard
          </button>
        </div>
      ))}
      {conflicts.map((c) => (
        <div key={c.copy} className="flex items-center gap-2 bg-blue-50 px-3 py-1 text-xs text-blue-900">
          <span>
            Your edit to {c.path} was saved as{' '}
            <AppLink href={`/?doc=${c.copy}`} className="underline">
              {c.copy}
            </AppLink>
            . Merge it by hand.
          </span>
          <button onClick={() => dismissConflict(c.copy)} className="ml-auto underline">
            Close
          </button>
        </div>
      ))}
    </>
  )
}
