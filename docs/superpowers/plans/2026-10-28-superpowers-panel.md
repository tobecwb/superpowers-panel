# Superpowers Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mod para Claude Code que mostra, num painel lateral, a execução ao vivo do fluxo `superpowers-extended-cc` e o estado de specs/planos do projeto.

**Architecture:** Mod de function hooks (Claude Code 2.1.312). O repositório inteiro é a pasta do plugin. Lógica pura em `hooks/parse.ts`, `link.ts`, `live.ts`, `summary.ts`; I/O em `hooks/scan.ts`; estado em `$.state` via atoms (`hooks/atoms.ts`); painel em `hooks/pane.tsx`; orquestração em `hooks/register.tsx`.

**Tech Stack:** TypeScript/TSX, API `claude-code` (function hooks), `claude-code/testing` + `claude plugin test`, `claude plugin validate`, `tsc` 5.6 via `npx`.

**Spec:** `docs/superpowers/specs/2026-10-28-superpowers-panel-design.md`

## Global Constraints

- Nome do plugin: `superpowers-panel`. ID do pane: `superpowers`. Título do pane: `Superpowers`. Comando: `sp`.
- Raiz do repositório = pasta do plugin (`.claude-plugin/plugin.json` na raiz).
- Caminhos de spec/plano no estado são **relativos à raiz do projeto**: `docs/superpowers/specs/<arquivo>.md`, `docs/superpowers/plans/<arquivo>.md`.
- Prefixo de skill: `superpowers-extended-cc:`.
- Status de tarefa: `'pending' | 'in_progress' | 'completed'`. Numeração exibida: `T{id}` do `.tasks.json`; ID nativo nunca exibido. Prefixo `Task N: ` do subject é removido na exibição.
- O mod é somente leitura: nenhuma escrita em arquivos do projeto; hooks de ferramenta sempre retornam o resultado de `next(e)` inalterado.
- Textos da UI em PT-BR com acentuação correta.
- Sem `import()` dinâmico; sem Node/DOM; tudo externo via `$`.
- Arquivo de tipos da API (para `tsc`): `ls -d /private/tmp/claude-501/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts | head -1`. Se não existir, recarregar a skill `plugin-authoring` (ela regrava o arquivo).

**User decisions (already made):**
- Abordagem A: hooks ao vivo + varredura de `docs/superpowers/`.
- Tarefas criadas antes do mod carregar DEVEM aparecer: backfill automático em `session.start` + `/sp sync`.
- `.tasks.json` é a fonte de verdade do plano; tarefas nativas são camada ao vivo, ligadas por `subject`.
- Alertas: spec sem plano, plano incompleto, plano sem spec (+ concluídos recolhidos).
- v1 só leitura + comando `/sp` (`/sp`, `/sp status`, `/sp sync`).
- Painel abre automaticamente quando existe `docs/superpowers/`.

## Review Focus

1. `**Spec:**` escrito com crases ou com `./` na frente → deve ligar à spec normalmente (teste na Task 1).
2. Tarefa nativa com `TaskUpdate status: "deleted"` → some do painel, não fica como pendente (teste na Task 2).
3. Projeto com `docs/superpowers/` mas sem pasta `plans/` ou `specs/` → painel vazio sem erro (teste na Task 3).
4. `.tasks.json` com tarefa sem `id` numérico ou com `blockedBy` apontando para id inexistente → usa índice como id e não marca bloqueada (testes nas Tasks 0 e 1).
5. Skill digitada pelo usuário (`<command-name>/superpowers-extended-cc:x</command-name>` no transcript) → fase atualizada no replay (teste na Task 2).

---

### Task 0: Scaffold do mod, contrato de estado e parsers

**Goal:** Criar o esqueleto do plugin, o contrato de tipos do `$.state` e `hooks/parse.ts` com testes.

**Files:**
- Create: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `tsconfig.json`, `.gitignore`, `types/index.d.ts`, `hooks/parse.ts`, `hooks/register.tsx` (stub), `tests/parse.test.ts`

**Acceptance Criteria:**
- [ ] `claude plugin validate .` sai com código 0
- [ ] `claude plugin test .` passa todos os testes de `tests/parse.test.ts`
- [ ] `npx -y -p typescript@5.6.3 tsc -p .` sem erros

**Verify:** `claude plugin test . && claude plugin validate . && npx -y -p typescript@5.6.3 tsc -p .` → testes passam, validate sem erros, tsc sem saída

**Steps:**

- [ ] **Step 1: Escrever os arquivos de scaffold**

`.claude-plugin/plugin.json`:
```json
{
  "name": "superpowers-panel",
  "version": "0.1.0",
  "description": "Painel ao vivo do fluxo superpowers-extended-cc: tarefas, planos e specs",
  "types": "./types/index.d.ts"
}
```

`hooks/hooks.json`:
```json
{ "modules": ["./register.tsx"] }
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "es2023", "lib": ["es2023"], "types": [],
    "module": "esnext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true,
    "noEmit": true, "skipLibCheck": true,
    "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment"
  },
  "include": [".claude-plugin/types", "hooks", "types", "tests"]
}
```

`.gitignore`:
```
.claude-plugin/types/
```

Copiar os tipos da API para o `tsc`:
```bash
mkdir -p .claude-plugin/types/claude-code
cp "$(ls -d /private/tmp/claude-501/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts | head -1)" .claude-plugin/types/claude-code/index.d.ts
```

`types/index.d.ts`:
```ts
export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type Spec = { path: string; slug: string; date: string }

export type PlanTask = {
  id: number
  subject: string
  status: TaskStatus
  blockedBy: number[]
  userGate: boolean
}

export type Plan = {
  path: string
  slug: string
  date: string
  specRef?: string
  tasksFile: 'ok' | 'missing' | 'invalid'
  tasks: PlanTask[]
}

export type Project = {
  specs: Spec[]
  plans: Plan[]
  scannedAt: number
  hasSuperpowersDir: boolean
}

export type SessionTask = {
  id: string
  subject: string
  status: TaskStatus
  blockedBy: string[]
}

export type Live = {
  phase?: string
  activePlan?: string
  sessionTasks: Record<string, SessionTask>
  syncNote?: string
}

declare module 'claude-code' {
  interface PluginState {
    'superpowers-panel': {
      project: Shaped<Project>
      live: Shaped<Live>
      expanded: Shaped<string[]>
    }
  }
}
```

`hooks/register.tsx` (stub, substituído na Task 5):
```tsx
import type { Register } from 'claude-code'

export const register: Register = () => {}
```

