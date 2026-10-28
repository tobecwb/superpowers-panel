import { expect, type TestBody, test } from 'claude-code/testing'

// The tsconfig loads no runtime libs (types: []); the test runtime does have setTimeout.
declare const setTimeout: (callback: (...args: never[]) => void, ms: number) => unknown

const ROOT = '/repo'
const SUPERPOWERS_DIR = `${ROOT}/docs/superpowers`
const FILES: Record<string, string> = {
  [`${SUPERPOWERS_DIR}/specs/2026-10-01-auth-design.md`]: '# auth',
  [`${SUPERPOWERS_DIR}/specs/2026-10-02-billing-design.md`]: '# billing',
  [`${SUPERPOWERS_DIR}/plans/2026-10-03-auth.md`]:
    '# Auth\n\n**Spec:** `docs/superpowers/specs/2026-10-01-auth-design.md`\n',
  [`${SUPERPOWERS_DIR}/plans/2026-10-03-auth.md.tasks.json`]: JSON.stringify({
    tasks: [
      { id: 0, subject: 'Task 0: Login', status: 'completed', description: '' },
      { id: 1, subject: 'Task 1: Refresh', status: 'pending', blockedBy: [0], description: '' },
      {
        id: 2,
        subject: 'Task 2: Gate E2E',
        status: 'pending',
        blockedBy: [1],
        description: '```json:metadata\n{"userGate": true}\n```',
      },
    ],
  }),
  [`${SUPERPOWERS_DIR}/plans/2026-09-02-hotfix.md`]: '# Hotfix',
}
const DIRS = new Set([`${ROOT}/docs`, SUPERPOWERS_DIR, `${SUPERPOWERS_DIR}/specs`, `${SUPERPOWERS_DIR}/plans`])

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

