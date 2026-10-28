import { expect, test } from 'claude-code/testing'
import { messagesFor } from '../hooks/i18n'
import { buildPanel } from '../hooks/view-model'
import type { Live, PlanTask, Project } from '../types'

const planTask = (id: number, status: PlanTask['status'], extra: Partial<PlanTask> = {}): PlanTask => ({
  id,
  subject: `Task ${id}: Item ${id}`,
  status,
  blockedBy: [],
  userGate: false,
  ...extra,
})

const AUTH = 'docs/superpowers/plans/2026-01-02-auth.md'
const HOTFIX = 'docs/superpowers/plans/2026-01-03-hotfix.md'

const PROJECT: Project = {
  hasSuperpowersDir: true,
  scannedAt: 1,
  specs: [
    { path: 'docs/superpowers/specs/2026-01-01-auth-design.md', slug: 'auth', date: '2026-01-01' },
    { path: 'docs/superpowers/specs/2026-01-01-billing-design.md', slug: 'billing', date: '2026-01-01' },
  ],
  plans: [
    {
      path: AUTH,
      slug: 'auth',
      date: '2026-01-02',
      tasksFile: 'ok',
      tasks: [
        planTask(0, 'completed'),
        planTask(1, 'in_progress'),
        planTask(2, 'pending', { userGate: true }),
        planTask(3, 'pending'),
        planTask(4, 'pending', { blockedBy: [3] }),
      ],
    },
    { path: HOTFIX, slug: 'hotfix', date: '2026-01-03', tasksFile: 'missing', tasks: [] },
  ],
}

const LIVE: Live = {
  phase: 'executing-plans',
  activePlan: AUTH,
  sessionTasks: { '9': { id: '9', subject: 'Revisar', status: 'in_progress', blockedBy: [] } },
}

const UI = { expanded: [] as string[], selected: '' }
const PT = messagesFor('pt-BR')

test('buildPanel classifies the active plan rows', async () => {
  const model = buildPanel({ project: PROJECT, live: LIVE, ui: UI, messages: PT })
  expect(model.now).toEqual([
    { key: 'task:1', kind: 'running', text: 'T1 Item 1' },
    { key: 'task:2', kind: 'gate', text: 'T2 Item 2', note: 'aguarda você' },
  ])
  expect(model.next).toEqual([
    { key: 'task:3', kind: 'pending', text: 'T3 Item 3' },
    { key: 'task:4', kind: 'blocked', text: 'T4 Item 4', note: 'aguarda T3' },
  ])
  expect(model.done).toEqual({ label: '1 concluída', expanded: false, keys: ['task:0'], rows: [] })
  expect(model.outside).toEqual([{ key: 'session:9', kind: 'running', text: 'Revisar' }])
})

test('buildPanel expands the done group on request', async () => {
  const model = buildPanel({ project: PROJECT, live: LIVE, ui: { ...UI, expanded: ['done'] }, messages: PT })
  expect(model.done?.rows).toEqual([{ key: 'task:0', kind: 'done', text: 'T0 Item 0' }])
})

test('buildPanel header: phase badge, plan progress and warnings', async () => {
  const model = buildPanel({ project: PROJECT, live: { ...LIVE, syncNote: 'partial' }, ui: UI, messages: PT })
  expect(model.header).toEqual({
    phase: { label: 'Executando', tone: 'claude' },
    plan: { name: '2026-01-02-auth.md', shortName: 'auth', done: 1, total: 5 },
    syncWarning: '⚠ Algumas tarefas não puderam ser lidas — /sp sync',
  })
})

test('buildPanel maps every known phase and keeps unknown ones raw', async () => {
  const badge = (phase: string) =>
    buildPanel({ project: PROJECT, live: { ...LIVE, phase }, ui: UI, messages: PT }).header.phase
  expect(badge('brainstorming')).toEqual({ label: 'Brainstorming', tone: 'planMode' })
  expect(badge('writing-plans')).toEqual({ label: 'Planejando', tone: 'planMode' })
  expect(badge('subagent-driven-development')).toEqual({ label: 'Executando', tone: 'claude' })
  expect(badge('checking-gates')).toEqual({ label: 'Verificando gate', tone: 'permission' })
  expect(badge('receiving-code-review')).toEqual({ label: 'Em revisão', tone: 'suggestion' })
  expect(badge('systematic-debugging')).toEqual({ label: 'Depurando', tone: 'error' })
  expect(badge('onboard')).toEqual({ label: 'onboard', tone: 'subtle' })
})

