import { expect, test } from 'claude-code/testing'
import { derive } from '../hooks/link'
import { bar, detailLines, displaySubject, projectSections, summarize, taskLine } from '../hooks/summary'
import type { Live, PlanTask, Project } from '../types'

const planTask = (id: number, status: PlanTask['status'], extra: Partial<PlanTask> = {}): PlanTask => ({
  id,
  subject: `Task ${id}: Item ${id}`,
  status,
  blockedBy: [],
  userGate: false,
  ...extra,
})

test('displaySubject strips the Task N: prefix', async () => {
  expect(displaySubject('Task 3: Faz algo')).toBe('Faz algo')
  expect(displaySubject('Livre')).toBe('Livre')
})

test('taskLine by status', async () => {
  const tasks = [
    planTask(1, 'completed'),
    planTask(8, 'in_progress'),
    planTask(9, 'pending', { userGate: true }),
    planTask(10, 'pending', { blockedBy: [9] }),
  ]
  expect(taskLine(tasks[0]!, tasks)).toBe('✓ T1 Item 1')
  expect(taskLine(tasks[1]!, tasks)).toBe('▶ T8 Item 8  em andamento')
  expect(taskLine(tasks[2]!, tasks)).toBe('○ T9 Item 9  🔒 user-gate')
  expect(taskLine(tasks[3]!, tasks)).toBe('⊘ T10 Item 10  bloqueada por T9')
})

test('bar', async () => {
  expect(bar(7, 9)).toBe('████████░░')
  expect(bar(0, 0)).toBe('░░░░░░░░░░')
  expect(bar(9, 9)).toBe('██████████')
})

test('summarize with no data', async () => {
  const project: Project = { specs: [], plans: [], scannedAt: 0, hasSuperpowersDir: false }
  const live: Live = { sessionTasks: {} }
  expect(summarize(derive(project, live), project, live)).toBe('Nenhum dado superpowers neste projeto.')
})

test('summarize complete', async () => {
  const project: Project = {
    hasSuperpowersDir: true,
    scannedAt: 1,
    specs: [{ path: 'docs/superpowers/specs/2026-01-01-billing-design.md', slug: 'billing', date: '2026-01-01' }],
    plans: [
      {
        path: 'docs/superpowers/plans/2026-01-02-auth.md',
        slug: 'auth',
        date: '2026-01-02',
        tasksFile: 'ok',
        tasks: [planTask(0, 'completed'), planTask(1, 'in_progress')],
      },
    ],
  }
  const live: Live = {
    phase: 'executing-plans',
    activePlan: 'docs/superpowers/plans/2026-01-02-auth.md',
    sessionTasks: { '5': { id: '5', subject: 'Revisar', status: 'pending', blockedBy: [] } },
  }
  expect(summarize(derive(project, live), project, live)).toBe(
    [
      'Fase: ▶ executing-plans',
      'Plano: 2026-01-02-auth.md  █████░░░░░ 1/2',
      '',
      'PLANO ATUAL',
      '▶ T1 Item 1  em andamento',
      '✓ T0 Item 0',
      '',
      'FORA DO PLANO (sessão)',
      '○ Revisar',
      '',
      'PROJETO',
      '⚠ 1 spec(s) sem plano',
      '  · 2026-01-01-billing-design.md',
      '◐ 1 plano(s) incompleto(s)',
      '  · 2026-01-02-auth.md  █████░░░░░ 1/2',
      '⚠ 1 plano(s) sem spec',
      '  · 2026-01-02-auth.md',
    ].join('\n'),
  )
})

test('summarize: PROJETO items with a bar; label when there is no tasks.json', async () => {
  const project: Project = {
    hasSuperpowersDir: true,
    scannedAt: 1,
    specs: [],
    plans: [
      {
        path: 'docs/superpowers/plans/2026-01-02-auth.md',
        slug: 'auth',
        date: '2026-01-02',
        tasksFile: 'ok',
        tasks: [planTask(0, 'completed'), planTask(1, 'completed')],
      },
      {
        path: 'docs/superpowers/plans/2026-01-03-hotfix.md',
        slug: 'hotfix',
        date: '2026-01-03',
        tasksFile: 'missing',
        tasks: [],
      },
    ],
  }
  const live: Live = { sessionTasks: {} }
  const text = summarize(derive(project, live), project, live)
  expect(text).toContain('◐ 1 plano(s) incompleto(s)\n  · 2026-01-03-hotfix.md  sem tasks.json')
  expect(text).toContain('✓ 1 plano(s) concluído(s)\n  · 2026-01-02-auth.md  ██████████ 2/2')
})

