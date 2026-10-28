import { expect, test } from 'bun:test'

import { compareVersions, decideRelease, releaseTag } from './release-version'

const NAME = 'superpowers-panel'

test('releaseTag follows the plugin tag convention', () => {
  expect(releaseTag(NAME, '1.2.3')).toBe('superpowers-panel--v1.2.3')
})

test('compareVersions orders by major, minor, then patch', () => {
  expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0)
  expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
  expect(compareVersions('0.9.0', '1.0.0')).toBeLessThan(0)
})

test('the first version is released when there are no tags', () => {
  expect(decideRelease(NAME, '0.1.0', [])).toEqual({
    kind: 'release',
    version: '0.1.0',
    tag: 'superpowers-panel--v0.1.0',
  })
})

test('a version above the latest tag is released', () => {
  const tags = ['superpowers-panel--v0.1.0', 'superpowers-panel--v0.10.0', 'superpowers-panel--v0.2.0']
  expect(decideRelease(NAME, '0.10.1', tags)).toEqual({
    kind: 'release',
    version: '0.10.1',
    tag: 'superpowers-panel--v0.10.1',
  })
})

test('the same version as the latest tag is unchanged', () => {
  expect(decideRelease(NAME, '0.2.0', ['superpowers-panel--v0.2.0'])).toEqual({ kind: 'unchanged', version: '0.2.0' })
})

test('a version below the latest tag is a regression', () => {
  expect(decideRelease(NAME, '0.1.5', ['superpowers-panel--v0.2.0'])).toEqual({
    kind: 'regression',
    version: '0.1.5',
    latest: '0.2.0',
  })
})

test('tags of other plugins and malformed tags are ignored', () => {
  const tags = ['other--v9.0.0', 'v5.0.0', 'superpowers-panel--v1.0', 'superpowers-panel--v0.1.0-beta']
  expect(decideRelease(NAME, '0.1.0', tags).kind).toBe('release')
})

test('a malformed plugin.json version is rejected', () => {
  expect(() => decideRelease(NAME, '1.0', [])).toThrow('plugin.json version "1.0" is not MAJOR.MINOR.PATCH')
  expect(() => decideRelease(NAME, 'v1.0.0', [])).toThrow()
})
