import { expect, test, type TestBody } from 'claude-code/testing'

// O tsconfig não carrega libs de runtime (types: []); o runtime de teste tem setTimeout.
declare const setTimeout: (callback: (...args: never[]) => void, ms: number) => unknown

const ROOT = '/repo'
const P = `${ROOT}/docs/superpowers`
const FILES: Record<string, string> = {
  [`${P}/specs/2026-10-01-auth-design.md`]: '# auth',
  [`${P}/specs/2026-10-02-billing-design.md`]: '# billing',
  [`${P}/plans/2026-10-03-auth.md`]: '# Auth\n\n**Spec:** `docs/superpowers/specs/2026-10-01-auth-design.md`\n',
  [`${P}/plans/2026-10-03-auth.md.tasks.json`]: JSON.stringify({
    tasks: [
      { id: 0, subject: 'Task 0: Login', status: 'completed', description: '' },
      { id: 1, subject: 'Task 1: Refresh', status: 'pending', blockedBy: [0], description: '' },
      { id: 2, subject: 'Task 2: Gate E2E', status: 'pending', blockedBy: [1], description: '```json:metadata\n{"userGate": true}\n```' },
    ],
  }),
  [`${P}/plans/2026-09-02-hotfix.md`]: '# Hotfix',
}
const DIRS = new Set([`${ROOT}/docs`, P, `${P}/specs`, `${P}/plans`])

const PANE = {
  plugin: 'superpowers-panel',
  component: 'Pane',
  requestId: 'superpowers',
  props: {
    title: 'Superpowers',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const TOOLS = ['TaskCreate', 'TaskUpdate', 'TaskList', 'Skill', 'Read', 'Write', 'Edit']

const engine = (on: Parameters<TestBody>[1], taskList: unknown = { tasks: [] }, tools: readonly string[] = TOOLS) => {
  const opened: string[] = []
  on('tool.list', () => ({ value: tools.map(name => ({ name, description: name, mcp: false })) }))
  on('command.register', () => ({ value: { command: 'sp' } }))
  on('ui.open', (_, e) => { opened.push(e.id); return { value: { isPlaced: true } } })
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: opened.map(id => ({ id, title: 'Superpowers', isShown: true, isFocused: false, isPlaced: true })) }))
  on('session.root', () => ({ value: ROOT }))
  on('session.messages', () => ({ value: [] }))
  on('fs.exists', (_, e) => ({ value: e.path in FILES || DIRS.has(e.path) }))
  on('fs.list', (_, e) => {
    const prefix = `${e.path}/`
    const names = Object.keys(FILES).filter(path => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
    return { value: names.map(path => ({ name: path.slice(prefix.length), kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', (_, e) => {
    const text = FILES[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('tool.call', (_, e) => {
    if (!tools.includes(String(e.tool))) throw new Error(`no tool named "${String(e.tool)}"`)
    if (e.tool === 'TaskList') return taskList === 'deny' ? { deny: 'negado' } : { result: taskList }
    if (e.tool === 'TaskCreate') return { result: { task: { id: '42', subject: String((e as { subject?: unknown }).subject) } } }
    return { result: { success: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return opened
}

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

const settle = () => new Promise(resolve => setTimeout(resolve, 20))

test('abre o pane e mostra os alertas do projeto', async ($, on) => {
  const opened = engine(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  expect(opened).toContain('superpowers')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /spec\(s\) sem plano/ }))?.text).toBe('⚠ 1 spec(s) sem plano')
  expect((await ui.find({ type: 'Text', text: /billing/ }))?.text).toBe('  · 2026-10-02-billing-design.md')
  expect((await ui.find({ type: 'Text', text: /sem spec/ }))?.text).toBe('⚠ 1 plano(s) sem spec')
  await ui.unmount()
})

test('execução ao vivo: skill + TaskCreate/TaskUpdate mudam o pane', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  await $.tool.call({ tool: 'Skill', skill: 'superpowers-extended-cc:executing-plans', args: 'docs/superpowers/plans/2026-10-03-auth.md' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Task 1: Refresh', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '42', status: 'in_progress' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^Fase/ }))?.text).toBe('Fase: ▶ executing-plans')
  expect((await ui.find({ type: 'Text', text: /^Plano:/ }))?.text).toBe('Plano: 2026-10-03-auth.md  ███░░░░░░░ 1/3')
  expect((await ui.find({ type: 'Text', text: /T1 Refresh/ }))?.text).toBe('▶ T1 Refresh  em andamento')
  expect((await ui.find({ type: 'Text', text: /T2 Gate/ }))?.text).toBe('⊘ T2 Gate E2E  bloqueada por T1  🔒 user-gate')
  await ui.unmount()
})

test('/sp status e /sp sync', async ($, on) => {
  engine(on, { tasks: [{ id: '3', subject: 'Task 0: Login', status: 'completed', blockedBy: [] }] })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const sync = await $.command.run({ ...RUN, command: 'sp', args: 'sync' })
  expect(sync.text).toBe('Superpowers: sincronizado.')
  const status = await $.command.run({ ...RUN, command: 'sp', args: 'status' })
  expect(status.text?.split('\n')[0]).toBe('Fase: —')
  expect(status.text).toContain('PLANO ATUAL')
  const usage = await $.command.run({ ...RUN, command: 'sp', args: 'xyz' })
  expect(usage.text).toBe('Uso: /sp (abre/fecha o painel) · /sp status · /sp sync')
})

test('TaskList negado no backfill marca sincronização parcial', async ($, on) => {
  engine(on, 'deny')
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const status = await $.command.run({ ...RUN, command: 'sp', args: 'status' })
  expect(status.text).toContain('sincronização parcial')
})

test('sessão sem a ferramenta TaskList não marca sincronização parcial', async ($, on) => {
  engine(on, { tasks: [] }, ['Skill', 'Read', 'Write', 'Edit'])
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const status = await $.command.run({ ...RUN, command: 'sp', args: 'status' })
  expect(status.text).not.toContain('sincronização parcial')
})
