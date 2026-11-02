import { get, set } from 'idb-keyval'
import { VERSION, compareVersions } from '@/core/version'
import type { IndexWithRev } from './api'
import { storageKey } from './env'

export type CachedIndex = { index: IndexWithRev; savedAt: number; version: string }

const KEY = () => storageKey('index')

export async function loadCachedIndex(): Promise<CachedIndex | null> {
  try {
    const c = (await get<CachedIndex>(KEY())) ?? null
    return c && compareVersions(c.version, VERSION) !== 'incompatible' ? c : null
  } catch {
    return null
  }
}

export async function saveCachedIndex(index: IndexWithRev): Promise<void> {
  try {
    await set(KEY(), { index, savedAt: Date.now(), version: VERSION })
  } catch {}
}
