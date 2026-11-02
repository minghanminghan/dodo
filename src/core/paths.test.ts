import { expect, test } from 'vitest'
import { DodoError } from './errors'
import { normalizePath, normalizeProject, titleOf } from './paths'

test('normalizePath', () => {
  expect(normalizePath('Deploy/Mini-PC/')).toBe('deploy/mini-pc')
  expect(normalizePath('/deploy/runbook.md')).toBe('deploy/runbook')
  expect(normalizePath('a.conflict-2')).toBe('a.conflict-2')
  for (const bad of ['', '../x', 'a//b', 'a/./b', 'a b', '-a', 'a/'.repeat(9) + 'z'])
    expect(() => normalizePath(bad)).toThrow(DodoError)
})
test('normalizeProject', () => {
  expect(normalizeProject('spar')).toBe('SPAR')
  for (const bad of ['', '1AB', 'TOOLONG7', 'A-B']) expect(() => normalizeProject(bad)).toThrow(DodoError)
})
test('titleOf', () => {
  expect(titleOf('deploy/mini-pc', '# Mini PC deploy\n\ntext')).toBe('Mini PC deploy')
  expect(titleOf('deploy/mini-pc', 'no heading')).toBe('mini-pc')
})
