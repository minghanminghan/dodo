'use client'

import type { ComponentProps } from 'react'

let unsaved = false

// DocView sets this while its draft has changes, so leaving asks first.
export function setUnsaved(value: boolean): void {
  unsaved = value
}

// In-app navigation with history.pushState: no RSC fetch, so it also works offline. Next syncs useSearchParams.
export function go(href: string, { replace = false } = {}): boolean {
  if (unsaved && !confirm('Discard your unsaved edit?')) return false
  unsaved = false
  window.history[replace ? 'replaceState' : 'pushState'](null, '', href)
  return true
}

export function AppLink({ href, onClick, ...props }: ComponentProps<'a'> & { href: string }) {
  return (
    <a
      href={href}
      {...props}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        go(href)
      }}
    />
  )
}
