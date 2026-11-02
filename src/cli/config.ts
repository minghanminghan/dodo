import { devStatePath, readDevState } from '../core/dev-state'
import { ENVS, PROD_URL } from '../core/env'
import type { Env } from '../core/env'
import { DodoError } from '../core/errors'

let env: Env | undefined

export function setEnv(value: string | undefined): void {
  if (value !== undefined && !ENVS.includes(value as Env)) throw new DodoError('usage', `--env must be one of: ${ENVS.join(', ')}`)
  env = value as Env | undefined
}

export function currentEnv(): Env | undefined {
  return env
}

// --env, then DODO_URL, then the prod server.
export function serverUrl(): string {
  if (env === 'prod') return PROD_URL
  if (env === 'dev') {
    const state = readDevState()
    if (!state) throw new DodoError('unavailable', `no dev server is running (${devStatePath()} is missing). Start one with: pnpm dev`)
    return state.url
  }
  return (process.env.DODO_URL || PROD_URL).replace(/\/+$/, '')
}
