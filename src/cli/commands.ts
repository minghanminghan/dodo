import fs from 'node:fs'
import path from 'node:path'
import { AGENTS_MD } from '../core/agents-md'
import { EXIT, DodoError } from '../core/errors'
import { MAX_FILE_BYTES, mimeFor } from '../core/mime'
import type { Doc, DocIndex, FileMeta } from '../core/types'
import { VERSION, VERSION_HEADER } from '../core/version'
import { api, call, sendJson, toError } from './http'

export type FlagType = 'string' | 'boolean'
export type FlagDef = { name: string; short?: string; type: FlagType; multiple?: boolean; desc: string }
export type CommandDef = { name: string; summary: string; args?: string; flags: FlagDef[] }
export type Values = Record<string, string | boolean | string[] | undefined>

type SaveResult = { doc: Doc; conflictOf?: string }
type Hit = { path: string; title: string; snippet?: string }
type ListItem = { path: string; title: string; projects: string[]; updated: string }

export const GLOBAL_FLAGS: FlagDef[] = [
  { name: 'json', type: 'boolean', desc: 'force JSON output' },
  { name: 'env', type: 'string', desc: 'dev (the local `pnpm dev` DB) or prod. Default: DODO_URL, then prod' },
  { name: 'help', short: 'h', type: 'boolean', desc: 'Print help' },
]

const BODY_FLAGS: FlagDef[] = [
  { name: 'body', type: 'string', desc: 'body text, or "-" for stdin' },
  { name: 'body-file', type: 'string', desc: 'path to a file with the body' },
]

export const COMMANDS: CommandDef[] = [
  {
    name: 'list',
    summary: 'List docs by path',
    flags: [
      { name: 'project', type: 'string', desc: 'filter by project key' },
      { name: 'under', type: 'string', desc: 'only docs at or under this path' },
    ],
  },
  { name: 'show', summary: 'Show a doc (JSON has body and bodyHash)', args: '<PATH>', flags: [] },
  {
    name: 'create',
    summary: 'Create a doc',
    args: '<PATH>',
    flags: [{ name: 'project', type: 'string', multiple: true, desc: 'project key (repeat for more)' }, ...BODY_FLAGS],
  },
  {
    name: 'write',
    summary: 'Replace a doc body; fails with exit 3 if it changed since it was read',
    args: '<PATH>',
    flags: [{ name: 'body-hash', type: 'string', desc: 'bodyHash from `dodo show` (required)' }, ...BODY_FLAGS],
  },
  { name: 'move', summary: 'Move a doc or folder (fails if any target exists)', args: '<FROM> <TO>', flags: [] },
  { name: 'delete', summary: 'Delete a doc', args: '<PATH>', flags: [] },
  {
    name: 'project',
    summary: "Set a doc's project keys",
    args: '<PATH>',
    flags: [{ name: 'set', type: 'string', desc: 'comma-separated keys, or "" to clear' }],
  },
  {
    name: 'search',
    summary: 'Fuzzy search paths and titles, full-text search bodies',
    args: '<QUERY>',
    flags: [{ name: 'project', type: 'string', desc: 'filter by project key' }],
  },
  { name: 'attach', summary: 'Upload a file (max 25 MB); prints markdown to paste into the doc', args: '<PATH> <FILE>', flags: [] },
  { name: 'upgrade', summary: "Replace this CLI with the server's version", flags: [] },
  { name: 'agents-md', summary: 'Print the AGENTS.md snippet for agents', flags: [] },
  { name: 'help', summary: 'Print this message or the help of the given command', args: '[COMMAND]', flags: [] },
]

export type HelpValue = { command?: string; commands: CommandDef[]; globalFlags: FlagDef[]; exitCodes: Record<string, number> }

export type CommandResult =
  | { kind: 'list'; value: ListItem[] }
  | { kind: 'doc'; value: Doc }
  | { kind: 'saved'; value: SaveResult }
  | { kind: 'moved'; value: { paths: string[] } }
  | { kind: 'deleted'; value: { path: string; deleted: true } }
  | { kind: 'hits'; value: Hit[] }
  | { kind: 'file'; value: FileMeta & { markdown: string } }
  | { kind: 'upgraded'; value: { file: string; from: string; to: string } }
  | { kind: 'text'; value: string }
  | { kind: 'help'; value: HelpValue }

function args(positionals: string[], n: number, usage: string): string[] {
  if (positionals.length !== n) throw new DodoError('usage', `expected ${usage}`)
  return positionals
}

function readBody(values: Values, command: string): string {
  const body = values.body as string | undefined
  if (body !== undefined) return body === '-' ? fs.readFileSync(0, 'utf8') : body
  const file = values['body-file'] as string | undefined
  if (file !== undefined) return fs.readFileSync(path.resolve(file), 'utf8')
  throw new DodoError('usage', `${command} requires --body or --body-file`)
}

function one(values: Values, name: string): string | undefined {
  const v = values[name]
  return Array.isArray(v) ? v[v.length - 1] : (v as string | undefined)
}

const docPath = (p: string): string => `/api/doc?path=${encodeURIComponent(p)}`