test('buildPanel shows a hint when there is no flow', async () => {
  const model = buildPanel({ project: PROJECT, live: { sessionTasks: {} }, ui: UI, messages: PT })
  expect(model.header).toEqual({ hint: 'Comece com /superpowers-extended-cc:brainstorming' })
})

test('buildPanel project sections, keys and tones', async () => {
  const model = buildPanel({ project: PROJECT, live: LIVE, ui: UI, messages: PT })
  expect(model.sections.map(section => [section.id, section.icon, section.header, section.tone])).toEqual([
    ['specsWithoutPlan', '⚠', '1 spec sem plano', 'warning'],
    ['incomplete', '◐', '1 plano incompleto', 'suggestion'],
    ['withoutSpec', '⚠', '1 plano sem spec', 'warning'],
  ])
  expect(model.sections[0]!.items).toEqual([
    { key: 'spec:docs/superpowers/specs/2026-01-01-billing-design.md', label: '2026-01-01-billing-design.md' },
  ])
  expect(model.sections[1]!.items).toEqual([
    {
      key: `plan:${AUTH}`,
      label: '2026-01-02-auth.md',
      shortLabel: 'auth',
      planPath: AUTH,
      note: '1/5',
      progress: { done: 1, total: 5 },
      activity: 'running',
      current: 'T1',
    },
  ])
  expect(model.sections[2]!.items).toEqual([
    { key: `nospec:${HOTFIX}`, label: '2026-01-03-hotfix.md', shortLabel: 'hotfix', planPath: HOTFIX },
  ])
})

test('buildPanel marks running and gated plans and lists them first', async () => {
  const plan = (date: string, tasks: PlanTask[]): Project['plans'][number] => ({
    path: `docs/superpowers/plans/${date}-p.md`,
    slug: 'p',
    date,
    tasksFile: 'ok',
    tasks,
  })
  const project: Project = {
    hasSuperpowersDir: true,
    scannedAt: 1,
    specs: [],
    plans: [
      plan('2026-01-01', [
        planTask(0, 'completed'),
        planTask(1, 'pending', { blockedBy: [3] }),
        planTask(3, 'pending'),
      ]),
      plan('2026-01-02', [planTask(0, 'completed'), planTask(1, 'pending', { userGate: true })]),
      plan('2026-01-03', [planTask(0, 'completed'), planTask(4, 'in_progress'), planTask(5, 'pending')]),
    ],
  }
  const model = buildPanel({ project, live: { sessionTasks: {} }, ui: UI, messages: PT })
  const incomplete = model.sections.find(section => section.id === 'incomplete')!
  expect(incomplete.items.map(item => [item.label, item.activity, item.current, item.progress])).toEqual([
    ['2026-01-03-p.md', 'running', 'T4', { done: 1, total: 3 }],
    ['2026-01-02-p.md', 'gate', 'T1', { done: 1, total: 2 }],
    ['2026-01-01-p.md', undefined, undefined, { done: 1, total: 3 }],
  ])
})

test('buildPanel hides plans without tasks.json from the incomplete list, not invalid ones', async () => {
  const project: Project = {
    ...PROJECT,
    plans: [
      ...PROJECT.plans,
      {
        path: 'docs/superpowers/plans/2026-01-04-broken.md',
        slug: 'broken',
        date: '2026-01-04',
        tasksFile: 'invalid',
        tasks: [],
      },
    ],
  }
  const model = buildPanel({ project, live: LIVE, ui: UI, messages: PT })
  const incomplete = model.sections.find(section => section.id === 'incomplete')!
  expect(incomplete.items.map(item => [item.label, item.note])).toEqual([
    ['2026-01-02-auth.md', '1/5'],
    ['2026-01-04-broken.md', 'tasks.json inválido'],
  ])
  const withoutSpec = model.sections.find(section => section.id === 'withoutSpec')!
  expect(withoutSpec.items.map(item => item.label)).toContain('2026-01-03-hotfix.md')
})

