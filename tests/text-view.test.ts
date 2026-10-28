import { expect, test } from 'claude-code/testing'
import { messagesFor } from '../hooks/i18n'
import { bar, textView } from '../hooks/text-view'
import { buildPanel } from '../hooks/view-model'
import type { Live, Project } from '../types'

const AUTH = 'docs/superpowers/plans/2026-01-02-auth.md'

const PROJECT: Project = {
  hasSuperpowersDir: true,
  scannedAt: 1,
  specs: [{ path: 'docs/superpowers/specs/2026-01-01-billing-design.md', slug: 'billing', date: '2026-01-01' }],
  plans: [
    {
      path: AUTH,
      slug: 'auth',
      date: '2026-01-02',
      tasksFile: 'ok',
      tasks: [
        { id: 0, subject: 'Task 0: Login', status: 'completed', blockedBy: [], userGate: false },
        { id: 1, subject: 'Task 1: Refresh', status: 'in_progress', blockedBy: [], userGate: false },
      ],
    },
  ],
}

const LIVE: Live = {
  phase: 'executing-plans',
  activePlan: AUTH,
  sessionTasks: { '5': { id: '5', subject: 'Revisar', status: 'pending', blockedBy: [] } },
}

const UI = { expanded: [], selected: '' }

test('bar', async () => {
  expect(bar(7, 9)).toBe('████████░░')
  expect(bar(0, 0)).toBe('░░░░░░░░░░')
  expect(bar(9, 9)).toBe('██████████')
})

test('textView in Portuguese', async () => {
  const messages = messagesFor('pt-BR')
  expect(textView(buildPanel({ project: PROJECT, live: LIVE, ui: UI, messages }))).toBe(
    [
      'Fase: Executando',
      'Plano: 2026-01-02-auth.md  █████░░░░░ 1/2',
      '',
      'Agora',
      '▶ T1 Refresh',
      '',
      '✓ 1 concluída',
      '',
      'Fora do plano',
      '○ Revisar',
      '',
      'Projeto',
      '⚠ 1 spec sem plano',
      '  · 2026-01-01-billing-design.md',
      '◐ 1 plano incompleto',
      '  ▶ 2026-01-02-auth.md  █████░░░░░ 1/2 · T1',
      '⚠ 1 plano sem spec',
      '  · 2026-01-02-auth.md',
    ].join('\n'),
  )
})

test('textView in English with no flow and an empty project', async () => {
  const messages = messagesFor('en')
  const project: Project = { specs: [], plans: [], scannedAt: 0, hasSuperpowersDir: true }
  expect(textView(buildPanel({ project, live: { sessionTasks: {} }, ui: UI, messages }))).toBe(
    ['Phase: —', '', 'Project', 'No specs or plans yet.'].join('\n'),
  )
  const none: Project = { ...project, hasSuperpowersDir: false }
  expect(textView(buildPanel({ project: none, live: { sessionTasks: {} }, ui: UI, messages }))).toBe(
    'No superpowers data in this project.',
  )
})

test('textView keeps a zero-task plan readable', async () => {
  const project: Project = {
    ...PROJECT,
    plans: [{ path: AUTH, slug: 'auth', date: '2026-01-02', tasksFile: 'missing', tasks: [] }],
  }
  const text = textView(
    buildPanel({ project, live: { sessionTasks: {}, activePlan: AUTH }, ui: UI, messages: messagesFor('pt-BR') }),
  )
  expect(text).toContain('Plano: 2026-01-02-auth.md  ░░░░░░░░░░ 0/0')
  expect(text).not.toContain('NaN')
})

test('textView shows the sync warning', async () => {
  const text = textView(
    buildPanel({ project: PROJECT, live: { ...LIVE, syncNote: 'partial' }, ui: UI, messages: messagesFor('pt-BR') }),
  )
  expect(text.split('\n')[2]).toBe('⚠ Algumas tarefas não puderam ser lidas — /sp sync')
})
