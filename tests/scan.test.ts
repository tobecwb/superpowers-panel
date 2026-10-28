import { expect, test } from 'claude-code/testing'

import { coalesce, type FsLike, isSuperpowersPath, mergeWatchPaths, scanProject, watchTargets } from '../hooks/scan'

const fakeFs = (files: Record<string, string>, unreadable: string[] = []): FsLike => {
  const dirs = new Set<string>()
  for (const path of Object.keys(files)) {
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  return {
    exists: async path => path in files || dirs.has(path),
    list: async path => {
      const prefix = `${path}/`
      const names = new Set(
        [...Object.keys(files), ...dirs]
          .filter(one => one.startsWith(prefix))
          .map(one => one.slice(prefix.length).split('/')[0]!),
      )
      return [...names].map(name => ({ name, kind: `${prefix}${name}` in files ? 'file' : 'dir' }))
    },
    read: async path => {
      if (unreadable.includes(path) || !(path in files)) throw new Error('ENOENT')
      return files[path]!
    },
  }
}

const SUPERPOWERS_DIR = '/r/docs/superpowers'

test('without docs/superpowers', async () => {
  expect(await scanProject(fakeFs({ '/r/README.md': '' }), '/r', 5)).toEqual({
    specs: [],
    plans: [],
    scannedAt: 5,
    hasSuperpowersDir: false,
  })
})

test('docs/superpowers with no specs or plans', async () => {
  const project = await scanProject(fakeFs({ [`${SUPERPOWERS_DIR}/model-routing.json`]: '{}' }), '/r', 5)
  expect(project).toEqual({ specs: [], plans: [], scannedAt: 5, hasSuperpowersDir: true })
})

test('reads specs, plans and tasks.json states', async () => {
  const fs = fakeFs(
    {
      [`${SUPERPOWERS_DIR}/specs/2026-01-01-auth-design.md`]: '# a',
      [`${SUPERPOWERS_DIR}/plans/2026-01-02-auth.md`]:
        '# p\n\n**Spec:** `docs/superpowers/specs/2026-01-01-auth-design.md`',
      [`${SUPERPOWERS_DIR}/plans/2026-01-02-auth.md.tasks.json`]: JSON.stringify({
        tasks: [{ id: 0, subject: 'Task 0: A', status: 'completed' }],
      }),
      [`${SUPERPOWERS_DIR}/plans/2026-01-03-bad.md`]: '# b',
      [`${SUPERPOWERS_DIR}/plans/2026-01-03-bad.md.tasks.json`]: '{',
      [`${SUPERPOWERS_DIR}/plans/2026-01-04-gone.md`]: '# g',
      [`${SUPERPOWERS_DIR}/plans/2026-01-04-gone.md.tasks.json`]: '{"tasks": []}',
      [`${SUPERPOWERS_DIR}/plans/2026-01-05-none.md`]: '# n',
    },
    [`${SUPERPOWERS_DIR}/plans/2026-01-04-gone.md.tasks.json`],
  )
  const project = await scanProject(fs, '/r', 7)
  expect(project.specs).toEqual([
    { path: 'docs/superpowers/specs/2026-01-01-auth-design.md', slug: 'auth', date: '2026-01-01' },
  ])
  expect(project.plans.map(p => [p.path, p.tasksFile])).toEqual([
    ['docs/superpowers/plans/2026-01-02-auth.md', 'ok'],
    ['docs/superpowers/plans/2026-01-03-bad.md', 'invalid'],
    ['docs/superpowers/plans/2026-01-04-gone.md', 'invalid'],
    ['docs/superpowers/plans/2026-01-05-none.md', 'missing'],
  ])
  expect(project.plans[0]?.specRef).toBe('docs/superpowers/specs/2026-01-01-auth-design.md')
  expect(project.plans[0]?.tasks.length).toBe(1)
})

test('isSuperpowersPath', async () => {
  expect(isSuperpowersPath('/r/docs/superpowers/plans/a.md')).toBe(true)
  expect(isSuperpowersPath('/r/src/a.ts')).toBe(false)
  expect(isSuperpowersPath(undefined)).toBe(false)
})

test('coalesce serializes and merges requests', async () => {
  let runs = 0
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const run = coalesce(async (_input: number) => {
    runs++
    await gate
  })
  const firstRun = run(1)
  const secondRun = run(2)
  const thirdRun = run(3)
  release()
  await Promise.all([firstRun, secondRun, thirdRun])
  expect(runs).toBe(2)
})

test('tasks.json larger than 4 MiB is invalid', async () => {
  const big = `{"tasks": [], "pad": "${'x'.repeat(4 * 1024 * 1024 + 1)}"}`
  const project = await scanProject(
    fakeFs({
      [`${SUPERPOWERS_DIR}/plans/2026-01-06-big.md`]: '# b',
      [`${SUPERPOWERS_DIR}/plans/2026-01-06-big.md.tasks.json`]: big,
    }),
    '/r',
    1,
  )
  expect(project.plans[0]?.tasksFile).toBe('invalid')
  expect(project.plans[0]?.tasks).toEqual([])
})

test('watchTargets: watched folders of docs/superpowers', async () => {
  const expected = ['/r/docs/superpowers', '/r/docs/superpowers/specs', '/r/docs/superpowers/plans']
  expect(watchTargets('/r')).toEqual(expected)
  expect(watchTargets('/r/')).toEqual(expected)
})

test('mergeWatchPaths: existing first, no duplicates', async () => {
  expect(mergeWatchPaths(undefined, ['/a', '/b'])).toEqual(['/a', '/b'])
  expect(mergeWatchPaths(['/x', '/a'], ['/a', '/b'])).toEqual(['/x', '/a', '/b'])
  expect(mergeWatchPaths([], [])).toEqual([])
})
