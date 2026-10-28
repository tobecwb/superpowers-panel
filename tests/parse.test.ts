import { expect, test } from 'claude-code/testing'

import { parseMetadata, parseName, parseSpecRef, parseTasksFile } from '../hooks/parse'

test('parseName extracts date and slug, dropping -design', async () => {
  expect(parseName('2026-10-28-auth-design.md')).toEqual({ date: '2026-10-28', slug: 'auth' })
  expect(parseName('2026-10-28-auth.md')).toEqual({ date: '2026-10-28', slug: 'auth' })
  expect(parseName('notas.md')).toEqual({ date: '', slug: 'notas' })
})

test('parseSpecRef reads the **Spec:** line with or without backticks', async () => {
  expect(parseSpecRef('# P\n\n**Spec:** `docs/superpowers/specs/a-design.md`\n')).toBe(
    'docs/superpowers/specs/a-design.md',
  )
  expect(parseSpecRef('**Spec:** ./docs/superpowers/specs/a.md')).toBe('./docs/superpowers/specs/a.md')
  expect(parseSpecRef('# Sem spec')).toBeUndefined()
})

test('parseMetadata reads the json:metadata block and tolerates broken JSON', async () => {
  const ok = 'x\n\n```json:metadata\n{"userGate": true, "tags": ["a"]}\n```'
  expect(parseMetadata(ok)).toEqual({ userGate: true, tags: ['a'] })
  expect(parseMetadata('```json:metadata\n{quebrado\n```')).toBeUndefined()
  expect(parseMetadata('sem bloco')).toBeUndefined()
})

test('parseTasksFile reads the fork format', async () => {
  const text = JSON.stringify({
    planPath: 'docs/superpowers/plans/p.md',
    tasks: [
      {
        id: 0,
        subject: 'Task 0: A',
        status: 'completed',
        description: '```json:metadata\n{"tags": ["user-gate"]}\n```',
      },
      { id: 1, subject: 'Task 1: B', status: 'in_progress', blockedBy: [0], description: '' },
      { subject: 'Task 2: C', status: 'weird' },
    ],
  })
  expect(parseTasksFile(text)).toEqual([
    { id: 0, subject: 'Task 0: A', status: 'completed', blockedBy: [], userGate: true },
    { id: 1, subject: 'Task 1: B', status: 'in_progress', blockedBy: [0], userGate: false },
    { id: 2, subject: 'Task 2: C', status: 'pending', blockedBy: [], userGate: false },
  ])
})

test('parseTasksFile returns undefined for invalid JSON or no tasks', async () => {
  expect(parseTasksFile('{')).toBeUndefined()
  expect(parseTasksFile('{"x": 1}')).toBeUndefined()
  expect(parseTasksFile('null')).toBeUndefined()
})
