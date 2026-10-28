import { expect, test } from 'claude-code/testing'
import { activePlanPath, derive, groupTasks, linkPlan } from '../hooks/link'
import type { Live, Plan, PlanTask, Project } from '../types'

const task = (id: number, status: PlanTask['status'], blockedBy: number[] = []): PlanTask => ({
  id,
  subject: `Task ${id}: T${id}`,
  status,
  blockedBy,
  userGate: false,
})

const plan = (over: Partial<Plan>): Plan => ({
  path: 'docs/superpowers/plans/2026-01-01-x.md',
  slug: 'x',
  date: '2026-01-01',
  tasksFile: 'ok',
  tasks: [],
  ...over,
})

const SPECS = [
  { path: 'docs/superpowers/specs/2026-01-01-auth-design.md', slug: 'auth', date: '2026-01-01' },
  { path: 'docs/superpowers/specs/2026-01-02-billing-design.md', slug: 'billing', date: '2026-01-02' },
]
const EMPTY: Live = { sessionTasks: {} }

test('linkPlan uses **Spec:** with ./ or just the name, and falls back to the slug', async () => {
  expect(linkPlan(plan({ specRef: './docs/superpowers/specs/2026-01-01-auth-design.md' }), SPECS).spec?.slug).toBe(
    'auth',
  )
  expect(linkPlan(plan({ specRef: '2026-01-02-billing-design.md' }), SPECS).spec?.slug).toBe('billing')
  expect(linkPlan(plan({ specRef: 'docs/nao-existe.md' }), SPECS)).toEqual({ specMissing: true })
  expect(linkPlan(plan({ slug: 'auth' }), SPECS).spec?.slug).toBe('auth')
  expect(linkPlan(plan({ slug: 'zzz' }), SPECS)).toEqual({ specMissing: false })
})

test('derive classifies the project alerts', async () => {
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
  const derived = derive(project, EMPTY)
  expect(derived.specsWithoutPlan.map(s => s.slug)).toEqual(['billing'])
  expect(derived.incomplete.map(p => p.slug)).toEqual(['auth', 'miss', 'empty'])
  expect(derived.incomplete.find(p => p.slug === 'miss')?.tasksFile).toBe('missing')
  expect(derived.withoutSpec.map(p => p.slug)).toEqual(['hotfix', 'miss', 'empty'])
  expect(derived.complete.map(p => p.slug)).toEqual(['hotfix'])
  expect(derived.active).toBeUndefined()
})

test('active plan: explicit, otherwise largest subject intersection', async () => {
  const planA = plan({ path: 'docs/superpowers/plans/a.md', tasks: [task(0, 'pending'), task(1, 'pending')] })
  const planB = plan({ path: 'docs/superpowers/plans/b.md', tasks: [task(5, 'pending')] })
  expect(activePlanPath([planA, planB], { sessionTasks: {}, activePlan: 'docs/superpowers/plans/b.md' })).toBe(
    'docs/superpowers/plans/b.md',
  )
  const live: Live = { sessionTasks: { '7': { id: '7', subject: 'Task 0: T0', status: 'in_progress', blockedBy: [] } } }
  expect(activePlanPath([planA, planB], live)).toBe('docs/superpowers/plans/a.md')
  expect(activePlanPath([planA, planB], EMPTY)).toBeUndefined()
})

test('an intersection tie prefers the newer plan', async () => {
  const planA = plan({ path: 'docs/superpowers/plans/2026-01-01-a.md', tasks: [task(0, 'pending')] })
  const planB = plan({ path: 'docs/superpowers/plans/2026-02-01-b.md', tasks: [task(0, 'pending')] })
  const live: Live = { sessionTasks: { '7': { id: '7', subject: 'Task 0: T0', status: 'pending', blockedBy: [] } } }
  expect(activePlanPath([planA, planB], live)).toBe('docs/superpowers/plans/2026-02-01-b.md')
})

test('native status wins in the active plan and the rest goes to outside', async () => {
  const project: Project = {
    hasSuperpowersDir: true,
    scannedAt: 1,
    specs: [],
    plans: [plan({ tasks: [task(0, 'pending'), task(1, 'pending')] })],
  }
  const live: Live = {
    activePlan: 'docs/superpowers/plans/2026-01-01-x.md',
    sessionTasks: {
      '3': { id: '3', subject: 'Task 0: T0', status: 'completed', blockedBy: [] },
      '9': { id: '9', subject: 'Revisar spec', status: 'pending', blockedBy: [] },
    },
  }
  const derived = derive(project, live)
  expect(derived.active?.done).toBe(1)
  expect(derived.active?.total).toBe(2)
  expect(derived.outside.map(t => t.subject)).toEqual(['Revisar spec'])
})

test('groupTasks splits groups and ignores a nonexistent dependency', async () => {
  const tasks = [task(0, 'completed'), task(1, 'in_progress'), task(2, 'pending', [1]), task(3, 'pending', [99])]
  const groups = groupTasks(tasks)
  expect(groups.running.map(t => t.id)).toEqual([1])
  expect(groups.blocked.map(t => t.id)).toEqual([2])
  expect(groups.pending.map(t => t.id)).toEqual([3])
  expect(groups.done.map(t => t.id)).toEqual([0])
})