function cmdHelp(positionals: string[]): CommandResult {
  const exitCodes = { ok: 0, ...EXIT }
  const name = positionals[0]
  if (name === undefined) return { kind: 'help', value: { commands: COMMANDS, globalFlags: GLOBAL_FLAGS, exitCodes } }
  const cmd = COMMANDS.find((c) => c.name === name)
  if (!cmd) throw new DodoError('usage', `unknown command "${name}"`)
  return { kind: 'help', value: { command: name, commands: [cmd], globalFlags: GLOBAL_FLAGS, exitCodes } }
}

async function cmdList(values: Values): Promise<CommandResult> {
  let docs = (await api<DocIndex>('/api/docs')).docs
  const project = one(values, 'project')?.toUpperCase()
  if (project) docs = docs.filter((d) => d.projects.includes(project))
  const under = (values.under as string | undefined)?.toLowerCase().replace(/^\/+|\/+$/g, '').replace(/\.md$/, '')
  if (under) docs = docs.filter((d) => d.path === under || d.path.startsWith(under + '/'))
  return { kind: 'list', value: docs.map((d) => ({ path: d.path, title: d.title, projects: d.projects, updated: d.updated })) }
}

async function cmdWrite(p: string, values: Values): Promise<CommandResult> {
  const baseHash = values['body-hash'] as string | undefined
  if (!baseHash) throw new DodoError('usage', 'write requires --body-hash (the bodyHash from `dodo show`)')
  const body = readBody(values, 'write')
  try {
    return { kind: 'saved', value: await sendJson<SaveResult>(docPath(p), 'PUT', { body, baseHash }) }
  } catch (err) {
    if (err instanceof DodoError && err.code === 'conflict') throw new DodoError('conflict', 'doc changed since it was read; run dodo show again')
    throw err
  }
}

async function cmdProject(p: string, values: Values): Promise<CommandResult> {
  const set = values.set as string | undefined
  if (set === undefined) throw new DodoError('usage', 'project requires --set K,K (or --set "" to clear)')
  const projects = set.split(',').map((k) => k.trim()).filter(Boolean)
  return { kind: 'doc', value: await sendJson<Doc>(docPath(p), 'PATCH', { projects }) }
}

async function cmdSearch(positionals: string[], values: Values): Promise<CommandResult> {
  const q = positionals.join(' ')
  if (!q.trim()) throw new DodoError('usage', 'expected a search query')
  const params = new URLSearchParams({ q })
  const project = one(values, 'project')
  if (project) params.set('project', project)
  return { kind: 'hits', value: await api<Hit[]>(`/api/search?${params}`) }
}

async function cmdAttach(p: string, arg: string): Promise<CommandResult> {
  const file = path.resolve(arg)
  if (!fs.existsSync(file)) throw new DodoError('not_found', `file ${arg} not found`)
  if (fs.statSync(file).size > MAX_FILE_BYTES) throw new DodoError('invalid', 'file exceeds 25 MB')
  const form = new FormData()
  form.append('file', new File([fs.readFileSync(file)], path.basename(file), { type: mimeFor(file) }))
  const value = await api<FileMeta & { markdown: string }>(`/api/files?path=${encodeURIComponent(p)}`, { method: 'POST', body: form })
  return { kind: 'file', value }
}

// Downloads the server's CLI bundle and swaps it in for the running file.
async function cmdUpgrade(): Promise<CommandResult> {
  const file = fs.realpathSync(process.argv[1])
  if (!file.endsWith('.js')) throw new DodoError('usage', `cannot upgrade ${file}: not a built dodo bundle`)
  const res = await call('/cli/dodo.js', {}, true)
  if (!res.ok) throw await toError(res)
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()), { mode: 0o755 })
  fs.renameSync(tmp, file)
  return { kind: 'upgraded', value: { file, from: VERSION, to: res.headers.get(VERSION_HEADER) ?? 'unknown' } }
}

export async function runCommand(name: string, values: Values, positionals: string[]): Promise<CommandResult> {
  switch (name) {
    case 'help':
      return cmdHelp(positionals)
    case 'list':
      return cmdList(values)
    case 'show': {
      const [p] = args(positionals, 1, 'one doc path')
      return { kind: 'doc', value: await api<Doc>(docPath(p)) }
    }
    case 'create': {
      const [p] = args(positionals, 1, 'one doc path')
      const input = { path: p, body: readBody(values, 'create'), projects: (values.project as string[] | undefined) ?? [] }
      return { kind: 'saved', value: await sendJson<SaveResult>('/api/docs', 'POST', input) }
    }
    case 'write':
      return cmdWrite(args(positionals, 1, 'one doc path')[0], values)
    case 'move': {
      const [from, to] = args(positionals, 2, 'a from path and a to path')
      return { kind: 'moved', value: await sendJson<{ paths: string[] }>(docPath(from), 'PATCH', { moveTo: to }) }
    }
    case 'delete': {
      const [p] = args(positionals, 1, 'one doc path')
      await api(docPath(p), { method: 'DELETE' })
      return { kind: 'deleted', value: { path: p, deleted: true } }
    }
    case 'project':
      return cmdProject(args(positionals, 1, 'one doc path')[0], values)
    case 'search':
      return cmdSearch(positionals, values)
    case 'attach': {
      const [p, file] = args(positionals, 2, 'a doc path and a file')
      return cmdAttach(p, file)
    }
    case 'upgrade':
      return cmdUpgrade()
    case 'agents-md':
      return { kind: 'text', value: AGENTS_MD }
    default:
      throw new DodoError('usage', `unknown command "${name}"`)
  }
}
