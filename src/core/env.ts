export type Env = 'dev' | 'prod'

export const ENVS: Env[] = ['dev', 'prod']
export const PROD_URL = 'https://dodo.andrewminghanjiang.com'
// Sent by `dodo --env dev` so a dev server switched to prod still answers from the local DB.
export const ENV_HEADER = 'X-Dodo-Env'
