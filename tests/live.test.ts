import { expect, test } from 'claude-code/testing'

import { applyEvent, EMPTY_LIVE, extractPlanPath, parsePromptSkill, replay, taskListOf, toolEvent } from '../hooks/live'

test('toolEvent reconhece as ferramentas relevantes', async () => {
  expect(toolEvent('TaskCreate', { subject: 'A' }, { task: { id: '1', subject: 'A' } })).toEqual({
    kind: 'create',
    id: '1',
    subject: 'A',
  })
  expect(toolEvent('TaskUpdate', { taskId: '1', status: 'completed' }, {})).toEqual({
    kind: 'update',
    id: '1',
    subject: undefined,
    status: 'completed',
    addBlockedBy: [],
  })
  expect(toolEvent('Skill', { skill: 'superpowers-extended-cc:brainstorming' }, {})).toEqual({
    kind: 'skill',
    skill: 'superpowers-extended-cc:brainstorming',
    args: undefined,
  })
  expect(toolEvent('Read', { file_path: '/r/docs/superpowers/plans/p.md.tasks.json' }, {})).toEqual({
    kind: 'touch',
    path: '/r/docs/superpowers/plans/p.md.tasks.json',
  })
  expect(toolEvent('Bash', { command: 'ls' }, {})).toBeUndefined()
})

test('applyEvent cria, atualiza e remove tarefas', async () => {
  let live = applyEvent(EMPTY_LIVE, { kind: 'create', id: '1', subject: 'A' })
  live = applyEvent(live, { kind: 'update', id: '1', status: 'in_progress', addBlockedBy: ['0'] })
  expect(live.sessionTasks['1']).toEqual({ id: '1', subject: 'A', status: 'in_progress', blockedBy: ['0'] })
  live = applyEvent(live, { kind: 'update', id: '1', status: 'deleted', addBlockedBy: [] })
  expect(live.sessionTasks['1']).toBeUndefined()
})

test('skill define fase e plano ativo; skill alheia é ignorada', async () => {
  let live = applyEvent(EMPTY_LIVE, {
    kind: 'skill',
    skill: 'superpowers-extended-cc:executing-plans',
    args: 'docs/superpowers/plans/2026-10-28-auth.md',
  })
  expect(live.phase).toBe('executing-plans')
  expect(live.activePlan).toBe('docs/superpowers/plans/2026-10-28-auth.md')
  live = applyEvent(live, { kind: 'skill', skill: 'frontend-design:frontend-design' })
  expect(live.phase).toBe('executing-plans')
})

test('tocar um .tasks.json define o plano ativo', async () => {
  const live = applyEvent(EMPTY_LIVE, { kind: 'touch', path: '/abs/docs/superpowers/plans/p.md.tasks.json' })
  expect(live.activePlan).toBe('docs/superpowers/plans/p.md')
  expect(applyEvent(EMPTY_LIVE, { kind: 'touch', path: '/abs/src/a.ts' })).toEqual(EMPTY_LIVE)
})

test('snapshot substitui as tarefas da sessão', async () => {
  const before = applyEvent(EMPTY_LIVE, { kind: 'create', id: '9', subject: 'velha' })
  const live = applyEvent(before, {
    kind: 'snapshot',
    tasks: [{ id: '1', subject: 'A', status: 'completed', blockedBy: [] }],
  })
  expect(Object.keys(live.sessionTasks)).toEqual(['1'])
})

test('taskListOf valida o resultado do TaskList', async () => {
  expect(taskListOf({ tasks: [{ id: '1', subject: 'A', status: 'pending', blockedBy: [] }] })).toEqual([
    { id: '1', subject: 'A', status: 'pending', blockedBy: [] },
  ])
  expect(taskListOf({})).toBeUndefined()
})

test('extractPlanPath e parsePromptSkill', async () => {
  expect(extractPlanPath('rodar `docs/superpowers/plans/x.md` agora')).toBe('docs/superpowers/plans/x.md')
  expect(extractPlanPath('/a/docs/superpowers/plans/x.md.tasks.json')).toBe('docs/superpowers/plans/x.md')
  expect(parsePromptSkill('/superpowers-extended-cc:writing-plans docs/a.md')).toEqual({
    skill: 'superpowers-extended-cc:writing-plans',
    args: 'docs/a.md',
  })
  expect(
    parsePromptSkill(
      '<command-name>/superpowers-extended-cc:brainstorming</command-name>\n<command-args>x</command-args>',
    ),
  ).toEqual({ skill: 'superpowers-extended-cc:brainstorming', args: 'x' })
  expect(parsePromptSkill('olá')).toBeUndefined()
})

test('replay reconstrói tarefas e fase do transcript', async () => {
  const live = replay([
    { role: 'user', text: '<command-name>/superpowers-extended-cc:brainstorming</command-name>', toolUses: [] },
    {
      role: 'assistant',
      text: '',
      toolUses: [
        {
          tool_use_id: 'a',
          tool: 'TaskCreate',
          input: { subject: 'Task 0: A' },
          result: { task: { id: '1', subject: 'Task 0: A' } },
        },
        {
          tool_use_id: 'b',
          tool: 'TaskUpdate',
          input: { taskId: '1', status: 'in_progress' },
          result: { success: true },
        },
        { tool_use_id: 'c', tool: 'TaskCreate', input: { subject: 'falhou' }, isError: true },
      ],
    },
  ])
  expect(live.phase).toBe('brainstorming')
  expect(Object.values(live.sessionTasks)).toEqual([
    { id: '1', subject: 'Task 0: A', status: 'in_progress', blockedBy: [] },
  ])
})

test('update de id desconhecido sem subject não cria tarefa', async () => {
  const live = applyEvent(EMPTY_LIVE, { kind: 'update', id: '3', status: 'in_progress', addBlockedBy: [] })
  expect(live.sessionTasks).toEqual({})
})

test('update de id desconhecido com subject cria a tarefa com esse subject', async () => {
  const live = applyEvent(EMPTY_LIVE, {
    kind: 'update',
    id: '3',
    subject: 'Nova',
    status: 'in_progress',
    addBlockedBy: [],
  })
  expect(live.sessionTasks['3']).toEqual({ id: '3', subject: 'Nova', status: 'in_progress', blockedBy: [] })
})

test('replay sem result no TaskCreate não vaza #id', async () => {
  const live = replay([
    {
      role: 'assistant',
      text: '',
      toolUses: [
        { tool_use_id: 'a', tool: 'TaskCreate', input: { subject: 'A' } },
        {
          tool_use_id: 'b',
          tool: 'TaskUpdate',
          input: { taskId: '1', status: 'in_progress' },
          result: { success: true },
        },
      ],
    },
  ])
  expect(Object.values(live.sessionTasks).filter(task => task.subject.startsWith('#'))).toEqual([])
})

test('replay ignora usos recusados (result em texto)', async () => {
  const live = replay([
    {
      role: 'assistant',
      text: '',
      toolUses: [
        { tool_use_id: 'a', tool: 'TaskCreate', input: { subject: 'A' }, result: { task: { id: '1', subject: 'A' } } },
        { tool_use_id: 'b', tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' }, result: 'denied' },
      ],
    },
  ])
  expect(live.sessionTasks['1']?.status).toBe('pending')
})
