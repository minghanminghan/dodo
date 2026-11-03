'use client'

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { codeLanguages } from './codeLanguages'

export function Editor({ initial, onChange, viewRef }: { initial: string; onChange(body: string): void; viewRef: RefObject<EditorView | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const change = useRef(onChange)
  change.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          syntaxHighlighting(defaultHighlightStyle),
          markdown({ codeLanguages }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The editor owns its text after mount; `initial` is only the starting body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={host} className="min-h-0 flex-1 overflow-auto rounded border border-gray-200" />
}