- [ ] **Step 2: Escrever o teste que falha** — `tests/parse.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { parseMetadata, parseName, parseSpecRef, parseTasksFile } from '../hooks/parse'

test('parseName extrai data e slug, removendo -design', async () => {
  expect(parseName('2026-10-28-auth-design.md')).toEqual({ date: '2026-10-28', slug: 'auth' })
  expect(parseName('2026-10-28-auth.md')).toEqual({ date: '2026-10-28', slug: 'auth' })
  expect(parseName('notas.md')).toEqual({ date: '', slug: 'notas' })
})

test('parseSpecRef lê a linha **Spec:** com ou sem crases', async () => {
  expect(parseSpecRef('# P\n\n**Spec:** `docs/superpowers/specs/a-design.md`\n')).toBe('docs/superpowers/specs/a-design.md')
  expect(parseSpecRef('**Spec:** ./docs/superpowers/specs/a.md')).toBe('./docs/superpowers/specs/a.md')
  expect(parseSpecRef('# Sem spec')).toBeUndefined()
})

test('parseMetadata lê o bloco json:metadata e tolera JSON quebrado', async () => {
  const ok = 'x\n\n```json:metadata\n{"userGate": true, "tags": ["a"]}\n```'
  expect(parseMetadata(ok)).toEqual({ userGate: true, tags: ['a'] })
  expect(parseMetadata('```json:metadata\n{quebrado\n```')).toBeUndefined()
  expect(parseMetadata('sem bloco')).toBeUndefined()
})

test('parseTasksFile lê o formato do fork', async () => {
  const text = JSON.stringify({
    planPath: 'docs/superpowers/plans/p.md',
    tasks: [
      { id: 0, subject: 'Task 0: A', status: 'completed', description: '```json:metadata\n{"tags": ["user-gate"]}\n```' },
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

test('parseTasksFile devolve undefined para JSON inválido ou sem tasks', async () => {
  expect(parseTasksFile('{')).toBeUndefined()
  expect(parseTasksFile('{"x": 1}')).toBeUndefined()
  expect(parseTasksFile('null')).toBeUndefined()
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `claude plugin test .`
Expected: FAIL (módulo `../hooks/parse` inexistente)

- [ ] **Step 4: Implementar `hooks/parse.ts`**
```ts
import type { PlanTask, TaskStatus } from '../types'

const STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'completed']
const FENCE = /```json:metadata\s*\n([\s\S]*?)\n```/

export const toStatus = (value: unknown): TaskStatus =>
  STATUSES.includes(value as TaskStatus) ? (value as TaskStatus) : 'pending'

export const parseName = (file: string): { date: string; slug: string } => {
  const base = file.replace(/\.md$/, '')
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(base)
  const rest = match ? match[2]! : base

  return { date: match ? match[1]! : '', slug: rest.replace(/-design$/, '') }
}

export const parseSpecRef = (planText: string): string | undefined =>
  /^\*\*Spec:\*\*\s*`?([^`\s]+)`?/m.exec(planText)?.[1]

export const parseMetadata = (description: string): Record<string, unknown> | undefined => {
  const match = FENCE.exec(description)
  if (!match) return undefined
  try {
    const value: unknown = JSON.parse(match[1]!)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

export const isUserGate = (meta: Record<string, unknown> | undefined): boolean =>
  meta?.userGate === true || (Array.isArray(meta?.tags) && meta.tags.includes('user-gate'))

export const parseTasksFile = (text: string): PlanTask[] | undefined => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return undefined
  }
  const tasks = (data as { tasks?: unknown } | null)?.tasks
  if (!Array.isArray(tasks)) return undefined

  return tasks.flatMap((task: unknown, index): PlanTask[] => {
    if (!task || typeof task !== 'object') return []
    const raw = task as Record<string, unknown>
    const description = typeof raw.description === 'string' ? raw.description : ''

    return [{
      id: typeof raw.id === 'number' ? raw.id : index,
      subject: typeof raw.subject === 'string' ? raw.subject : `Task ${index}`,
      status: toStatus(raw.status),
      blockedBy: Array.isArray(raw.blockedBy)
        ? raw.blockedBy.filter((id): id is number => typeof id === 'number')
        : [],
      userGate: isUserGate(parseMetadata(description)),
    }]
  })
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `claude plugin test . && claude plugin validate . && npx -y -p typescript@5.6.3 tsc -p .`
Expected: PASS em todos; validate sem erros; tsc sem saída.

- [ ] **Step 6: Commit**
```bash
git add .claude-plugin/plugin.json .gitignore tsconfig.json hooks types tests
git commit -m "feat: scaffold do mod superpowers-panel e parsers"
```

---

### Task 1: Ligação spec↔plano, alertas e plano ativo (`link.ts`)

**Goal:** Implementar a derivação pura dos alertas do projeto, do plano ativo e da precedência de status.

**Files:**
- Create: `hooks/link.ts`, `tests/link.test.ts`

**Acceptance Criteria:**
- [ ] `derive` classifica specs sem plano, planos incompletos, sem spec e concluídos conforme a spec
- [ ] `**Spec:**` com `./` ou só nome de arquivo liga à spec; referência inexistente marca `specMissing`
- [ ] No plano ativo, status nativo prevalece sobre o do `.tasks.json`; tarefas nativas sem correspondência ficam em `outside`
- [ ] `groupTasks` separa em andamento / pendentes / bloqueadas / concluídas, ignorando `blockedBy` inexistente

**Verify:** `claude plugin test .` → todos os testes de `tests/link.test.ts` passam

**Steps:**

- [ ] **Step 1: Escrever o teste que falha** — `tests/link.test.ts`:
```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `claude plugin test .`
Expected: FAIL (módulo `../hooks/link` inexistente)