test('buildPanel detail expands its own done group', async () => {
  const model = buildPanel({
    project: PROJECT,
    live: LIVE,
    ui: { selected: AUTH, expanded: ['detail-done'] },
    messages: PT,
  })
  expect(model.detail?.done?.expanded).toBe(true)
  expect(model.detail?.done?.rows).toEqual([{ key: 'task:0', kind: 'done', text: 'T0 Item 0' }])
  expect(model.done?.expanded).toBe(false)
})

test('buildPanel complete section is collapsible and follows the expanded list', async () => {
  const done: Project = {
    ...PROJECT,
    plans: [{ path: AUTH, slug: 'auth', date: '2026-01-02', tasksFile: 'ok', tasks: [planTask(0, 'completed')] }],
  }
  const closed = buildPanel({ project: done, live: { sessionTasks: {} }, ui: UI, messages: PT })
  const complete = closed.sections.find(section => section.id === 'complete')!
  expect(complete.items[0]?.progress).toEqual({ done: 1, total: 1 })
  expect([complete.header, complete.tone, complete.collapsible, complete.expanded]).toEqual([
    '1 plano concluído',
    'success',
    true,
    false,
  ])
  const open = buildPanel({
    project: done,
    live: { sessionTasks: {} },
    ui: { ...UI, expanded: ['complete'] },
    messages: PT,
  })
  expect(open.sections.find(section => section.id === 'complete')!.expanded).toBe(true)
})

test('buildPanel detail of the selected plan; a vanished selection shows none', async () => {
  const model = buildPanel({ project: PROJECT, live: LIVE, ui: { ...UI, selected: AUTH }, messages: PT })
  expect(model.detail?.title).toBe('2026-01-02-auth.md')
  expect(model.detail?.shortTitle).toBe('auth')
  expect(model.detail?.note).toBe('1/5')
  expect(model.detail?.specLine).toBe('Spec: 2026-01-01-auth-design.md')
  expect(model.detail?.rows.map(row => row.key)).toEqual(['task:1', 'task:2', 'task:3', 'task:4'])
  expect(model.detail?.done).toEqual({ label: '1 concluída', expanded: false, keys: ['task:0'], rows: [] })
  const gone = buildPanel({ project: PROJECT, live: LIVE, ui: { ...UI, selected: 'docs/x.md' }, messages: PT })
  expect(gone.detail).toBeUndefined()
})

test('buildPanel active plan without tasks keeps a zero total', async () => {
  const model = buildPanel({ project: PROJECT, live: { sessionTasks: {}, activePlan: HOTFIX }, ui: UI, messages: PT })
  expect(model.header.plan).toEqual({ name: '2026-01-03-hotfix.md', shortName: 'hotfix', done: 0, total: 0 })
  expect(model.now).toEqual([])
  expect(model.done).toBeUndefined()
})

test('buildPanel in English', async () => {
  const model = buildPanel({ project: PROJECT, live: LIVE, ui: UI, messages: messagesFor('en') })
  expect(model.header.phase).toEqual({ label: 'Executing', tone: 'claude' })
  expect(model.now[1]?.note).toBe('waiting on you')
  expect(model.next[1]?.note).toBe('waiting on T3')
  expect(model.sections[1]!.header).toBe('1 incomplete plan')
  expect(model.labels.next).toBe('Up next')
})

test('buildPanel flags an empty project', async () => {
  const empty: Project = { specs: [], plans: [], scannedAt: 0, hasSuperpowersDir: false }
  expect(buildPanel({ project: empty, live: { sessionTasks: {} }, ui: UI, messages: PT }).isEmpty).toBe(true)
  expect(buildPanel({ project: PROJECT, live: LIVE, ui: UI, messages: PT }).isEmpty).toBe(false)
})
