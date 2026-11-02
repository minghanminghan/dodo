import { parseArgs } from 'node:util'
import { EXIT, DodoError } from '../core/errors'
import { COMMANDS, GLOBAL_FLAGS, runCommand } from './commands'
import { setEnv } from './config'
import type { CommandResult, FlagDef, HelpValue, Values } from './commands'

type ParseOption = { type: 'string' | 'boolean'; short?: string; multiple?: boolean }

function buildOptions(flags: FlagDef[]): Record<string, ParseOption> {
  const options: Record<string, ParseOption> = {}
  // A flag repeatable in any command is parsed as a list everywhere; commands that take one use the last.
  for (const f of flags) {
    const multiple = f.multiple || options[f.name]?.multiple
    options[f.name] = { type: f.type, ...(f.short && { short: f.short }), ...(multiple && { multiple: true }) }
  }
  return options
}

function printTable(rows: string[][]): void {
  if (!rows.length) return
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)))
  for (const r of rows) console.log(r.map((cell, i) => (i === r.length - 1 ? cell : cell.padEnd(widths[i]))).join('  '))
}

function printOptions(flags: FlagDef[]): void {
  const left = flags.map((f) => {
    const long = f.type === 'string' ? `--${f.name} <${f.name.toUpperCase().replace(/-/g, '_')}>` : `--${f.name}`
    return f.short ? `-${f.short}, ${long}` : `    ${long}`
  })
  const width = Math.max(...left.map((l) => l.length))
  console.log('Options:')
  flags.forEach((f, i) => console.log(`  ${left[i].padEnd(width)}  ${f.desc}`))
}

function printHelp(value: HelpValue): void {
  if (value.command) {
    const cmd = value.commands[0]
    console.log(`${cmd.summary}\n\nUsage: dodo ${cmd.name} [OPTIONS]${cmd.args ? ` ${cmd.args}` : ''}\n`)
    printOptions([...cmd.flags, ...value.globalFlags])
    return
  }
  const width = Math.max(...value.commands.map((c) => c.name.length))
  console.log('dodo: markdown doc store CLI\n\nUsage: dodo [OPTIONS] <COMMAND>\n\nCommands:')
  for (const c of value.commands) console.log(`  ${c.name.padEnd(width)}  ${c.summary}`)
  console.log()
  printOptions(value.globalFlags)
}

function printResult(result: CommandResult, jsonMode: boolean): void {
  if (jsonMode && result.kind !== 'text') {
    console.log(JSON.stringify(result.value))
    return
  }
  switch (result.kind) {
    case 'list':
      printTable(result.value.map((d) => [d.path, d.projects.join(','), d.title]))
      return
    case 'doc':
      console.log(result.value.body)
      return
    case 'saved': {
      const { doc, conflictOf } = result.value
      console.log(conflictOf ? `${conflictOf} changed; saved as ${doc.path}` : `${doc.path}  ${doc.bodyHash}`)
      return
    }
    case 'moved':
      for (const p of result.value.paths) console.log(p)
      return
    case 'deleted':
      console.log(`${result.value.path} deleted`)
      return
    case 'hits':
      printTable(result.value.map((h) => [h.path, h.title, h.snippet?.replace(/\s+/g, ' ') ?? '']))
      return
    case 'file':
      console.log(result.value.markdown)
      return
    case 'upgraded':
      console.log(`dodo ${result.value.from} -> ${result.value.to} (${result.value.file})`)
      return
    case 'text':
      process.stdout.write(result.value)
      return
    case 'help':
      printHelp(result.value)
      return
  }
}

async function main(): Promise<void> {
  const allFlags = [...GLOBAL_FLAGS, ...COMMANDS.flatMap((c) => c.flags)]
  let values: Values
  let positionals: string[]
  try {
    ;({ values, positionals } = parseArgs({ args: process.argv.slice(2), options: buildOptions(allFlags), allowPositionals: true }) as {
      values: Values
      positionals: string[]
    })
  } catch (err) {
    throw new DodoError('usage', (err as Error).message)
  }

  const name = positionals.shift() ?? 'help'
  const cmd = COMMANDS.find((c) => c.name === name)
  if (!cmd) throw new DodoError('usage', `unknown command "${name}"`)
  const allowed = new Set([...GLOBAL_FLAGS, ...cmd.flags].map((f) => f.name))
  const unknown = Object.keys(values).find((k) => !allowed.has(k))
  if (unknown) throw new DodoError('usage', `unknown option "--${unknown}" for ${cmd.name}`)
  if (values.help && cmd.name !== 'help') positionals = [cmd.name]
  setEnv(values.env as string | undefined)

  const jsonMode = Boolean(values.json) || !process.stdout.isTTY
  const result = await runCommand(values.help ? 'help' : cmd.name, values, positionals)
  printResult(result, jsonMode)
}

main().catch((err: unknown) => {
  const known = err instanceof DodoError
  const code = known ? err.code : 'internal'
  const exit = known ? EXIT[err.code] : 1
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(JSON.stringify({ error: { code, message } }) + '\n')
  process.exit(exit)
})