- [ ] **Step 3: Implementar `hooks/link.ts`**
```ts
import type { Live, Plan, PlanTask, Project, SessionTask, Spec } from '../types'

export type PlanView = Plan & {
  spec?: Spec
  specMissing: boolean
  done: number
  total: number
  isComplete: boolean
  label?: string
}

export type Derived = {
  active?: PlanView
  outside: SessionTask[]
  specsWithoutPlan: Spec[]
  incomplete: PlanView[]
  withoutSpec: PlanView[]
  complete: PlanView[]
}

export type TaskGroups = {
  running: PlanTask[]
  pending: PlanTask[]
  blocked: PlanTask[]
  done: PlanTask[]
}

const baseName = (path: string) => path.split('/').pop() ?? path

export const linkPlan = (plan: Plan, specs: readonly Spec[]): { spec?: Spec; specMissing: boolean } => {
  if (plan.specRef !== undefined) {
    const ref = plan.specRef.replace(/\\/g, '/').replace(/^\.\//, '')
    const spec = specs.find(one => one.path === ref || baseName(one.path) === baseName(ref))
    return spec ? { spec, specMissing: false } : { specMissing: true }
  }
  const spec = specs.find(one => one.slug === plan.slug)
  return spec ? { spec, specMissing: false } : { specMissing: false }
}

export const activePlanPath = (plans: readonly Plan[], live: Live): string | undefined => {
  if (live.activePlan && plans.some(plan => plan.path === live.activePlan)) return live.activePlan
  const subjects = new Set(Object.values(live.sessionTasks).map(task => task.subject))
  let best: { path: string; hits: number } | undefined
  for (const plan of plans) {
    const hits = plan.tasks.filter(task => subjects.has(task.subject)).length
    if (hits > 0 && (!best || hits > best.hits)) best = { path: plan.path, hits }
  }
  return best?.path
}

export const mergeStatuses = (
  tasks: readonly PlanTask[],
  session: Record<string, SessionTask>,
): PlanTask[] => {
  const bySubject = new Map(Object.values(session).map(task => [task.subject, task.status]))
  return tasks.map(task => {
    const status = bySubject.get(task.subject)
    return status ? { ...task, status } : task
  })
}

export const isBlocked = (task: PlanTask, tasks: readonly PlanTask[]): boolean =>
  task.status !== 'completed' &&
  task.blockedBy.some(id => {
    const dep = tasks.find(one => one.id === id)
    return dep !== undefined && dep.status !== 'completed'
  })

export const groupTasks = (tasks: readonly PlanTask[]): TaskGroups => ({
  running: tasks.filter(task => task.status === 'in_progress'),
  pending: tasks.filter(task => task.status === 'pending' && !isBlocked(task, tasks)),
  blocked: tasks.filter(task => task.status === 'pending' && isBlocked(task, tasks)),
  done: tasks.filter(task => task.status === 'completed'),
})

const labelOf = (plan: Plan): string | undefined =>
  plan.tasksFile === 'missing' ? 'sem tasks.json'
    : plan.tasksFile === 'invalid' ? 'tasks.json inválido'
      : undefined

export const derive = (project: Project, live: Live): Derived => {
  const activePath = activePlanPath(project.plans, live)
  const views: PlanView[] = project.plans.map(plan => {
    const tasks = plan.path === activePath ? mergeStatuses(plan.tasks, live.sessionTasks) : plan.tasks
    const done = tasks.filter(task => task.status === 'completed').length
    return {
      ...plan,
      ...linkPlan(plan, project.specs),
      tasks,
      done,
      total: tasks.length,
      isComplete: plan.tasksFile === 'ok' && tasks.length > 0 && done === tasks.length,
      label: labelOf(plan),
    }
  })
  const linked = new Set(views.flatMap(view => (view.spec ? [view.spec.path] : [])))
  const active = views.find(view => view.path === activePath)
  const activeSubjects = new Set(active?.tasks.map(task => task.subject) ?? [])

  return {
    active,
    outside: Object.values(live.sessionTasks).filter(task => !activeSubjects.has(task.subject)),
    specsWithoutPlan: project.specs.filter(spec => !linked.has(spec.path)),
    incomplete: views.filter(view => !view.isComplete),
    withoutSpec: views.filter(view => !view.spec),
    complete: views.filter(view => view.isComplete),
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `claude plugin test . && npx -y -p typescript@5.6.3 tsc -p .`
Expected: PASS; tsc sem saída.

- [ ] **Step 5: Commit**
```bash
git add hooks/link.ts tests/link.test.ts
git commit -m "feat: derivação de alertas, plano ativo e precedência de status"
```

---

### Task 2: Estado ao vivo da sessão e replay do transcript (`live.ts`)

**Goal:** Implementar a aplicação pura de eventos (TaskCreate/TaskUpdate/Skill/arquivos/TaskList) sobre `Live` e o replay do transcript.

**Files:**
- Create: `hooks/live.ts`, `tests/live.test.ts`

**Acceptance Criteria:**
- [ ] `toolEvent` converte TaskCreate (id do resultado), TaskUpdate, Skill e Read/Write/Edit em eventos; outras ferramentas → `undefined`
- [ ] `applyEvent` cria, atualiza, remove (`deleted`) tarefas; `skill` de outro plugin não altera a fase
- [ ] `executing-plans`/`subagent-driven-development` com caminho de plano em `args`, ou toque em `.tasks.json`, definem `activePlan`
- [ ] `snapshot` (TaskList) substitui `sessionTasks`
- [ ] `replay` reconstrói tarefas e fase a partir de `SessionMessage[]`, inclusive skill digitada pelo usuário

**Verify:** `claude plugin test .` → todos os testes de `tests/live.test.ts` passam

**Steps:**

- [ ] **Step 1: Escrever o teste que falha** — `tests/live.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { EMPTY_LIVE, applyEvent, extractPlanPath, parsePromptSkill, replay, taskListOf, toolEvent } from '../hooks/live'

test('toolEvent reconhece as ferramentas relevantes', async () => {
  expect(toolEvent('TaskCreate', { subject: 'A' }, { task: { id: '1', subject: 'A' } }))
    .toEqual({ kind: 'create', id: '1', subject: 'A' })
  expect(toolEvent('TaskUpdate', { taskId: '1', status: 'completed' }, {}))
    .toEqual({ kind: 'update', id: '1', subject: undefined, status: 'completed', addBlockedBy: [] })
  expect(toolEvent('Skill', { skill: 'superpowers-extended-cc:brainstorming' }, {}))
    .toEqual({ kind: 'skill', skill: 'superpowers-extended-cc:brainstorming', args: undefined })
  expect(toolEvent('Read', { file_path: '/r/docs/superpowers/plans/p.md.tasks.json' }, {}))
    .toEqual({ kind: 'touch', path: '/r/docs/superpowers/plans/p.md.tasks.json' })
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
  const live = applyEvent(before, { kind: 'snapshot', tasks: [{ id: '1', subject: 'A', status: 'completed', blockedBy: [] }] })
  expect(Object.keys(live.sessionTasks)).toEqual(['1'])
})

test('taskListOf valida o resultado do TaskList', async () => {
  expect(taskListOf({ tasks: [{ id: '1', subject: 'A', status: 'pending', blockedBy: [] }] }))
    .toEqual([{ id: '1', subject: 'A', status: 'pending', blockedBy: [] }])
  expect(taskListOf({})).toBeUndefined()
})

test('extractPlanPath e parsePromptSkill', async () => {
  expect(extractPlanPath('rodar `docs/superpowers/plans/x.md` agora')).toBe('docs/superpowers/plans/x.md')
  expect(extractPlanPath('/a/docs/superpowers/plans/x.md.tasks.json')).toBe('docs/superpowers/plans/x.md')
  expect(parsePromptSkill('/superpowers-extended-cc:writing-plans docs/a.md'))
    .toEqual({ skill: 'superpowers-extended-cc:writing-plans', args: 'docs/a.md' })
  expect(parsePromptSkill('<command-name>/superpowers-extended-cc:brainstorming</command-name>\n<command-args>x</command-args>'))
    .toEqual({ skill: 'superpowers-extended-cc:brainstorming', args: 'x' })
  expect(parsePromptSkill('olá')).toBeUndefined()
})