const engine = (
  on: Parameters<TestBody>[1],
  taskList: unknown = { tasks: [] },
  tools: readonly string[] = TOOLS,
  files: Record<string, string> = FILES,
) => {
  const opened: string[] = []
  let lists = 0
  on('tool.list', () => ({ value: tools.map(name => ({ name, description: name, mcp: false })) }))
  on('command.register', () => ({ value: { command: 'sp' } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({
    value: opened.map(id => ({ id, title: 'Superpowers', isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('session.root', () => ({ value: ROOT }))
  on('session.messages', () => ({ value: [] }))
  on('fs.exists', (_, e) => ({ value: e.path in files || DIRS.has(e.path) }))
  on('fs.list', (_, e) => {
    lists++
    const prefix = `${e.path}/`
    const names = Object.keys(files).filter(path => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
    return {
      value: names.map(path => ({ name: path.slice(prefix.length), kind: 'file', size: 1, mtimeMs: 0, isLink: false })),
    }
  })
  on('fs.read', (_, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('tool.call', (_, e) => {
    if (!tools.includes(String(e.tool))) throw new Error(`no tool named "${String(e.tool)}"`)
    if (e.tool === 'TaskList') return taskList === 'deny' ? { deny: 'negado' } : { result: taskList }
    if (e.tool === 'TaskCreate')
      return { result: { task: { id: '42', subject: String((e as { subject?: unknown }).subject) } } }
    return { result: { success: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return Object.assign(opened, { lists: () => lists })
}

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

const settle = () => new Promise(resolve => setTimeout(resolve, 20))

test('opens the pane and shows the project alerts', async ($, on) => {
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

test('live run: skill + TaskCreate/TaskUpdate change the pane', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  await $.tool.call({
    tool: 'Skill',
    skill: 'superpowers-extended-cc:executing-plans',
    args: 'docs/superpowers/plans/2026-10-03-auth.md',
  })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Task 1: Refresh', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '42', status: 'in_progress' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^Fase/ }))?.text).toBe('Fase: ▶ executing-plans')
  expect((await ui.find({ type: 'Text', text: /^Plano:/ }))?.text).toBe('Plano: 2026-10-03-auth.md  ███░░░░░░░ 1/3')
  expect((await ui.find({ type: 'Text', text: /T1 Refresh/ }))?.text).toBe('▶ T1 Refresh  em andamento')
  expect((await ui.find({ type: 'Text', text: /T2 Gate/ }))?.text).toBe('⊘ T2 Gate E2E  bloqueada por T1  🔒 user-gate')
  await ui.unmount()
})

test('/sp status and /sp sync', async ($, on) => {
  engine(on, { tasks: [{ id: '3', subject: 'Task 0: Login', status: 'completed', blockedBy: [] }] })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const sync = await $.command.run({ ...RUN, command: 'sp', args: 'sync' })
  expect(sync.text).toBe('Superpowers: sincronizado.')
  const status = await $.command.run({ ...RUN, command: 'sp', args: 'status' })
  expect(status.text?.split('\n')[0]).toBe('Fase: —')
  expect(status.text).toContain('PLANO ATUAL')
  expect(status.text).toContain('  · 2026-10-03-auth.md  ███░░░░░░░ 1/3')
  expect(status.text).toContain('  · 2026-09-02-hotfix.md  sem tasks.json')
  const usage = await $.command.run({ ...RUN, command: 'sp', args: 'xyz' })
  expect(usage.text).toBe('Uso: /sp (abre/fecha o painel) · /sp status · /sp sync')
})

test('TaskList denied during backfill flags a partial sync', async ($, on) => {
  engine(on, 'deny')
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const status = await $.command.run({ ...RUN, command: 'sp', args: 'status' })
  expect(status.text).toContain('sincronização parcial')
})

test('session without the TaskList tool does not flag a partial sync', async ($, on) => {
  engine(on, { tasks: [] }, ['Skill', 'Read', 'Write', 'Edit'])
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const status = await $.command.run({ ...RUN, command: 'sp', args: 'status' })
  expect(status.text).not.toContain('sincronização parcial')
})

test('clicking a plan opens DETALHE; ✕ fechar removes it', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const key = 'plan:docs/superpowers/plans/2026-10-03-auth.md'
  expect((await ui.find({ key }))?.text).toBe('  · 2026-10-03-auth.md  ███░░░░░░░ 1/3')
  expect(await ui.find({ type: 'Text', text: 'DETALHE' })).toBeUndefined()

  await ui.press({ key })
  await settle()
  expect((await ui.find({ type: 'Text', text: 'DETALHE' }))?.text).toBe('DETALHE')
  expect((await ui.find({ type: 'Text', text: /^Spec:/ }))?.text).toBe('Spec: 2026-10-01-auth-design.md')
  expect((await ui.find({ type: 'Text', text: /T1 Refresh/ }))?.text).toBe('○ T1 Refresh')
  expect((await ui.find({ type: 'Text', text: /T0 Login/ }))?.text).toBe('✓ T0 Login')

  await ui.press({ key: 'detail-close' })
  await settle()
  expect(await ui.find({ type: 'Text', text: 'DETALHE' })).toBeUndefined()

  await ui.press({ key })
  await settle()
  expect(await ui.find({ type: 'Text', text: 'DETALHE' })).toBeDefined()
  await ui.press({ key })
  await settle()
  expect(await ui.find({ type: 'Text', text: 'DETALHE' })).toBeUndefined()
  await ui.unmount()
})

const OURS = [SUPERPOWERS_DIR, `${SUPERPOWERS_DIR}/specs`, `${SUPERPOWERS_DIR}/plans`]

test('classic.SessionStart watches docs/superpowers and keeps the paths of others', async ($, on) => {
  engine(on)
  on('classic.SessionStart', () => ({ watchPaths: ['/x'] }))
  const result = await $.classic.SessionStart({ source: 'startup' })
  expect(result.watchPaths).toEqual(['/x', ...OURS])
})

test('classic.FileChanged in docs/superpowers rescans (another session finished the plan)', async ($, on) => {
  const files = { ...FILES }
  engine(on, { tasks: [] }, TOOLS, files)
  on('classic.FileChanged', () => ({}))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const tasksPath = `${SUPERPOWERS_DIR}/plans/2026-10-03-auth.md.tasks.json`
  files[tasksPath] = JSON.stringify({
    tasks: [0, 1, 2].map(id => ({ id, subject: `Task ${id}: T${id}`, status: 'completed', description: '' })),
  })
  await $.classic.FileChanged({ file_path: tasksPath, event: 'change' })
  let text = ''
  for (let i = 0; i < 10 && !text.includes('3/3'); i++) {
    await settle()
    text = (await $.command.run({ ...RUN, command: 'sp', args: 'status' })).text ?? ''
  }
  expect(text).toContain('✓ 1 plano(s) concluído(s)\n  · 2026-10-03-auth.md  ██████████ 3/3')
})

test('classic.FileChanged outside docs/superpowers does not rescan', async ($, on) => {
  const opened = engine(on)
  on('classic.FileChanged', () => ({}))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const before = opened.lists()
  await $.classic.FileChanged({ file_path: `${ROOT}/src/a.ts`, event: 'change' })
  await settle()
  expect(opened.lists()).toBe(before)
})

test('classic.CwdChanged merges our paths into the list another hook replaces', async ($, on) => {
  engine(on)
  on('classic.CwdChanged', () => ({ watchPaths: ['/y'] }) as never)
  const result = (await $.classic.CwdChanged({ old_cwd: '/old', new_cwd: ROOT })) as { watchPaths?: string[] }
  expect(result.watchPaths).toEqual(['/y', ...OURS])
})

test('a plan that is both incomplete and without spec keeps one key per list', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const hotfix = 'docs/superpowers/plans/2026-09-02-hotfix.md'
  expect((await ui.find({ key: `plan:${hotfix}` }))?.text).toBe('  · 2026-09-02-hotfix.md  sem tasks.json')
  expect((await ui.find({ key: `nospec:${hotfix}` }))?.text).toBe('  · 2026-09-02-hotfix.md')
  await ui.unmount()
})