test('detailLines: plan ok, spec missing, no spec, no tasks.json', async () => {
  const project: Project = {
    hasSuperpowersDir: true,
    scannedAt: 1,
    specs: [{ path: 'docs/superpowers/specs/2026-01-01-auth-design.md', slug: 'auth', date: '2026-01-01' }],
    plans: [
      {
        path: 'docs/superpowers/plans/2026-01-02-auth.md',
        slug: 'auth',
        date: '2026-01-02',
        tasksFile: 'ok',
        tasks: [
          planTask(0, 'completed'),
          planTask(1, 'pending'),
          planTask(2, 'pending', { blockedBy: [1] }),
          planTask(3, 'in_progress'),
        ],
      },
      {
        path: 'docs/superpowers/plans/2026-01-03-pay.md',
        slug: 'pay',
        date: '2026-01-03',
        tasksFile: 'ok',
        specRef: 'docs/superpowers/specs/2026-01-01-pay-design.md',
        tasks: [planTask(0, 'completed')],
      },
      {
        path: 'docs/superpowers/plans/2026-01-04-misc.md',
        slug: 'misc',
        date: '2026-01-04',
        tasksFile: 'ok',
        tasks: [planTask(0, 'pending')],
      },
      {
        path: 'docs/superpowers/plans/2026-01-05-hotfix.md',
        slug: 'hotfix',
        date: '2026-01-05',
        tasksFile: 'missing',
        tasks: [],
      },
    ],
  }
  const live: Live = { sessionTasks: {} }
  const derived = derive(project, live)
  const view = (name: string) => [...derived.incomplete, ...derived.complete].find(plan => plan.path.endsWith(name))!
  expect(detailLines(view('auth.md'))).toEqual([
    '2026-01-02-auth.md  ███░░░░░░░ 1/4',
    'Spec: 2026-01-01-auth-design.md',
    '▶ T3 Item 3  em andamento',
    '○ T1 Item 1',
    '⊘ T2 Item 2  bloqueada por T1',
    '✓ T0 Item 0',
  ])
  expect(detailLines(view('pay.md'))).toEqual([
    '2026-01-03-pay.md  ██████████ 1/1',
    'Spec: ausente (docs/superpowers/specs/2026-01-01-pay-design.md)',
    '✓ T0 Item 0',
  ])
  expect(detailLines(view('misc.md'))).toEqual(['2026-01-04-misc.md  ░░░░░░░░░░ 0/1', 'Spec: —', '○ T0 Item 0'])
  expect(detailLines(view('hotfix.md'))).toEqual(['2026-01-05-hotfix.md  sem tasks.json', 'Spec: —'])
})

test('projectSections lists non-empty sections in display order', async () => {
  const project: Project = {
    hasSuperpowersDir: true,
    scannedAt: 0,
    specs: [{ path: 'docs/superpowers/specs/2026-01-01-orphan-design.md', slug: 'orphan', date: '2026-01-01' }],
    plans: [
      {
        path: 'docs/superpowers/plans/2026-01-02-done.md',
        slug: 'done',
        date: '2026-01-02',
        tasksFile: 'ok',
        tasks: [planTask(0, 'completed')],
      },
      {
        path: 'docs/superpowers/plans/2026-01-03-hotfix.md',
        slug: 'hotfix',
        date: '2026-01-03',
        tasksFile: 'missing',
        tasks: [],
      },
    ],
  }
  const sections = projectSections(derive(project, { sessionTasks: {} }))

  expect(sections.map(section => section.id)).toEqual(['specsWithoutPlan', 'incomplete', 'withoutSpec', 'complete'])
  expect(sections.map(section => section.header)).toEqual([
    '⚠ 1 spec(s) sem plano',
    '◐ 1 plano(s) incompleto(s)',
    '⚠ 2 plano(s) sem spec',
    '✓ 1 plano(s) concluído(s)',
  ])
  expect(sections[0]!.items).toEqual([{ label: '  · 2026-01-01-orphan-design.md' }])
  expect(sections[1]!.items).toEqual([
    { label: '  · 2026-01-03-hotfix.md  sem tasks.json', planPath: 'docs/superpowers/plans/2026-01-03-hotfix.md' },
  ])
  expect(sections[3]!.collapsible).toBe(true)
  expect(projectSections(derive({ ...project, specs: [], plans: [] }, { sessionTasks: {} }))).toEqual([])
})
