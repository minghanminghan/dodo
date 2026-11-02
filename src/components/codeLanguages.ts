import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language'
import type { StreamParser } from '@codemirror/language'

// Fenced code languages for the editor. Each parser is a separate chunk, loaded when a doc first uses it.
const legacy = (parser: StreamParser<unknown>) => new LanguageSupport(StreamLanguage.define(parser))

export const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: 'shell',
    alias: ['bash', 'sh', 'zsh'],
    load: () => import('@codemirror/legacy-modes/mode/shell').then((m) => legacy(m.shell)),
  }),
  LanguageDescription.of({ name: 'python', alias: ['py'], load: () => import('@codemirror/lang-python').then((m) => m.python()) }),
  LanguageDescription.of({
    name: 'javascript',
    alias: ['js', 'jsx'],
    load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })),
  }),
  LanguageDescription.of({
    name: 'typescript',
    alias: ['ts', 'tsx'],
    load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true, typescript: true })),
  }),
  LanguageDescription.of({ name: 'go', load: () => import('@codemirror/lang-go').then((m) => m.go()) }),
  LanguageDescription.of({ name: 'json', load: () => import('@codemirror/lang-json').then((m) => m.json()) }),
  LanguageDescription.of({ name: 'yaml', alias: ['yml'], load: () => import('@codemirror/lang-yaml').then((m) => m.yaml()) }),
  LanguageDescription.of({ name: 'sql', load: () => import('@codemirror/lang-sql').then((m) => m.sql()) }),
  LanguageDescription.of({ name: 'html', load: () => import('@codemirror/lang-html').then((m) => m.html()) }),
  LanguageDescription.of({ name: 'css', load: () => import('@codemirror/lang-css').then((m) => m.css()) }),
  LanguageDescription.of({ name: 'rust', alias: ['rs'], load: () => import('@codemirror/lang-rust').then((m) => m.rust()) }),
  LanguageDescription.of({ name: 'toml', load: () => import('@codemirror/legacy-modes/mode/toml').then((m) => legacy(m.toml)) }),
  LanguageDescription.of({
    name: 'dockerfile',
    alias: ['docker'],
    load: () => import('@codemirror/legacy-modes/mode/dockerfile').then((m) => legacy(m.dockerFile)),
  }),
]