test('replay reconstrói tarefas e fase do transcript', async () => {
  const live = replay([
    { role: 'user', text: '<command-name>/superpowers-extended-cc:brainstorming</command-name>', toolUses: [] },
    {
      role: 'assistant',
      text: '',
      toolUses: [
        { tool_use_id: 'a', tool: 'TaskCreate', input: { subject: 'Task 0: A' }, result: { task: { id: '1', subject: 'Task 0: A' } } },
        { tool_use_id: 'b', tool: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' }, result: { success: true } },
        { tool_use_id: 'c', tool: 'TaskCreate', input: { subject: 'falhou' }, isError: true },
      ],
    },
  ])
  expect(live.phase).toBe('brainstorming')
  expect(Object.values(live.sessionTasks)).toEqual([{ id: '1', subject: 'Task 0: A', status: 'in_progress', blockedBy: [] }])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `claude plugin test .`
Expected: FAIL (módulo `../hooks/live` inexistente)

- [ ] **Step 3: Implementar `hooks/live.ts`**
```ts
import type { Live, SessionTask } from '../types'
import { toStatus } from './parse'

export const SKILL_PREFIX = 'superpowers-extended-cc:'
export const EMPTY_LIVE: Live = { sessionTasks: {} }

const PLAN_SKILLS = new Set(['executing-plans', 'subagent-driven-development'])
const PLAN_PATH = /docs\/superpowers\/plans\/[^\s`'"]+?\.md(?![\w-])/

export type LiveEvent =
  | { kind: 'create'; id: string; subject: string }
  | { kind: 'update'; id: string; subject?: string; status?: string; addBlockedBy: string[] }
  | { kind: 'skill'; skill: string; args?: string }
  | { kind: 'touch'; path: string }
  | { kind: 'snapshot'; tasks: SessionTask[] }

export type MessageLike = {
  role: 'user' | 'assistant'
  text: string
  toolUses: readonly { tool: string; input: Record<string, unknown>; result?: unknown; isError?: true }[]
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const strs = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []

export const extractPlanPath = (text: string): string | undefined => PLAN_PATH.exec(text)?.[0]

export const parsePromptSkill = (text: string): { skill: string; args?: string } | undefined => {
  const tag = /<command-name>\/?superpowers-extended-cc:([\w-]+)<\/command-name>/.exec(text)
  if (tag) {
    return { skill: SKILL_PREFIX + tag[1], args: /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1] }
  }
  const typed = /^\/superpowers-extended-cc:([\w-]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  return typed ? { skill: SKILL_PREFIX + typed[1], args: typed[2] } : undefined
}

export const toolEvent = (
  tool: string,
  input: Record<string, unknown>,
  result: unknown,
): LiveEvent | undefined => {
  switch (tool) {
    case 'TaskCreate': {
      const id = (result as { task?: { id?: unknown } } | undefined)?.task?.id
      const subject = str(input.subject)
      return typeof id === 'string' && subject !== undefined ? { kind: 'create', id, subject } : undefined
    }
    case 'TaskUpdate': {
      const id = str(input.taskId)
      return id === undefined ? undefined : {
        kind: 'update',
        id,
        subject: str(input.subject),
        status: str(input.status),
        addBlockedBy: strs(input.addBlockedBy),
      }
    }
    case 'Skill': {
      const skill = str(input.skill)
      return skill === undefined ? undefined : { kind: 'skill', skill, args: str(input.args) }
    }
    case 'Read':
    case 'Write':
    case 'Edit': {
      const path = str(input.file_path)
      return path === undefined ? undefined : { kind: 'touch', path }
    }
  }
  return undefined
}

export const taskListOf = (result: unknown): SessionTask[] | undefined => {
  const tasks = (result as { tasks?: unknown } | undefined)?.tasks
  if (!Array.isArray(tasks)) return undefined
  return tasks.flatMap((task: unknown): SessionTask[] => {
    const raw = task as Record<string, unknown> | null
    const id = str(raw?.id)
    const subject = str(raw?.subject)
    return id === undefined || subject === undefined
      ? []
      : [{ id, subject, status: toStatus(raw?.status), blockedBy: strs(raw?.blockedBy) }]
  })
}

export const applyEvent = (live: Live, event: LiveEvent): Live => {
  switch (event.kind) {
    case 'create':
      return {
        ...live,
        sessionTasks: {
          ...live.sessionTasks,
          [event.id]: { id: event.id, subject: event.subject, status: 'pending', blockedBy: [] },
        },
      }
    case 'update': {
      const { [event.id]: current, ...rest } = live.sessionTasks
      if (event.status === 'deleted') return { ...live, sessionTasks: rest }
      const base: SessionTask = current ?? { id: event.id, subject: `#${event.id}`, status: 'pending', blockedBy: [] }
      return {
        ...live,
        sessionTasks: {
          ...live.sessionTasks,
          [event.id]: {
            ...base,
            subject: event.subject ?? base.subject,
            status: event.status === undefined ? base.status : toStatus(event.status),
            blockedBy: [...new Set([...base.blockedBy, ...event.addBlockedBy])],
          },
        },
      }
    }
    case 'skill': {
      if (!event.skill.startsWith(SKILL_PREFIX)) return live
      const phase = event.skill.slice(SKILL_PREFIX.length)
      const plan = PLAN_SKILLS.has(phase) && event.args ? extractPlanPath(event.args) : undefined
      return { ...live, phase, ...(plan ? { activePlan: plan } : {}) }
    }
    case 'touch': {
      if (!event.path.endsWith('.tasks.json')) return live
      const plan = extractPlanPath(event.path)
      return plan ? { ...live, activePlan: plan } : live
    }
    case 'snapshot':
      return { ...live, sessionTasks: Object.fromEntries(event.tasks.map(task => [task.id, task])) }
  }
}

export const replay = (messages: readonly MessageLike[]): Live =>
  messages.reduce((live, message) => {
    if (message.role === 'user') {
      const skill = parsePromptSkill(message.text)
      return skill ? applyEvent(live, { kind: 'skill', ...skill }) : live
    }
    return message.toolUses.reduce((acc, use) => {
      if (use.isError) return acc
      const event = toolEvent(use.tool, use.input, use.result)
      return event ? applyEvent(acc, event) : acc
    }, live)
  }, EMPTY_LIVE)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `claude plugin test . && npx -y -p typescript@5.6.3 tsc -p .`
Expected: PASS; tsc sem saída.

- [ ] **Step 5: Commit**
```bash
git add hooks/live.ts tests/live.test.ts
git commit -m "feat: estado ao vivo da sessão e replay do transcript"
```

---

### Task 3: Varredura de `docs/superpowers/` (`scan.ts`)

**Goal:** Ler specs, planos e `.tasks.json` por uma interface de arquivos injetável e serializar varreduras concorrentes.

**Files:**
- Create: `hooks/scan.ts`, `tests/scan.test.ts`

**Acceptance Criteria:**
- [ ] Sem `docs/superpowers/` → `hasSuperpowersDir: false`, listas vazias
- [ ] Com `docs/superpowers/` sem `specs/` ou `plans/` → listas vazias, sem exceção
- [ ] Plano com `.tasks.json` válido → `tasksFile: 'ok'`; inválido ou ilegível → `'invalid'`; ausente → `'missing'`
- [ ] `*.md.tasks.json` não aparece como plano; `specRef` lido do cabeçalho
- [ ] `coalesce` executa no máximo uma vez em paralelo e roda de novo uma única vez se pedido durante a execução

**Verify:** `claude plugin test .` → todos os testes de `tests/scan.test.ts` passam

**Steps:**

- [ ] **Step 1: Escrever o teste que falha** — `tests/scan.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import { coalesce, isSuperpowersPath, scanProject, type FsLike } from '../hooks/scan'

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
        [...Object.keys(files), ...dirs].filter(one => one.startsWith(prefix)).map(one => one.slice(prefix.length).split('/')[0]!),
      )
      return [...names].map(name => ({ name, kind: `${prefix}${name}` in files ? 'file' : 'dir' }))
    },
    read: async path => {
      if (unreadable.includes(path) || !(path in files)) throw new Error('ENOENT')
      return files[path]!
    },
  }
}

const P = '/r/docs/superpowers'

test('sem docs/superpowers', async () => {
  expect(await scanProject(fakeFs({ '/r/README.md': '' }), '/r', 5))
    .toEqual({ specs: [], plans: [], scannedAt: 5, hasSuperpowersDir: false })
})

test('docs/superpowers sem specs nem plans', async () => {
  const project = await scanProject(fakeFs({ [`${P}/model-routing.json`]: '{}' }), '/r', 5)
  expect(project).toEqual({ specs: [], plans: [], scannedAt: 5, hasSuperpowersDir: true })
})

test('lê specs, planos e estados do tasks.json', async () => {
  const fs = fakeFs({
    [`${P}/specs/2026-01-01-auth-design.md`]: '# a',
    [`${P}/plans/2026-01-02-auth.md`]: '# p\n\n**Spec:** `docs/superpowers/specs/2026-01-01-auth-design.md`',
    [`${P}/plans/2026-01-02-auth.md.tasks.json`]: JSON.stringify({ tasks: [{ id: 0, subject: 'Task 0: A', status: 'completed' }] }),
    [`${P}/plans/2026-01-03-bad.md`]: '# b',
    [`${P}/plans/2026-01-03-bad.md.tasks.json`]: '{',
    [`${P}/plans/2026-01-04-gone.md`]: '# g',
    [`${P}/plans/2026-01-04-gone.md.tasks.json`]: '{"tasks": []}',
    [`${P}/plans/2026-01-05-none.md`]: '# n',
  }, [`${P}/plans/2026-01-04-gone.md.tasks.json`])
  const project = await scanProject(fs, '/r', 7)
  expect(project.specs).toEqual([{ path: 'docs/superpowers/specs/2026-01-01-auth-design.md', slug: 'auth', date: '2026-01-01' }])
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

test('coalesce serializa e junta pedidos', async () => {
  let runs = 0
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  const run = coalesce(async (_: number) => { runs++; await gate })
  const a = run(1)
  const b = run(2)
  const c = run(3)
  release()
  await Promise.all([a, b, c])
  expect(runs).toBe(2)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `claude plugin test .`
Expected: FAIL (módulo `../hooks/scan` inexistente)

- [ ] **Step 3: Implementar `hooks/scan.ts`**
```ts
import type { Plan, PlanTask, Project, Spec } from '../types'
import { parseName, parseSpecRef, parseTasksFile } from './parse'

export type FsLike = {
  exists: (path: string) => Promise<boolean>
  list: (path: string) => Promise<readonly { name: string; kind: string }[]>
  read: (path: string) => Promise<string>
}

const ROOT_DIR = 'docs/superpowers'
const SPECS = `${ROOT_DIR}/specs`
const PLANS = `${ROOT_DIR}/plans`

export const isSuperpowersPath = (path: unknown): boolean =>
  typeof path === 'string' && path.replace(/\\/g, '/').includes(`${ROOT_DIR}/`)

const markdownIn = async (fs: FsLike, root: string, dir: string): Promise<string[]> => {
  const full = `${root}/${dir}`
  if (!(await fs.exists(full))) return []
  return (await fs.list(full))
    .filter(entry => entry.kind === 'file' && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort()
}

const readPlan = async (fs: FsLike, root: string, name: string): Promise<Plan> => {
  const path = `${PLANS}/${name}`
  const text = await fs.read(`${root}/${path}`).catch(() => '')
  const tasksPath = `${root}/${path}.tasks.json`
  let tasksFile: Plan['tasksFile'] = 'missing'
  let tasks: PlanTask[] = []
  if (await fs.exists(tasksPath)) {
    const parsed = await fs.read(tasksPath).then(parseTasksFile, () => undefined)
    tasksFile = parsed ? 'ok' : 'invalid'
    tasks = parsed ?? []
  }
  return { path, ...parseName(name), specRef: parseSpecRef(text), tasksFile, tasks }
}

export const scanProject = async (fs: FsLike, root: string, now: number): Promise<Project> => {
  const hasSuperpowersDir = await fs.exists(`${root}/${ROOT_DIR}`)
  if (!hasSuperpowersDir) return { specs: [], plans: [], scannedAt: now, hasSuperpowersDir }
  const specs: Spec[] = (await markdownIn(fs, root, SPECS)).map(name => ({ path: `${SPECS}/${name}`, ...parseName(name) }))
  const plans = await Promise.all((await markdownIn(fs, root, PLANS)).map(name => readPlan(fs, root, name)))
  return { specs, plans, scannedAt: now, hasSuperpowersDir }
}

export const coalesce = <T>(task: (arg: T) => Promise<void>): ((arg: T) => Promise<void>) => {
  let running: Promise<void> | undefined
  let again = false
  let latest: T
  return arg => {
    latest = arg
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      try {
        do {
          again = false
          await task(latest)
        } while (again)
      } finally {
        running = undefined
      }
    })()
    return running
  }
}
```

Nota: `specRef: parseSpecRef(text)` grava `undefined` quando não há linha — compatível com `specRef?: string` (sem `exactOptionalPropertyTypes`). O teste de scan vazio usa `toEqual`, que ignora chaves `undefined`; se o kit de testes do `claude-code/testing` comparar `undefined` estritamente, trocar para `...(ref ? { specRef: ref } : {})`.

- [ ] **Step 4: Rodar e ver passar**

Run: `claude plugin test . && npx -y -p typescript@5.6.3 tsc -p .`
Expected: PASS; tsc sem saída.

- [ ] **Step 5: Commit**
```bash
git add hooks/scan.ts tests/scan.test.ts
git commit -m "feat: varredura de docs/superpowers com serialização"
```

---

### Task 4: Formatação de linhas e resumo em texto (`summary.ts`)

**Goal:** Implementar os textos compartilhados pelo painel e por `/sp status`.

**Files:**
- Create: `hooks/summary.ts`, `tests/summary.test.ts`

**Acceptance Criteria:**
- [ ] `taskLine` gera `▶ T8 X  em andamento`, `○ T9 X  🔒 user-gate`, `⊘ T10 X  bloqueada por T9`, `✓ T1 X`, removendo o prefixo `Task N: `
- [ ] `bar(7, 9)` gera barra de 10 células `███████░░░` proporcional; `bar(0, 0)` só células vazias
- [ ] `summarize` produz fase, plano ativo com progresso, grupos do plano, fora do plano e os quatro blocos do projeto; sem dados → `Nenhum dado superpowers neste projeto.`

**Verify:** `claude plugin test .` → todos os testes de `tests/summary.test.ts` passam

**Steps:**

- [ ] **Step 1: Escrever o teste que falha** — `tests/summary.test.ts`:
```ts
import { expect, test } from 'claude-code/testing'

import type { Live, PlanTask, Project } from '../types'
import { derive } from '../hooks/link'
import { bar, displaySubject, summarize, taskLine } from '../hooks/summary'

const t = (id: number, status: PlanTask['status'], extra: Partial<PlanTask> = {}): PlanTask =>
  ({ id, subject: `Task ${id}: Item ${id}`, status, blockedBy: [], userGate: false, ...extra })

test('displaySubject remove o prefixo Task N:', async () => {
  expect(displaySubject('Task 3: Faz algo')).toBe('Faz algo')
  expect(displaySubject('Livre')).toBe('Livre')
})

test('taskLine por status', async () => {
  const tasks = [t(1, 'completed'), t(8, 'in_progress'), t(9, 'pending', { userGate: true }), t(10, 'pending', { blockedBy: [9] })]
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

test('summarize sem dados', async () => {
  const project: Project = { specs: [], plans: [], scannedAt: 0, hasSuperpowersDir: false }
  const live: Live = { sessionTasks: {} }
  expect(summarize(derive(project, live), project, live)).toBe('Nenhum dado superpowers neste projeto.')
})

test('summarize completo', async () => {
  const project: Project = {
    hasSuperpowersDir: true,
    scannedAt: 1,
    specs: [{ path: 'docs/superpowers/specs/2026-01-01-billing-design.md', slug: 'billing', date: '2026-01-01' }],
    plans: [{
      path: 'docs/superpowers/plans/2026-01-02-auth.md', slug: 'auth', date: '2026-01-02',
      tasksFile: 'ok', tasks: [t(0, 'completed'), t(1, 'in_progress')],
    }],
  }
  const live: Live = {
    phase: 'executing-plans',
    activePlan: 'docs/superpowers/plans/2026-01-02-auth.md',
    sessionTasks: { '5': { id: '5', subject: 'Revisar', status: 'pending', blockedBy: [] } },
  }
  expect(summarize(derive(project, live), project, live)).toBe([
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
    '  · 2026-01-02-auth.md  1/2',
    '⚠ 1 plano(s) sem spec',
    '  · 2026-01-02-auth.md',
  ].join('\n'))
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `claude plugin test .`
Expected: FAIL (módulo `../hooks/summary` inexistente)

- [ ] **Step 3: Implementar `hooks/summary.ts`**
```ts
import type { Live, PlanTask, Project, SessionTask } from '../types'
import { groupTasks, isBlocked, type Derived, type PlanView } from './link'

const CELLS = 10

export const baseName = (path: string): string => path.split('/').pop() ?? path

export const displaySubject = (subject: string): string => subject.replace(/^Task\s+\d+:\s*/, '')

export const bar = (done: number, total: number): string => {
  const full = total === 0 ? 0 : Math.round((done / total) * CELLS)
  return '█'.repeat(full) + '░'.repeat(CELLS - full)
}

export const taskLine = (task: PlanTask, tasks: readonly PlanTask[]): string => {
  const name = `T${task.id} ${displaySubject(task.subject)}`
  const gate = task.userGate ? '  🔒 user-gate' : ''
  if (task.status === 'completed') return `✓ ${name}`
  if (task.status === 'in_progress') return `▶ ${name}  em andamento${gate}`
  if (isBlocked(task, tasks)) {
    const deps = task.blockedBy
      .filter(id => tasks.some(one => one.id === id && one.status !== 'completed'))
      .map(id => `T${id}`)
      .join(', ')
    return `⊘ ${name}  bloqueada por ${deps}${gate}`
  }
  return `○ ${name}${gate}`
}

export const sessionLine = (task: SessionTask): string => {
  const mark = task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▶' : '○'
  return `${mark} ${task.subject}`
}

export const phaseLine = (live: Live): string => `Fase: ${live.phase ? `▶ ${live.phase}` : '—'}`

export const planLine = (plan: PlanView): string =>
  `Plano: ${baseName(plan.path)}  ${bar(plan.done, plan.total)} ${plan.done}/${plan.total}`

export const incompleteItem = (plan: PlanView): string =>
  `  · ${baseName(plan.path)}  ${plan.label ?? `${plan.done}/${plan.total}`}`

export const withoutSpecItem = (plan: PlanView): string =>
  `  · ${baseName(plan.path)}${plan.specMissing ? '  (spec ausente)' : ''}`

export const isEmpty = (project: Project, live: Live): boolean =>
  !project.hasSuperpowersDir && Object.keys(live.sessionTasks).length === 0 && live.phase === undefined

export const orderedPlanTasks = (plan: PlanView): PlanTask[] => {
  const groups = groupTasks(plan.tasks)
  return [...groups.running, ...groups.pending, ...groups.blocked, ...groups.done]
}

export const summarize = (derived: Derived, project: Project, live: Live): string => {
  if (isEmpty(project, live)) return 'Nenhum dado superpowers neste projeto.'
  const lines = [phaseLine(live)]
  if (derived.active) lines.push(planLine(derived.active))
  if (live.syncNote) lines.push(live.syncNote)
  if (derived.active) {
    const active = derived.active
    lines.push('', 'PLANO ATUAL', ...orderedPlanTasks(active).map(task => taskLine(task, active.tasks)))
  }
  if (derived.outside.length > 0) lines.push('', 'FORA DO PLANO (sessão)', ...derived.outside.map(sessionLine))
  lines.push('', 'PROJETO')
  const before = lines.length
  if (derived.specsWithoutPlan.length > 0) {
    lines.push(`⚠ ${derived.specsWithoutPlan.length} spec(s) sem plano`,
      ...derived.specsWithoutPlan.map(spec => `  · ${baseName(spec.path)}`))
  }
  if (derived.incomplete.length > 0) {
    lines.push(`◐ ${derived.incomplete.length} plano(s) incompleto(s)`, ...derived.incomplete.map(incompleteItem))
  }
  if (derived.withoutSpec.length > 0) {
    lines.push(`⚠ ${derived.withoutSpec.length} plano(s) sem spec`, ...derived.withoutSpec.map(withoutSpecItem))
  }
  if (derived.complete.length > 0) {
    lines.push(`✓ ${derived.complete.length} plano(s) concluído(s)`,
      ...derived.complete.map(plan => `  · ${baseName(plan.path)}`))
  }
  if (lines.length === before) lines.push('Nenhuma spec ou plano ainda.')
  return lines.join('\n')
}
```

Nota sobre o teste de `bar(7, 9)`: `Math.round(7/9*10) = 8`, por isso o esperado é `████████░░`.

- [ ] **Step 4: Rodar e ver passar**

Run: `claude plugin test . && npx -y -p typescript@5.6.3 tsc -p .`
Expected: PASS; tsc sem saída.

- [ ] **Step 5: Commit**
```bash
git add hooks/summary.ts tests/summary.test.ts
git commit -m "feat: formatação de linhas e resumo /sp status"
```

---

### Task 5: Painel, atoms e ligação dos eventos (`register.tsx`)

**Goal:** Ligar todos os eventos do engine ao estado e desenhar o painel `Superpowers`, com teste de mod ponta a ponta.

**Files:**
- Create: `hooks/atoms.ts`, `hooks/pane.tsx`, `tests/register.test.tsx`
- Modify: `hooks/register.tsx` (substitui o stub inteiro)

**Acceptance Criteria:**
- [ ] `session.start` registra `/sp`, varre o projeto, faz backfill (replay + TaskList) e abre o pane quando há `docs/superpowers/`
- [ ] `TaskCreate`/`TaskUpdate`/`Skill`/`Read`/`Write`/`Edit` bem-sucedidos atualizam `live`; o resultado da ferramenta é devolvido inalterado
- [ ] `Write`/`Edit` em `docs/superpowers/` e `turn.complete` disparam revarredura
- [ ] `prompt.submit` com `/superpowers-extended-cc:<skill>` atualiza a fase
- [ ] `/sp` alterna o pane; `/sp status` devolve `summarize`; `/sp sync` revarre + backfill; outro argumento devolve o uso
- [ ] O pane mostra fase, plano ativo, tarefas, fora do plano e alertas; concluídas recolhidas com botão de expandir
- [ ] Falha do `TaskList` no backfill grava `syncNote: 'sincronização parcial'`

**Verify:** `claude plugin test . && claude plugin validate . && npx -y -p typescript@5.6.3 tsc -p .` → tudo passa

**Steps:**

- [ ] **Step 1: Escrever o teste de mod que falha** — `tests/register.test.tsx`:
```tsx
import { expect, test } from 'claude-code/testing'

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

const engine = (on: Parameters<Parameters<typeof test>[1]>[1], taskList: unknown = { tasks: [] }) => {
  const opened: string[] = []
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
    if (e.tool === 'TaskList') return taskList === 'deny' ? { deny: 'negado' } : { result: taskList }
    if (e.tool === 'TaskCreate') return { result: { task: { id: '42', subject: String((e as { subject?: unknown }).subject) } } }
    return { result: { success: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return opened
}

const settle = () => new Promise(resolve => setTimeout(resolve, 20))

test('abre o pane e mostra os alertas do projeto', async ($, on) => {
  const opened = engine(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  expect(opened).toContain('superpowers')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /specs? sem plano/ }))?.text).toBe('⚠ 1 spec(s) sem plano')
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
  const sync = await $.command.run({ command: 'sp', args: 'sync' })
  expect(sync.text).toBe('Superpowers: sincronizado.')
  const status = await $.command.run({ command: 'sp', args: 'status' })
  expect(status.text?.split('\n')[0]).toBe('Fase: —')
  expect(status.text).toContain('PLANO ATUAL')
  const usage = await $.command.run({ command: 'sp', args: 'xyz' })
  expect(usage.text).toBe('Uso: /sp (abre/fecha o painel) · /sp status · /sp sync')
})

test('TaskList negado no backfill marca sincronização parcial', async ($, on) => {
  engine(on, 'deny')
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle()
  const status = await $.command.run({ command: 'sp', args: 'status' })
  expect(status.text).toContain('sincronização parcial')
})
```

Nota para o executor: os nomes das operações mockadas (`fs.exists`, `fs.list`, `fs.read`, `session.root`, `session.messages`, `ui.open`, `ui.close`, `ui.panes`, `command.register`) e o formato `{ value }` seguem `examples/pane.test.tsx` e o mapa de operações em `.claude-plugin/types/claude-code/index.d.ts` (procure `'fs.read': {`). Se `$.command.run` exigir mais campos no teste, confira `CommandRunInput` no mesmo arquivo e complete só os campos obrigatórios; não altere as asserções.

- [ ] **Step 2: Rodar e ver falhar**

Run: `claude plugin test .`
Expected: FAIL (o stub de `register.tsx` não registra nada: `opened` vazio / comando inexistente)

- [ ] **Step 3: Implementar `hooks/atoms.ts`**
```ts
import { atom } from 'claude-code'

import type { Project } from '../types'
import { EMPTY_LIVE } from './live'

export const PLUGIN = 'superpowers-panel'
export const PANE = 'superpowers'
export const TITLE = 'Superpowers'

export const EMPTY_PROJECT: Project = { specs: [], plans: [], scannedAt: 0, hasSuperpowersDir: false }

// Trocar o shape quando o formato mudar: declina o que uma versão anterior guardou.
export const projectAtom = atom({ plugin: PLUGIN, key: 'project' } as const, EMPTY_PROJECT, { shape: 'project-1' })
export const liveAtom = atom({ plugin: PLUGIN, key: 'live' } as const, EMPTY_LIVE, { shape: 'live-1' })
export const expandedAtom = atom({ plugin: PLUGIN, key: 'expanded' } as const, [] as string[], { shape: 'expanded-1' })
```

- [ ] **Step 4: Implementar `hooks/pane.tsx`**
```tsx
import type { Hook } from 'claude-code'
import { read, update } from 'claude-code'

import { expandedAtom, liveAtom, projectAtom } from './atoms'
import { derive, groupTasks } from './link'
import {
  baseName, incompleteItem, isEmpty, phaseLine, planLine, sessionLine, taskLine, withoutSpecItem,
} from './summary'

export const renderPane: Hook<'ui.render'> = async ($, e) => {
  const { Box, Text, Button } = $.ui.resolve(e)
  const project = await read($, projectAtom)
  const live = await read($, liveAtom)
  const expanded = await read($, expandedAtom)
  const toggle = (key: string) => () => {
    void update($, expandedAtom, list => (list.includes(key) ? list.filter(one => one !== key) : [...list, key]))
  }

  if (isEmpty(project, live)) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Nenhum dado superpowers neste projeto.</Text>
      </Box>
    )
  }

  const derived = derive(project, live)
  const active = derived.active
  const groups = active ? groupTasks(active.tasks) : undefined
  const showDone = expanded.includes('done')
  const showComplete = expanded.includes('complete')
  const hasAlerts = derived.specsWithoutPlan.length + derived.incomplete.length +
    derived.withoutSpec.length + derived.complete.length > 0

  return (
    <Box flexDirection="column">
      <Text bold>{phaseLine(live)}</Text>
      {active && <Text>{planLine(active)}</Text>}
      {live.syncNote && <Text color="warning">{live.syncNote}</Text>}

      {active && groups && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>PLANO ATUAL</Text>
          {[...groups.running, ...groups.pending, ...groups.blocked].map(task => (
            <Text color={task.status === 'in_progress' ? 'claude' : undefined}>{taskLine(task, active.tasks)}</Text>
          ))}
          {groups.done.length > 0 && (
            <Button key="done" label={`${showDone ? '▾' : '▸'} ✓ ${groups.done.length} concluída(s)`} onPress={toggle('done')} plain />
          )}
          {showDone && groups.done.map(task => <Text dimColor>{taskLine(task, active.tasks)}</Text>)}
        </Box>
      )}

      {derived.outside.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>FORA DO PLANO (sessão)</Text>
          {derived.outside.map(task => <Text>{sessionLine(task)}</Text>)}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold>PROJETO</Text>
        {!hasAlerts && <Text dimColor>Nenhuma spec ou plano ainda.</Text>}
        {derived.specsWithoutPlan.length > 0 && (
          <Text color="warning">{`⚠ ${derived.specsWithoutPlan.length} spec(s) sem plano`}</Text>
        )}
        {derived.specsWithoutPlan.map(spec => <Text>{`  · ${baseName(spec.path)}`}</Text>)}
        {derived.incomplete.length > 0 && (
          <Text color="suggestion">{`◐ ${derived.incomplete.length} plano(s) incompleto(s)`}</Text>
        )}
        {derived.incomplete.map(plan => <Text>{incompleteItem(plan)}</Text>)}
        {derived.withoutSpec.length > 0 && (
          <Text color="warning">{`⚠ ${derived.withoutSpec.length} plano(s) sem spec`}</Text>
        )}
        {derived.withoutSpec.map(plan => <Text>{withoutSpecItem(plan)}</Text>)}
        {derived.complete.length > 0 && (
          <Button key="complete" label={`${showComplete ? '▾' : '▸'} ✓ ${derived.complete.length} plano(s) concluído(s)`} onPress={toggle('complete')} plain />
        )}
        {showComplete && derived.complete.map(plan => <Text dimColor>{`  · ${baseName(plan.path)}`}</Text>)}
      </Box>
    </Box>
  )
}
```

Nota para o executor: se `tsc` recusar `marginTop` em `Box` ou `plain`/`label` em `Button`, confira `BoxProps`/`ButtonProps` no arquivo de tipos e use a prop equivalente que existir (ex.: um `<Text> </Text>` vazio como espaçador); o texto exibido e as asserções do teste não mudam.

- [ ] **Step 5: Implementar `hooks/register.tsx`** (substitui o stub)
```tsx
import type { EngineInterface, Register } from 'claude-code'
import { read, update } from 'claude-code'

import { liveAtom, PANE, projectAtom, TITLE } from './atoms'
import { derive } from './link'
import { applyEvent, parsePromptSkill, replay, taskListOf, toolEvent, type MessageLike } from './live'
import { renderPane } from './pane'
import { coalesce, isSuperpowersPath, scanProject, type FsLike } from './scan'
import { summarize } from './summary'

const WATCHED = new Set(['TaskCreate', 'TaskUpdate', 'Skill', 'Read', 'Write', 'Edit'])
const USAGE = 'Uso: /sp (abre/fecha o painel) · /sp status · /sp sync'

const debug = ($: EngineInterface, error: unknown) =>
  $.ui.log(`superpowers-panel: ${String(error)}`, { to: 'debug' })

const fsOf = ($: EngineInterface): FsLike => ({
  exists: path => $.fs.exists(path),
  list: path => $.fs.list(path),
  read: path => $.fs.read(path) as Promise<string>,
})

const rescan = coalesce(async ($: EngineInterface) => {
  const project = await scanProject(fsOf($), await $.session.root(), Date.now())
  await update($, projectAtom, () => project)
})

const backfill = async ($: EngineInterface) => {
  const messages = await $.session.messages()
  let live = replay(Array.isArray(messages) ? (messages as readonly MessageLike[]) : [])
  try {
    const ran = await $.tool.call({ tool: 'TaskList' })
    const tasks = 'deny' in ran && ran.deny !== undefined ? undefined : taskListOf(ran.result)
    if (!tasks) throw new Error('TaskList indisponível')
    live = { ...applyEvent(live, { kind: 'snapshot', tasks }), syncNote: undefined }
  } catch (error) {
    debug($, error)
    live = { ...live, syncNote: 'sincronização parcial' }
  }
  const synced = live
  await update($, liveAtom, () => synced)
}

const initialize = async ($: EngineInterface) => {
  await rescan($)
  await backfill($)
  if ((await read($, projectAtom)).hasSuperpowersDir) await $.ui.open({ id: PANE, title: TITLE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sp', description: 'Painel superpowers: /sp, /sp status, /sp sync' })
    void initialize($).catch(error => debug($, error))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (!WATCHED.has(tool)) return next(e)
    const ran = await next(e)
    try {
      const isDenied = 'deny' in ran && ran.deny !== undefined
      if (!isDenied && !ran.isError) {
        const input = e as unknown as Record<string, unknown>
        const event = toolEvent(tool, input, ran.result)
        if (event) await update($, liveAtom, live => applyEvent(live, event))
        if ((tool === 'Write' || tool === 'Edit') && isSuperpowersPath(input.file_path)) void rescan($)
      }
    } catch (error) {
      debug($, error)
    }
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    const skill = parsePromptSkill(e.text)
    if (skill) await update($, liveAtom, live => applyEvent(live, { kind: 'skill', ...skill })).catch(error => debug($, error))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void rescan($).catch(error => debug($, error))
    return next(e)
  })

  on('command.run', { command: 'sp' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'sync') {
      await rescan($)
      await backfill($)
      return { text: 'Superpowers: sincronizado.' }
    }
    if (arg === 'status') {
      const project = await read($, projectAtom)
      const live = await read($, liveAtom)
      return { text: summarize(derive(project, live), project, live) }
    }
    if (arg !== '') return { text: USAGE }
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: 'Painel superpowers fechado.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Painel superpowers aberto.' : `Painel aguardando espaço: ${opened.reason}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, renderPane)
}
```

Nota para o executor: se `tsc` apontar que `ran.isError`/`ran.result` não existem na união `ToolCallResult` antes do estreitamento, estreite com `if ('deny' in ran && ran.deny !== undefined) return ran` antes de ler `ran.result`; se `opened.reason` não existir no ramo `isPlaced: true`, leia-o após estreitar por `!opened.isPlaced`. Não mude o comportamento.

- [ ] **Step 6: Rodar e ver passar**

Run: `claude plugin test . && claude plugin validate . && npx -y -p typescript@5.6.3 tsc -p .`
Expected: PASS em todos os arquivos de teste; validate lista os hooks `session.start`, `tool.call`, `prompt.submit`, `turn.complete`, `command.run`, `ui.render` sem erros; tsc sem saída.

- [ ] **Step 7: Commit**
```bash
git add hooks tests
git commit -m "feat: painel superpowers e ligação dos eventos do engine"
```

---

### Task 6: Carregar o mod nesta sessão e conferir ao vivo

**Goal:** Carregar o mod no Claude Code e confirmar, num projeto real com `docs/superpowers/`, que o painel abre e reflete specs, planos e tarefas.

**Files:**
- Create: `README.md`

**Acceptance Criteria:**
- [ ] `claude --plugin-dir /Volumes/DevSSD/dev/superpowers-mod` neste repositório abre o pane `Superpowers` automaticamente
- [ ] O pane mostra `⚠ 0`/ausência de "spec sem plano" para `2026-10-28-superpowers-panel-design.md` (este plano liga a ela) e lista `2026-10-28-superpowers-panel.md` como incompleto ou concluído conforme o `.tasks.json`
- [ ] `/sp status` imprime o resumo; `/sp` fecha e reabre o pane
- [ ] Criar uma tarefa nativa (`TaskCreate`) aparece em "FORA DO PLANO" sem precisar de `/sp sync`
- [ ] Uma sessão retomada (`--resume`) com tarefas já criadas as mostra após carregar (backfill)

**Verify:** `claude --plugin-dir /Volumes/DevSSD/dev/superpowers-mod` neste repo, depois `/sp status` → primeira linha `Fase: …` e bloco `PROJETO` com os planos deste repositório

**Steps:**

- [ ] **Step 1: Escrever `README.md`**
```markdown
# superpowers-panel

Mod para Claude Code que mostra, num painel lateral, o fluxo do
[superpowers-extended-cc](https://github.com/pcvelz/superpowers):

- fase atual (skill superpowers ativa) e plano em execução com progresso;
- tarefas do plano (em andamento, pendentes, bloqueadas, user-gates, concluídas);
- tarefas da sessão fora do plano;
- specs sem plano, planos incompletos, planos sem spec e planos concluídos.

## Uso

    claude --plugin-dir /caminho/para/superpowers-mod

O painel abre sozinho em projetos com `docs/superpowers/`.

- `/sp` — abre/fecha o painel
- `/sp status` — resumo em texto
- `/sp sync` — relê o projeto e as tarefas da sessão

## Desenvolvimento

    claude plugin test .
    claude plugin validate .
    npx -y -p typescript@5.6.3 tsc -p .
```

- [ ] **Step 2: Rodar a verificação automática final**

Run: `claude plugin test . && claude plugin validate .`
Expected: PASS; sem erros.

- [ ] **Step 3: Verificação ao vivo (pela pessoa, guiada pelo agente)**

Pedir à pessoa que abra, num terminal com ≥ 110 colunas, `claude --plugin-dir /Volumes/DevSSD/dev/superpowers-mod` dentro deste repositório e confira cada critério de aceite acima, colando a saída de `/sp status`. Alternativa nesta sessão: copiar a pasta do plugin (sem `.git`, `docs`, `tests`) para a pasta de mods da sessão indicada pela skill `plugin-authoring` e aceitar "Turn them on".

- [ ] **Step 4: Commit**
```bash
git add README.md
git commit -m "docs: README do superpowers-panel"
```
