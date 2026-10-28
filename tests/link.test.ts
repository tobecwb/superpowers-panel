import { expect, test } from 'claude-code/testing'

import type { Live, Plan, PlanTask, Project } from '../types'
import { activePlanPath, derive, groupTasks, linkPlan } from '../hooks/link'

const task = (id: number, status: PlanTask['status'], blockedBy: number[] = []): PlanTask =>
  ({ id, subject: `Task ${id}: T${id}`, status, blockedBy, userGate: false })

const plan = (over: Partial<Plan>): Plan =>
  ({ path: 'docs/superpowers/plans/2026-01-01-x.md', slug: 'x', date: '2026-01-01', tasksFile: 'ok', tasks: [], ...over })

const SPECS = [
  { path: 'docs/superpowers/specs/2026-01-01-auth-design.md', slug: 'auth', date: '2026-01-01' },
  { path: 'docs/superpowers/specs/2026-01-02-billing-design.md', slug: 'billing', date: '2026-01-02' },
]
const EMPTY: Live = { sessionTasks: {} }

test('linkPlan usa **Spec:** com ./ ou só o nome, e cai para o slug', async () => {
  expect(linkPlan(plan({ specRef: './docs/superpowers/specs/2026-01-01-auth-design.md' }), SPECS).spec?.slug).toBe('auth')
  expect(linkPlan(plan({ specRef: '2026-01-02-billing-design.md' }), SPECS).spec?.slug).toBe('billing')
  expect(linkPlan(plan({ specRef: 'docs/nao-existe.md' }), SPECS)).toEqual({ specMissing: true })
  expect(linkPlan(plan({ slug: 'auth' }), SPECS).spec?.slug).toBe('auth')
  expect(linkPlan(plan({ slug: 'zzz' }), SPECS)).toEqual({ specMissing: false })
})

test('derive classifica os alertas do projeto', async () => {
  const project: Project = {
    hasSuperpowersDir: true,
    scannedAt: 1,
    specs: SPECS,
    plans: [
      plan({ path: 'docs/superpowers/plans/a.md', slug: 'auth', tasks: [task(0, 'completed'), task(1, 'pending')] }),
      plan({ path: 'docs/superpowers/plans/h.md', slug: 'hotfix', tasks: [task(0, 'completed')] }),
      plan({ path: 'docs/superpowers/plans/m.md', slug: 'miss', tasksFile: 'missing' }),
      plan({ path: 'docs/superpowers/plans/e.md', slug: 'empty', tasks: [] }),
    ],
  }
  const d = derive(project, EMPTY)
  expect(d.specsWithoutPlan.map(s => s.slug)).toEqual(['billing'])
  expect(d.incomplete.map(p => p.slug)).toEqual(['auth', 'miss', 'empty'])
  expect(d.incomplete.find(p => p.slug === 'miss')?.label).toBe('sem tasks.json')
  expect(d.withoutSpec.map(p => p.slug)).toEqual(['hotfix', 'miss', 'empty'])
  expect(d.complete.map(p => p.slug)).toEqual(['hotfix'])
  expect(d.active).toBeUndefined()
})

test('plano ativo: explícito, senão maior interseção de subjects', async () => {
  const a = plan({ path: 'docs/superpowers/plans/a.md', tasks: [task(0, 'pending'), task(1, 'pending')] })
  const b = plan({ path: 'docs/superpowers/plans/b.md', tasks: [task(5, 'pending')] })
  expect(activePlanPath([a, b], { sessionTasks: {}, activePlan: 'docs/superpowers/plans/b.md' })).toBe('docs/superpowers/plans/b.md')
  const live: Live = { sessionTasks: { '7': { id: '7', subject: 'Task 0: T0', status: 'in_progress', blockedBy: [] } } }
  expect(activePlanPath([a, b], live)).toBe('docs/superpowers/plans/a.md')
  expect(activePlanPath([a, b], EMPTY)).toBeUndefined()
})

test('empate de interseção prefere o plano mais novo', async () => {
  const a = plan({ path: 'docs/superpowers/plans/2026-01-01-a.md', tasks: [task(0, 'pending')] })
  const b = plan({ path: 'docs/superpowers/plans/2026-02-01-b.md', tasks: [task(0, 'pending')] })
  const live: Live = { sessionTasks: { '7': { id: '7', subject: 'Task 0: T0', status: 'pending', blockedBy: [] } } }
  expect(activePlanPath([a, b], live)).toBe('docs/superpowers/plans/2026-02-01-b.md')
})

test('status nativo prevalece no plano ativo e o resto vai para outside', async () => {
  const project: Project = {
    hasSuperpowersDir: true, scannedAt: 1, specs: [],
    plans: [plan({ tasks: [task(0, 'pending'), task(1, 'pending')] })],
  }
  const live: Live = {
    activePlan: 'docs/superpowers/plans/2026-01-01-x.md',
    sessionTasks: {
      '3': { id: '3', subject: 'Task 0: T0', status: 'completed', blockedBy: [] },
      '9': { id: '9', subject: 'Revisar spec', status: 'pending', blockedBy: [] },
    },
  }
  const d = derive(project, live)
  expect(d.active?.done).toBe(1)
  expect(d.active?.total).toBe(2)
  expect(d.outside.map(t => t.subject)).toEqual(['Revisar spec'])
})

test('groupTasks separa grupos e ignora dependência inexistente', async () => {
  const tasks = [task(0, 'completed'), task(1, 'in_progress'), task(2, 'pending', [1]), task(3, 'pending', [99])]
  const g = groupTasks(tasks)
  expect(g.running.map(t => t.id)).toEqual([1])
  expect(g.blocked.map(t => t.id)).toEqual([2])
  expect(g.pending.map(t => t.id)).toEqual([3])
  expect(g.done.map(t => t.id)).toEqual([0])
})
