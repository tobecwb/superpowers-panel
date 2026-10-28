# Code Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limpar o código do `superpowers-panel` (código morto, complexidade, nomes, comentários e testes em inglês) e instalar uma guarda (`bun run check` + git pre-commit) que impede regressão.

**Architecture:** Ferramentas só de desenvolvimento num `package.json` (Biome para lint/format/complexidade, Knip para código morto entre arquivos, TypeScript fixo). Uma heurística própria em `scripts/` (Bun + TypeScript compiler API) acusa comentários em português. A limpeza é feita em passos pequenos, cada um com a suíte existente verde e os textos de UI intactos. O pre-commit versionado em `.githooks/` roda o `check`.

**Tech Stack:** TypeScript/TSX, Biome 2.6.3, Knip 6.43.0, TypeScript 5.9.3, Bun 1.3 (`bun test` só para `scripts/`), `claude plugin test` / `claude plugin validate` (Claude Code 2.1.312).

**Spec:** `docs/superpowers/specs/2026-10-28-code-quality-design.md`

## Global Constraints

- **Comportamento intocado:** nenhuma asserção existente em `tests/*.test.ts(x)` pode mudar de valor esperado. Só as descrições de `test('…')` são traduzidas (Task 7). Os textos de UI continuam em PT-BR, byte a byte.
- **Chaves de UI preservadas:** os botões de plano no pane usam a chave `plan:<path>` (lista de incompletos e de concluídos) e `nospec:<path>` (lista de sem spec); os toggles usam `done`, `complete` e `detail-close`. O teste `tests/register.test.tsx` depende de `plan:…` e de `detail-close`.
- **Restrições do engine** (não quebrar):
  - os atoms ficam declarados em `hooks/register.tsx`, porque `read`/`update` só aceitam um atom declarado no arquivo da chamada;
  - `$` só pode ser passado a funções declaradas no topo do arquivo;
  - `update($, someAtom, …)` precisa ter o atom escrito no ponto da chamada.
- **Nada em `hooks/` importa de `node_modules`:** o engine carrega `hooks/` sem dependências; Biome/Knip/TypeScript/Bun são só de desenvolvimento.
- Os testes do mod importam `claude-code/testing` e rodam com `claude plugin test .`, que coleta **todo** `*.test.ts` do repositório. Os testes de `scripts/` usam `bun:test` e por isso **devem** se chamar `*.spec.ts`; o `claude plugin test` ignora `.spec.ts`, e isso foi verificado.
- **Versões exatas:** `@biomejs/biome` 2.6.3, `knip` 6.43.0, `typescript` 5.9.3, `@types/bun` 1.4.4.
- **Biome 2.6:** o campo do preset é `"preset": "recommended"`. A forma antiga `"recommended": true` está depreciada.
- **Estilo de formatação:** aspas simples, JSX com aspas duplas, sem ponto e vírgula (`asNeeded`), 2 espaços, `lineWidth` 120, `arrowParentheses: asNeeded`, `trailingCommas: all`.
- Complexidade cognitiva máxima: **10**.
- Mensagens de commit seguem o padrão do repo: prefixo convencional + descrição em PT-BR.

**User decisions (already made):**
- Objetivo: limpeza única **e** guarda automática contra regressão.
- Ferramentas: abordagem A, Biome + Knip, com `package.json` só de devDependencies.
- Complexidade cognitiva máxima = 10; `lineWidth` = 120.
- Guarda: script `check` local **e** git pre-commit hook (sem husky; `core.hooksPath`).
- O pre-commit roda **tudo**, inclusive os testes.
- Identificadores, comentários e **descrições de teste** em inglês; interface em PT-BR.
- Convenções escritas em `CLAUDE.md` na raiz, com link no README.
- Fora do escopo: CI, tradução da UI, mudança de comportamento, testes além dos da função extraída e do script.

## Review Focus

1. **Português dentro de strings, template literals, regex ou texto JSX** (ex.: `'Não há dados'`, `` `para ${x}` ``, `/não|sem/`, `<Text>// não</Text>`) **não** pode ser acusado como comentário, ou o check passa a falhar com os textos de UI legítimos. O teste está na Task 6.
2. **Palavra portuguesa como pedaço de palavra inglesa** (`compare`, `parameter`, `semantic`, `queue`, `example.com`) **não** pode ser acusada. O teste está na Task 6.
3. **Comentário JSX `{/* sem dados */}` em `.tsx`** e comentários que começam com maiúscula acentuada (`// Não`, `// ÚLTIMO`) **devem** ser acusados. O teste está na Task 6.
4. **Arrow function genérica em `.ts`** (`<T>(value: T) => …`, como `coalesce` em `hooks/scan.ts`) não pode ser lida como JSX pelo detector: arquivo `.ts` é parseado como TS, `.tsx` como TSX. O teste está na Task 6.
5. **Plano que está ao mesmo tempo em "incompleto" e em "sem spec"** (o `2026-09-02-hotfix.md` das fixtures) precisa continuar com duas chaves distintas no pane depois da extração de `projectSections`: `plan:…hotfix.md` e `nospec:…hotfix.md`. O teste está na Task 4.

---

### Task 0: Ferramentas em modo relatório

**Goal:** Adicionar `package.json`, `biome.json` e `knip.json`, instalar as devDependencies e expor scripts separados, com typecheck e testes verdes e lint/deadcode rodando (com violações, por enquanto).

**Files:**
- Create: `package.json`, `biome.json`, `knip.json`, `bun.lock` (gerado)
- Modify: `.gitignore`, `README.md` (seção "Desenvolvimento")

**Acceptance Criteria:**
- [ ] `bun install` conclui e gera `bun.lock`; `node_modules/` aparece ignorado em `git status`
- [ ] `bun run typecheck` sai com código 0 (TypeScript 5.9.3)
- [ ] `bun run test` sai com código 0: validate passa e `claude plugin test` mostra 48 pass / 0 fail
- [ ] `bunx biome check .` roda sem erro de **configuração** (violações de lint/format são esperadas aqui)
- [ ] `bunx knip` roda sem erro de configuração (achados são esperados aqui)
- [ ] O README não menciona mais `npx -y -p typescript@5.6.3`

**Verify:** `bun install && bun run typecheck && bun run test` → tsc sem saída, `48 pass`, `0 fail`

**Steps:**

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "superpowers-panel",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p .",
    "lint": "biome check .",
    "deadcode": "knip",
    "test": "claude plugin validate . && claude plugin test .",
    "check": "bun run typecheck && bun run lint && bun run deadcode && bun run test",
    "fix": "biome check --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "2.6.3",
    "knip": "6.43.0",
    "typescript": "5.9.3"
  }
}
```

- [ ] **Step 2: Criar `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.6.3/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!docs/**", "!.claude-plugin/types/**"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 120 },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "jsxQuoteStyle": "double",
      "semicolons": "asNeeded",
      "arrowParentheses": "asNeeded",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "rules": {
      "preset": "recommended",
      "complexity": {
        "noExcessiveCognitiveComplexity": { "level": "error", "options": { "maxAllowedComplexity": 10 } }
      },
      "correctness": { "noUnusedVariables": "error", "noUnusedImports": "error" },
      "style": {
        "noNestedTernary": "error",
        "useBlockStatements": "off",
        "useNamingConvention": {
          "level": "error",
          "options": {
            "strictCase": false,
            "conventions": [
              { "selector": { "kind": "objectLiteralProperty" }, "formats": ["camelCase", "snake_case"] },
              { "selector": { "kind": "typeProperty" }, "formats": ["camelCase", "snake_case", "PascalCase"] }
            ]
          }
        }
      }
    }
  },
  "overrides": [
    {
      "includes": ["tests/**"],
      "linter": { "rules": { "style": { "noNonNullAssertion": "off" } } }
    }
  ]
}
```

Por que cada exceção existe:
- `snake_case` em propriedades: chaves de APIs externas, como `file_path`, `new_cwd`, `tool_use_id` e `in_progress`.
- `PascalCase` em propriedades de tipo: construtores de elemento (`Box`, `Text`, `Button`) em `PaneElements`.
- `noNonNullAssertion` desligado só em `tests/`: com `noUncheckedIndexedAccess`, o `!` em fixtures é idiomático, e se a fixture estiver errada o teste quebra de qualquer jeito.

- [ ] **Step 3: Criar `knip.json`**

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["hooks/register.tsx", "tests/**/*.test.{ts,tsx}"],
  "project": ["hooks/**/*.{ts,tsx}", "types/**/*.ts", "tests/**/*.{ts,tsx}"],
  "ignoreDependencies": ["claude-code"],
  "ignoreBinaries": ["claude"]
}
```

`claude-code` e `claude-code/testing` vêm do engine, e o binário `claude` é a CLI do Claude Code, que fica fora do `package.json`. Esses são os **únicos** ignores permitidos: nunca ignore um arquivo ou export de `hooks/`.

- [ ] **Step 4: Acrescentar `node_modules/` ao `.gitignore`**

O arquivo final fica:

```
.claude-plugin/types/
node_modules/
```

- [ ] **Step 5: Instalar e rodar o baseline**

Run: `bun install && bun run typecheck && bun run test`
Expected: tsc sem saída; `48 pass`, `0 fail`.

Se o TypeScript 5.9.3 acusar erros que o 5.6.3 não acusava, corrija o tipo apontado sem mudar comportamento e registre a correção na mensagem de commit.

Run: `bunx biome check . 2>&1 | tail -3 ; bunx knip ; true`
Expected: listas de violações, sem `configuration resulted in errors`. Baseline de lint conhecido, medido em 2026-10-28:
- formatação em 13 arquivos;
- `noNestedTernary` em `hooks/summary.ts` (2) e `hooks/link.ts` (1);
- `noExcessiveCognitiveComplexity` em `hooks/register.tsx` (handler `tool.call`), `hooks/parse.ts` (`parseTasksFile`), `hooks/pane.tsx` (`paneView`) e `hooks/live.ts` (`applyEvent`);
- `noNonNullAssertion` em `hooks/parse.ts` (3);
- `noUnusedFunctionParameters` em `hooks/register.tsx` (5).

Se aparecer erro de configuração do Knip (ex.: um plugin detectado automaticamente pedindo config), ajuste só o `knip.json`, mantendo a regra do Step 3.

- [ ] **Step 6: Atualizar a seção "Desenvolvimento" do README**

Substitua o bloco de "Desenvolvimento" por:

```markdown
## Desenvolvimento

    bun install        # instala as ferramentas e liga o pre-commit
    bun run check      # typecheck + lint + código morto + comentários + testes
    bun run fix        # aplica formatação e correções automáticas do Biome

Convenções de código em [`CLAUDE.md`](CLAUDE.md).
```

O `CLAUDE.md`, o script `comments` e o pre-commit só chegam nas Tasks 6 e 8. O link fica pendente até a Task 8, que é a última; isso é aceitável dentro do plano.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock biome.json knip.json .gitignore README.md
git commit -m "chore: ferramentas de code quality (Biome, Knip, TypeScript fixo) em modo relatório"
```

---

### Task 1: Formatação única

**Goal:** Aplicar o formatter e a organização de imports do Biome (assist `organizeImports`, que o `biome check` também cobra) a todo o repositório num commit que só contém formatação e ordem de imports.

**Files:**
- Modify: `hooks/*.ts(x)`, `tests/*.ts(x)`, `types/index.d.ts`, `tsconfig.json`, `.claude-plugin/plugin.json`, `hooks/hooks.json`, `package.json`, `biome.json`, `knip.json` (o que o formatter tocar)

**Acceptance Criteria:**
- [ ] `bunx biome check --linter-enabled=false .` sai com código 0 (formatação e imports em ordem)
- [ ] `bun run typecheck && bun run test` saem com código 0 (48 pass)
- [ ] O commit não contém nenhuma mudança além de quebras de linha, espaços, vírgulas finais e ordem de imports

**Verify:** `bunx biome check --linter-enabled=false . && bun run typecheck && bun run test` → sem diagnósticos, `48 pass`

**Steps:**

- [ ] **Step 1: Formatar e ordenar imports**

Run: `bunx biome check --write --linter-enabled=false .`

- [ ] **Step 2: Conferir que é só formatação**

Run: `git diff --stat && git diff | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | head -80`
Expected: só linhas reflowed e imports reordenados. Se algum token mudou (ex.: aspas trocadas dentro de um texto de UI), desfaça aquele arquivo e investigue a config antes de seguir.

- [ ] **Step 3: Rodar tipos e testes**

Run: `bun run typecheck && bun run test`
Expected: `48 pass`, `0 fail`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "style: formatação única com Biome"
```

---

### Task 2: Código morto e duplicação de `baseName`

**Goal:** Zerar os achados do Knip, unificar `baseName` num só lugar e eliminar os parâmetros não usados apontados pelo Biome.

**Files:**
- Modify: `hooks/atoms.ts`, `hooks/link.ts`, `hooks/summary.ts`, `hooks/pane.tsx`, `hooks/register.tsx`, e qualquer arquivo de `hooks/`/`types/` que o Knip apontar

**Acceptance Criteria:**
- [ ] `bun run deadcode` sai com código 0
- [ ] `grep -rn "const baseName" hooks/` retorna exatamente uma linha (`hooks/link.ts`)
- [ ] `bunx biome lint . 2>&1 | grep -c noUnusedFunctionParameters` imprime `0`
- [ ] `bun run typecheck && bun run test` saem com código 0 (48 pass)

**Verify:** `bun run deadcode && bun run typecheck && bun run test && grep -rn "const baseName" hooks/` → knip sem achados, `48 pass`, uma linha em `hooks/link.ts`

**Steps:**

- [ ] **Step 1: Remover a constante `PLUGIN`, que não tem uso**

Em `hooks/atoms.ts`, apague a linha `export const PLUGIN = 'superpowers-panel'`. Confirmado sem uso: `grep -rn "PLUGIN\b" hooks tests` só encontra a própria declaração.

- [ ] **Step 2: Unificar `baseName` em `hooks/link.ts`**

Em `hooks/link.ts`, troque `const baseName = (path: string) => path.split('/').pop() ?? path` por:

```ts
export const baseName = (path: string): string => path.split('/').pop() ?? path
```

Em `hooks/summary.ts`, apague a declaração local de `baseName` e importe-a:

```ts
import { baseName, groupTasks, isBlocked, type Derived, type PlanView } from './link'
```

Em `hooks/pane.tsx`, passe a importar `baseName` de `./link` em vez de `./summary` (por exemplo, `import { baseName, derive, groupTasks, type PlanView } from './link'`) e remova-o da lista importada de `./summary`.

- [ ] **Step 3: Parâmetros não usados nos `.catch` de hooks**

Em `hooks/register.tsx`, os cinco `.catch(($, e, next) => next(e))` viram:

```ts
.catch((_$, e, next) => next(e))
```

Mantenha os comentários de fim de linha que já existem (são traduzidos na Task 7). Se o `useNamingConvention` acusar `_$`, use `_engine` nos cinco lugares.

- [ ] **Step 4: Rodar o Knip e tratar cada achado**

Run: `bun run deadcode`

Para cada achado:
- **export não usado em lugar nenhum** → apague a declaração;
- **export usado só dentro do próprio arquivo** → tire o `export`;
- **tipo exportado não usado** (ex.: `TaskGroups`, `MessageLike`) → tire o `export` se ele for usado no arquivo; senão, apague;
- **arquivo não usado** → pare e reporte, porque nenhum arquivo de `hooks/` deveria estar órfão.

Repita até `bun run deadcode` sair com código 0. Não adicione ignores ao `knip.json`.

- [ ] **Step 5: Tipos e testes**

Run: `bun run typecheck && bun run test`
Expected: `48 pass`, `0 fail`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove código morto e unifica baseName"
```

---

### Task 3: Lint nas funções puras

**Goal:** Eliminar non-null assertions, ternários aninhados e complexidade excessiva de `hooks/parse.ts`, `hooks/live.ts`, `hooks/link.ts` e `hooks/summary.ts`, sem mudar resultados.

**Files:**
- Modify: `hooks/parse.ts`, `hooks/live.ts`, `hooks/link.ts`, `hooks/summary.ts`

**Acceptance Criteria:**
- [ ] `bunx biome lint hooks/parse.ts hooks/live.ts hooks/link.ts hooks/summary.ts` sai com código 0
- [ ] `bun run typecheck && bun run test` saem com código 0 (48 pass), sem alterar nenhuma asserção

**Verify:** `bunx biome lint hooks/parse.ts hooks/live.ts hooks/link.ts hooks/summary.ts && bun run typecheck && bun run test` → sem diagnósticos, `48 pass`

**Steps:**

- [ ] **Step 1: `hooks/parse.ts`, sem `!` e com `parseTasksFile` simplificado**

Substitua `parseName`, `parseMetadata` e `parseTasksFile` por:

```ts
export const parseName = (file: string): { date: string; slug: string } => {
  const base = file.replace(/\.md$/, '')
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(base)
  const rest = match?.[2] ?? base

  return { date: match?.[1] ?? '', slug: rest.replace(/-design$/, '') }
}

export const parseMetadata = (description: string): Record<string, unknown> | undefined => {
  const body = FENCE.exec(description)?.[1]
  if (body === undefined) return undefined
  try {
    const value: unknown = JSON.parse(body)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

const numbersIn = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : []

const toPlanTask = (task: unknown, index: number): PlanTask[] => {
  if (!task || typeof task !== 'object') return []
  const raw = task as Record<string, unknown>
  const description = typeof raw.description === 'string' ? raw.description : ''

  return [
    {
      id: typeof raw.id === 'number' ? raw.id : index,
      subject: typeof raw.subject === 'string' ? raw.subject : `Task ${index}`,
      status: toStatus(raw.status),
      blockedBy: numbersIn(raw.blockedBy),
      userGate: isUserGate(parseMetadata(description)),
    },
  ]
}

export const parseTasksFile = (text: string): PlanTask[] | undefined => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return undefined
  }
  const tasks = (data as { tasks?: unknown } | null)?.tasks
  if (!Array.isArray(tasks)) return undefined

  return tasks.flatMap(toPlanTask)
}
```

Se `isUserGate` estiver declarada depois de `toPlanTask`, tudo bem: são `const` usadas só em chamada.

- [ ] **Step 2: `hooks/live.ts`, `applyEvent` quebrado por tipo de evento**

Logo antes de `export const applyEvent`, adicione:

```ts
type UpdateEvent = Extract<LiveEvent, { kind: 'update' }>
type SkillEvent = Extract<LiveEvent, { kind: 'skill' }>
type TouchEvent = Extract<LiveEvent, { kind: 'touch' }>

const applyUpdate = (live: Live, event: UpdateEvent): Live => {
  const { [event.id]: current, ...rest } = live.sessionTasks
  if (event.status === 'deleted') return { ...live, sessionTasks: rest }
  // The native ID is never displayed: without a known subject there is nothing to show.
  if (!current && event.subject === undefined) return live
  const base: SessionTask = current ?? { id: event.id, subject: event.subject ?? '', status: 'pending', blockedBy: [] }
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

const applySkill = (live: Live, event: SkillEvent): Live => {
  if (!event.skill.startsWith(SKILL_PREFIX)) return live
  const phase = event.skill.slice(SKILL_PREFIX.length)
  const plan = PLAN_SKILLS.has(phase) && event.args ? extractPlanPath(event.args) : undefined
  return { ...live, phase, ...(plan ? { activePlan: plan } : {}) }
}

const applyTouch = (live: Live, event: TouchEvent): Live => {
  if (!event.path.endsWith('.tasks.json')) return live
  const plan = extractPlanPath(event.path)
  return plan ? { ...live, activePlan: plan } : live
}
```

E troque o corpo de `applyEvent` por:

```ts
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
    case 'update':
      return applyUpdate(live, event)
    case 'skill':
      return applySkill(live, event)
    case 'touch':
      return applyTouch(live, event)
    case 'snapshot':
      return { ...live, sessionTasks: Object.fromEntries(event.tasks.map(task => [task.id, task])) }
  }
}
```

- [ ] **Step 3: `hooks/link.ts`, `labelOf` sem ternário aninhado**

Troque `labelOf` por uma tabela:

```ts
const TASKS_FILE_LABEL: Record<Plan['tasksFile'], string | undefined> = {
  ok: undefined,
  missing: 'sem tasks.json',
  invalid: 'tasks.json inválido',
}

const labelOf = (plan: Plan): string | undefined => TASKS_FILE_LABEL[plan.tasksFile]
```

- [ ] **Step 4: `hooks/summary.ts`, `sessionLine` e `specLine` sem ternário aninhado**

Importe `TaskStatus` junto com os outros tipos (`import type { Live, PlanTask, Project, SessionTask, TaskStatus } from '../types'`) e troque as duas funções:

```ts
const STATUS_MARK: Record<TaskStatus, string> = { completed: '✓', in_progress: '▶', pending: '○' }

export const sessionLine = (task: SessionTask): string => `${STATUS_MARK[task.status]} ${task.subject}`
```

```ts
const specLine = (plan: PlanView): string => {
  if (plan.spec) return `Spec: ${baseName(plan.spec.path)}`
  if (plan.specMissing) return `Spec: ausente (${plan.specRef ?? ''})`
  return 'Spec: —'
}
```

- [ ] **Step 5: Lint, tipos e testes**

Run: `bunx biome lint hooks/parse.ts hooks/live.ts hooks/link.ts hooks/summary.ts && bun run typecheck && bun run test`
Expected: sem diagnósticos; `48 pass`, `0 fail`.

- [ ] **Step 6: Commit**

```bash
git add hooks/parse.ts hooks/live.ts hooks/link.ts hooks/summary.ts
git commit -m "refactor: reduz complexidade e remove ternários aninhados nas funções puras"
```

---

### Task 4: projectSections, pane em partes e tool.call

**Goal:** Extrair a montagem do bloco PROJETO para uma função pura usada tanto por `summarize` quanto pelo pane, quebrar `paneView` em partes com uma entrada só (objeto) e tirar a complexidade do handler `tool.call`, deixando `bun run lint` verde no repositório todo.

**Files:**
- Modify: `hooks/summary.ts`, `hooks/pane.tsx`, `hooks/register.tsx`
- Test: `tests/summary.test.ts`, `tests/register.test.tsx`

**Acceptance Criteria:**
- [ ] `projectSections` devolve só as seções não vazias, na ordem specsWithoutPlan → incomplete → withoutSpec → complete, com os textos atuais (teste novo)
- [ ] `summarize` e o pane consomem `projectSections`; nenhum dos dois monta mais os cabeçalhos `⚠ … spec(s) sem plano`, `◐ …`, `⚠ … plano(s) sem spec`, `✓ … plano(s) concluído(s)` por conta própria (`grep -c "spec(s) sem plano" hooks/*.ts*` = 1)
- [ ] O pane tem as chaves `plan:docs/superpowers/plans/2026-09-02-hotfix.md` **e** `nospec:docs/superpowers/plans/2026-09-02-hotfix.md` (teste novo)
- [ ] `paneView` recebe um único objeto `PaneInput`
- [ ] `bun run lint` sai com código 0 (repositório inteiro)
- [ ] `bun run typecheck && bun run test` saem com código 0; as 48 asserções originais intactas, mais os testes novos

**Verify:** `bun run lint && bun run typecheck && bun run test` → sem diagnósticos, `50 pass`, `0 fail`

**Steps:**

- [ ] **Step 1: Escrever o teste que falha para `projectSections`**

Em `tests/summary.test.ts`, inclua `projectSections` no import de `../hooks/summary` e adicione:

```ts
test('projectSections lists non-empty sections in display order', async () => {
  const project: Project = {
    hasSuperpowersDir: true,
    scannedAt: 0,
    specs: [{ path: 'docs/superpowers/specs/2026-01-01-orphan-design.md', slug: 'orphan', date: '2026-01-01' }],
    plans: [
      { path: 'docs/superpowers/plans/2026-01-02-done.md', slug: 'done', date: '2026-01-02', tasksFile: 'ok', tasks: [t(0, 'completed')] },
      { path: 'docs/superpowers/plans/2026-01-03-hotfix.md', slug: 'hotfix', date: '2026-01-03', tasksFile: 'missing', tasks: [] },
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `claude plugin test . 2>&1 | grep -E "projectSections|fail"`
Expected: FAIL, porque `projectSections` não é exportado.

- [ ] **Step 3: Implementar `projectSections` e usar em `summarize`**

Em `hooks/summary.ts`, adicione (depois de `withoutSpecItem`):

```ts
export type SectionId = 'specsWithoutPlan' | 'incomplete' | 'withoutSpec' | 'complete'

export type SectionItem = { label: string; planPath?: string }

export type ProjectSection = {
  id: SectionId
  header: string
  color?: 'warning' | 'suggestion'
  collapsible: boolean
  items: SectionItem[]
}

const planItems = (plans: readonly PlanView[], label: (plan: PlanView) => string): SectionItem[] =>
  plans.map(plan => ({ label: label(plan), planPath: plan.path }))

export const projectSections = (derived: Derived): ProjectSection[] => {
  const sections: ProjectSection[] = [
    {
      id: 'specsWithoutPlan',
      header: `⚠ ${derived.specsWithoutPlan.length} spec(s) sem plano`,
      color: 'warning',
      collapsible: false,
      items: derived.specsWithoutPlan.map(spec => ({ label: `  · ${baseName(spec.path)}` })),
    },
    {
      id: 'incomplete',
      header: `◐ ${derived.incomplete.length} plano(s) incompleto(s)`,
      color: 'suggestion',
      collapsible: false,
      items: planItems(derived.incomplete, incompleteItem),
    },
    {
      id: 'withoutSpec',
      header: `⚠ ${derived.withoutSpec.length} plano(s) sem spec`,
      color: 'warning',
      collapsible: false,
      items: planItems(derived.withoutSpec, withoutSpecItem),
    },
    {
      id: 'complete',
      header: `✓ ${derived.complete.length} plano(s) concluído(s)`,
      collapsible: true,
      items: planItems(derived.complete, completeItem),
    },
  ]
  return sections.filter(section => section.items.length > 0)
}
```

E troque o trecho de `summarize` que vai de `lines.push('', 'PROJETO')` até o `if (lines.length === before) …` por:

```ts
  lines.push('', 'PROJETO')
  const sections = projectSections(derived)
  if (sections.length === 0) lines.push('Nenhuma spec ou plano ainda.')
  for (const section of sections) lines.push(section.header, ...section.items.map(item => item.label))
  return lines.join('\n')
```

Run: `claude plugin test .`
Expected: `49 pass`, `0 fail`.

- [ ] **Step 4: Escrever o teste do pane com plano em duas listas**

Em `tests/register.test.tsx`, adicione:

```ts
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
```

Run: `claude plugin test .`
Expected: `50 pass`. Esse teste já passa com o pane atual e serve como rede de segurança para o Step 5.

- [ ] **Step 5: Reescrever `hooks/pane.tsx` em partes**

Substitua o arquivo inteiro por:

```tsx
import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import type { Live, PlanTask, Project } from '../types'
import { type Derived, derive, groupTasks, type PlanView } from './link'
import {
  detailLines,
  isEmpty,
  orderedPlanTasks,
  type ProjectSection,
  phaseLine,
  planLine,
  projectSections,
  type SectionId,
  type SectionItem,
  sessionLine,
  taskLine,
} from './summary'

export type PaneElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export type PaneInput = {
  elements: PaneElements
  project: Project
  live: Live
  expanded: readonly string[]
  selected: string
  onToggle: (key: string) => () => void
  onSelect: (path: string) => () => void
}

// Pure pane drawing. The atoms and `$` stay in register.tsx: the engine only
// accepts `read`/`update` with an atom declared in the calling file.

// A plan can be in two lists (incomplete and without spec): the key carries the list.
const ITEM_KEY_PREFIX: Record<SectionId, string> = {
  specsWithoutPlan: 'spec',
  incomplete: 'plan',
  withoutSpec: 'nospec',
  complete: 'plan',
}

const taskColor = (task: PlanTask) => (task.status === 'in_progress' ? 'claude' : undefined)

const arrow = (isOpen: boolean) => (isOpen ? '▾' : '▸')

const activePlanView = ({ elements, expanded, onToggle }: PaneInput, active: PlanView): RenderElement => {
  const { Box, Text, Button } = elements
  const groups = groupTasks(active.tasks)
  const showDone = expanded.includes('done')
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>PLANO ATUAL</Text>
      {[...groups.running, ...groups.pending, ...groups.blocked].map(task => (
        <Text color={taskColor(task)}>{taskLine(task, active.tasks)}</Text>
      ))}
      {groups.done.length > 0 && (
        <Button
          key="done"
          label={`${arrow(showDone)} ✓ ${groups.done.length} concluída(s)`}
          onPress={onToggle('done')}
          plain
        />
      )}
      {showDone && groups.done.map(task => <Text dimColor>{taskLine(task, active.tasks)}</Text>)}
    </Box>
  )
}

const outsideView = ({ elements }: PaneInput, derived: Derived): RenderElement => {
  const { Box, Text } = elements
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>FORA DO PLANO (sessão)</Text>
      {derived.outside.map(task => (
        <Text>{sessionLine(task)}</Text>
      ))}
    </Box>
  )
}

const sectionItemView = ({ elements, onSelect }: PaneInput, section: ProjectSection, item: SectionItem) => {
  const { Text, Button } = elements
  if (item.planPath === undefined) return <Text>{item.label}</Text>
  return (
    <Button
      key={`${ITEM_KEY_PREFIX[section.id]}:${item.planPath}`}
      label={item.label}
      onPress={onSelect(item.planPath)}
      plain
      dimColor={section.collapsible}
    />
  )
}

const sectionView = (input: PaneInput, section: ProjectSection): RenderElement[] => {
  const { Text, Button } = input.elements
  const isOpen = !section.collapsible || input.expanded.includes(section.id)
  const header = section.collapsible ? (
    <Button key={section.id} label={`${arrow(isOpen)} ${section.header}`} onPress={input.onToggle(section.id)} plain />
  ) : (
    <Text color={section.color}>{section.header}</Text>
  )
  const items = isOpen ? section.items.map(item => sectionItemView(input, section, item)) : []
  return [header, ...items]
}

const projectView = (input: PaneInput, derived: Derived): RenderElement => {
  const { Box, Text } = input.elements
  const sections = projectSections(derived)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>PROJETO</Text>
      {sections.length === 0 && <Text dimColor>Nenhuma spec ou plano ainda.</Text>}
      {sections.flatMap(section => sectionView(input, section))}
    </Box>
  )
}

const detailView = ({ elements, onSelect }: PaneInput, detail: PlanView): RenderElement => {
  const { Box, Text, Button } = elements
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>DETALHE</Text>
      {detailLines(detail)
        .slice(0, 2)
        .map(line => (
          <Text>{line}</Text>
        ))}
      {orderedPlanTasks(detail).map(task => (
        <Text color={taskColor(task)}>{taskLine(task, detail.tasks)}</Text>
      ))}
      <Button key="detail-close" label="✕ fechar" onPress={onSelect(detail.path)} plain />
    </Box>
  )
}

const selectedPlan = (derived: Derived, selected: string): PlanView | undefined =>
  selected === '' ? undefined : [...derived.incomplete, ...derived.complete].find(plan => plan.path === selected)

export const paneView = (input: PaneInput): RenderElement => {
  const { Box, Text } = input.elements
  const { project, live } = input
  if (isEmpty(project, live)) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Nenhum dado superpowers neste projeto.</Text>
      </Box>
    )
  }

  const derived = derive(project, live)
  const active = derived.active
  const detail = selectedPlan(derived, input.selected)

  return (
    <Box flexDirection="column">
      <Text bold>{phaseLine(live)}</Text>
      {active && <Text>{planLine(active)}</Text>}
      {live.syncNote && <Text color="warning">{live.syncNote}</Text>}
      {active && activePlanView(input, active)}
      {derived.outside.length > 0 && outsideView(input, derived)}
      {projectView(input, derived)}
      {detail && detailView(input, detail)}
    </Box>
  )
}
```

Notas:
- O `baseName` deixou de ser importado aqui, e os helpers `incompleteItem`, `completeItem` e `withoutSpecItem` são usados só dentro de `summary.ts`. Se o Knip acusar algum export que ficou sem uso, tire o `export`.
- Rode `bunx biome format --write hooks/pane.tsx` depois de colar, para alinhar o layout ao formatter.

- [ ] **Step 6: `hooks/register.tsx`, chamada de `paneView` e `tool.call` enxuto**

No handler `ui.render`, renomeie `toggle`→`onToggle` e `select`→`onSelect` e troque o `return` por:

```ts
    return paneView({ elements, project, live, expanded, selected, onToggle, onSelect })
```

Acima de `export const register`, adicione esta função de topo de arquivo (o `$` e o `update` com o atom escrito no ponto da chamada respeitam as restrições do engine):

```ts
const recordToolCall = async ($: EngineInterface, tool: string, input: Record<string, unknown>, result: unknown) => {
  const event = toolEvent(tool, input, result)
  if (event) await update($, liveAtom, live => applyEvent(live, event))
  const isSuperpowersWrite = (tool === 'Write' || tool === 'Edit') && isSuperpowersPath(input.file_path)
  if (isSuperpowersWrite) void rescan($).catch(error => debug($, error))
}
```

E troque o handler `tool.call` inteiro por:

```ts
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (!WATCHED.has(tool)) return next(e)
    const ran = await next(e)
    const isDenied = 'deny' in ran && ran.deny !== undefined
    if (isDenied || ran.isError) return ran
    const input = e as unknown as Record<string, unknown>
    await recordToolCall($, tool, input, ran.result).catch(error => debug($, error))
    return ran
  }).catch((_$, e, next) => next(e)) // fail open: never blocks the tool
```

O nome `ran` só é trocado na Task 5. Se o TypeScript não estreitar `ran.result` depois do `return` antecipado, use `(ran as { result?: unknown }).result`.

- [ ] **Step 7: Lint, tipos e testes**

Run: `bunx biome check --write --linter-enabled=false hooks tests && bun run lint && bun run typecheck && bun run test`
Expected: `bun run lint` sem diagnósticos; `50 pass`, `0 fail`. Se o Biome ainda acusar complexidade em algum ponto, extraia mais uma função de topo de arquivo com nome descritivo. Nunca suba o limite e nunca use `biome-ignore`.

- [ ] **Step 8: Commit**

```bash
git add hooks/summary.ts hooks/pane.tsx hooks/register.tsx tests/summary.test.ts tests/register.test.tsx
git commit -m "refactor: projectSections compartilhado, pane em partes e tool.call enxuto"
```

---

### Task 5: Nomes descritivos

**Goal:** Trocar abreviações de 1 a 3 letras por nomes descritivos em `hooks/` e `tests/`, preservando `$`, `e`, `next` e índices de laço `i`.

**Files:**
- Modify: `hooks/live.ts`, `hooks/link.ts`, `hooks/register.tsx`, `hooks/scan.ts`, `hooks/summary.ts`, `tests/link.test.ts`, `tests/scan.test.ts`, `tests/summary.test.ts`, `tests/register.test.tsx`

**Acceptance Criteria:**
- [ ] `grep -nE '\b(str|strs|ran|acc|dep|one|arg)\b' hooks/*.ts*` não retorna nada
- [ ] `grep -nE '^\s*const [a-zA-Z]{1} |^const P ' tests/*.ts*` não retorna nada
- [ ] `bun run lint && bun run typecheck && bun run test` saem com código 0 (50 pass)

**Verify:** `! grep -nE '\b(str|strs|ran|acc|dep|one|arg)\b' hooks/*.ts* && bun run lint && bun run typecheck && bun run test` → grep vazio, `50 pass`

**Steps:**

- [ ] **Step 1: Renomear em `hooks/`**

Use renomeação ciente de escopo (renomeie a declaração e todos os usos; não faça replace global cego, porque `one` e `arg` também aparecem dentro de outras palavras).

| Arquivo | Antes | Depois |
|---|---|---|
| `hooks/live.ts` | `str` | `asString` |
| `hooks/live.ts` | `strs` | `asStringArray` |
| `hooks/live.ts` | `one` (em `asStringArray`) | `item` |
| `hooks/live.ts` | `acc` (em `replay`) | `currentLive` |
| `hooks/live.ts` | `use` (em `replay`) | `toolUse` |
| `hooks/link.ts` | `one` (em `linkPlan`) | `spec` → como `spec` já existe no escopo externo, use `candidate` |
| `hooks/link.ts` | `one` (em `isBlocked`) | `other` |
| `hooks/link.ts` | `dep` | `dependency` |
| `hooks/register.tsx` | `ran` (todas as ocorrências) | `hookResult` |
| `hooks/register.tsx` | `arg` (em `command.run`) | `subcommand` |
| `hooks/register.tsx` | `one` (em `ui.render`) | `key` → como `key` é o parâmetro de `onToggle`, use `expandedKey` |
| `hooks/scan.ts` | `arg` (em `coalesce`) | `input` |
| `hooks/summary.ts` | `one` (em `taskLine`) | `other` |

O nome `raw` (em `parse.ts`, `live.ts` e `scan.ts`) **fica**: ele é descritivo ("objeto ainda não validado").

- [ ] **Step 2: Renomear em `tests/`**

| Arquivo | Antes | Depois |
|---|---|---|
| `tests/register.test.tsx` | `P` | `SUPERPOWERS_DIR` |
| `tests/scan.test.ts` | `P` | `SUPERPOWERS_DIR` |
| `tests/scan.test.ts` | `a`, `b`, `c` (em coalesce) | `firstRun`, `secondRun`, `thirdRun` |
| `tests/scan.test.ts` | `_` (parâmetro de `coalesce`) | `_input` |
| `tests/link.test.ts` | `d` | `derived` |
| `tests/link.test.ts` | `a`, `b` | `planA`, `planB` |
| `tests/link.test.ts` | `g` | `groups` |
| `tests/summary.test.ts` | `t` | `planTask` |

Outros nomes curtos que o grep do critério apontar seguem a mesma regra: um nome que diga o que o valor é.

- [ ] **Step 3: Lint, tipos e testes**

Run: `bun run lint && bun run typecheck && bun run test`
Expected: `50 pass`, `0 fail`.

- [ ] **Step 4: Commit**

```bash
git add hooks tests
git commit -m "refactor: nomes descritivos no lugar de abreviações"
```

---

### Task 6: Detector de comentários em português

**Goal:** Criar `scripts/comment-language.ts` (detecção pura, via TypeScript compiler API) e `scripts/check-comments.ts` (varredura e saída), com testes `bun:test` em `.spec.ts`, e ligar ambos aos scripts `typecheck`, `test` e `comments`.

**Files:**
- Create: `scripts/comment-language.ts`, `scripts/check-comments.ts`, `scripts/comment-language.spec.ts`, `scripts/tsconfig.json`
- Modify: `package.json`, `knip.json`, `bun.lock`

**Acceptance Criteria:**
- [ ] `bun test ./scripts` passa os 6 testes de `scripts/comment-language.spec.ts`
- [ ] `claude plugin test .` continua com `50 pass` (não coleta o `.spec.ts`)
- [ ] `bun run typecheck` cobre `tsconfig.json` e `scripts/tsconfig.json` e sai com código 0
- [ ] `bun run comments` sai com código 1 e lista os comentários em português que ainda existem em `hooks/`, `types/` e `tests/`, no formato `arquivo:linha: comentário`
- [ ] `bun run deadcode` e `bun run lint` saem com código 0

**Verify:** `bun test ./scripts && bun run typecheck && bun run deadcode && bun run lint; bun run comments; echo "exit=$?"` → 6 pass, sem erros, lista de comentários e `exit=1`

**Steps:**

- [ ] **Step 1: Instalar `@types/bun` e criar `scripts/tsconfig.json`**

Run: `bun add -d --exact @types/bun@1.4.4`

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": { "types": ["bun"] },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 2: Escrever os testes que falham**

`scripts/comment-language.spec.ts`:

```ts
import { expect, test } from 'bun:test'

import { findPortugueseComments, isPortuguese } from './comment-language'

const linesOf = (source: string, fileName: string) =>
  findPortugueseComments(source, fileName).map(finding => finding.line)

test('flags line and block comments written in Portuguese', () => {
  const source = [
    '// não bloqueia',
    'const value = 1 /* para o engine */',
    '/**',
    ' * Explains why',
    ' * sem atraso',
    ' */',
    '// English only',
  ].join('\n')
  expect(linesOf(source, 'sample.ts')).toEqual([1, 2, 3])
})

test('ignores Portuguese inside strings, templates, regex and JSX text', () => {
  const source = [
    "const label = 'Não há // nada'",
    'const header = `para ${label} // sem`',
    'const pattern = /não|sem/u',
    'const view = <Text>// não é comentário</Text>',
  ].join('\n')
  expect(findPortugueseComments(source, 'sample.tsx')).toEqual([])
})

test('flags JSX comments', () => {
  expect(linesOf('const view = <Box>{/* sem dados */}</Box>', 'sample.tsx')).toEqual([1])
})

test('matches whole words only', () => {
  expect(isPortuguese('// compare parameters, semantic queue, see example.com')).toBe(false)
  expect(isPortuguese('// Quando the engine restarts')).toBe(true)
})

test('flags uppercase accented letters', () => {
  expect(isPortuguese('// ÚLTIMO')).toBe(true)
})

test('parses generic arrow functions in .ts files', () => {
  expect(linesOf('const identity = <T>(value: T) => value // para', 'sample.ts')).toEqual([1])
})
```

Run: `bun test ./scripts`
Expected: FAIL, `Cannot find module './comment-language'`.

- [ ] **Step 3: Implementar `scripts/comment-language.ts`**

```ts
import ts from 'typescript'

export type CommentFinding = { line: number; text: string }

const ACCENTED = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/
const PORTUGUESE_WORD = /(?<![\p{L}\p{N}_./-])(não|quando|para|sem|com|uma|que|ainda|só)(?![\p{L}\p{N}_])/iu

export const isPortuguese = (comment: string): boolean => ACCENTED.test(comment) || PORTUGUESE_WORD.test(comment)

const scriptKindOf = (fileName: string) => (fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

// Comment ranges are read at token boundaries; the scanner would also read
// `//` inside JSX text as a comment, so ranges starting there are dropped.
const collectComments = (sourceFile: ts.SourceFile): ts.CommentRange[] => {
  const text = sourceFile.getFullText()
  const ranges = new Map<number, ts.CommentRange>()
  const jsxTextSpans: [number, number][] = []
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) jsxTextSpans.push([node.pos, node.end])
    const around = [
      ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
    ]
    for (const range of around) ranges.set(range.pos, range)
    for (const child of node.getChildren(sourceFile)) visit(child)
  }
  visit(sourceFile)
  const isInJsxText = (range: ts.CommentRange) =>
    jsxTextSpans.some(([start, end]) => range.pos >= start && range.pos < end)
  return [...ranges.values()].filter(range => !isInJsxText(range)).sort((left, right) => left.pos - right.pos)
}

export const findPortugueseComments = (source: string, fileName: string): CommentFinding[] => {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindOf(fileName))
  return collectComments(sourceFile)
    .map(range => ({
      line: sourceFile.getLineAndCharacterOfPosition(range.pos).line + 1,
      text: source.slice(range.pos, range.end),
    }))
    .filter(finding => isPortuguese(finding.text))
}
```

Run: `bun test ./scripts`
Expected: `6 pass`, `0 fail`. Se o teste de texto JSX falhar porque o range começa um caractere antes do `JsxText`, compare com `node.getStart(sourceFile)` em vez de `node.pos` e ajuste o intervalo, mantendo o teste.

- [ ] **Step 4: Implementar `scripts/check-comments.ts`**

```ts
import { Glob } from 'bun'

import { findPortugueseComments } from './comment-language'

const PATTERN = '{hooks,types,tests,scripts}/**/*.{ts,tsx}'

const findings: string[] = []
for await (const path of new Glob(PATTERN).scan('.')) {
  const source = await Bun.file(path).text()
  for (const finding of findPortugueseComments(source, path)) findings.push(`${path}:${finding.line}: ${finding.text}`)
}

if (findings.length > 0) {
  console.error(`Comments must be written in English (see CLAUDE.md):\n${findings.sort().join('\n')}`)
  process.exit(1)
}
```

- [ ] **Step 5: Ligar os scripts e o Knip**

Em `package.json`, os scripts ficam:

```json
  "scripts": {
    "typecheck": "tsc -p . && tsc -p scripts",
    "lint": "biome check .",
    "deadcode": "knip",
    "comments": "bun scripts/check-comments.ts",
    "test": "claude plugin validate . && claude plugin test . && bun test ./scripts",
    "check": "bun run typecheck && bun run lint && bun run deadcode && bun run comments && bun run test",
    "fix": "biome check --write ."
  },
```

Em `knip.json`, `entry` e `project` passam a incluir os scripts:

```json
  "entry": ["hooks/register.tsx", "tests/**/*.test.{ts,tsx}", "scripts/check-comments.ts", "scripts/**/*.spec.ts"],
  "project": ["hooks/**/*.{ts,tsx}", "types/**/*.ts", "tests/**/*.{ts,tsx}", "scripts/**/*.ts"],
```

- [ ] **Step 6: Rodar tudo**

Run: `bun test ./scripts && claude plugin test . 2>&1 | tail -2 && bun run typecheck && bun run deadcode && bun run lint`
Expected: `6 pass`; `50 pass` / `0 fail`; sem erros.

Run: `bun run comments; echo "exit=$?"`
Expected: lista com os comentários em PT de `hooks/atoms.ts`, `hooks/register.tsx`, `hooks/summary.ts`, `types/index.d.ts` e `tests/register.test.tsx`, e `exit=1`. Nenhuma linha de `scripts/` (as strings em português do `.spec.ts` não podem aparecer).

- [ ] **Step 7: Commit**

```bash
git add scripts package.json bun.lock knip.json
git commit -m "feat: detector de comentários em português (scripts/check-comments)"
```

---

### Task 7: Comentários e descrições de teste em inglês

**Goal:** Traduzir todos os comentários restantes e todas as descrições de `test('…')` para inglês, removendo comentários que só repetem o código, sem tocar nas asserções.

**Files:**
- Modify: `hooks/atoms.ts`, `hooks/register.tsx`, `hooks/summary.ts`, `types/index.d.ts`, `tests/*.test.ts(x)`

**Acceptance Criteria:**
- [ ] `bun run comments` sai com código 0
- [ ] `grep -nE "^test\('.*[áàâãéêíóôõúç]|^test\('[^']*\b(não|sem|com|para|quando)\b" tests/*.ts*` não retorna nada
- [ ] `git diff HEAD -- tests | grep -E '^[-+]\s+expect' | wc -l` imprime `0` (nenhuma asserção alterada)
- [ ] `bun run typecheck && bun run lint && bun run test` saem com código 0 (50 pass + 6 pass)

**Verify:** `bun run comments && bun run typecheck && bun run lint && bun run test && git diff HEAD -- tests | grep -cE '^[-+]\s+expect'` → sem saída de comments, testes passam, `0`

**Steps:**

- [ ] **Step 1: Traduzir os comentários de `hooks/` e `types/`**

| Arquivo | Comentário atual | Novo comentário |
|---|---|---|
| `hooks/atoms.ts` | Os atoms em si (`atom(...)`) ficam em register.tsx: o engine só aceita `read`/`update` com uma referência declarada no próprio arquivo da chamada. | `// The atoms themselves (\`atom(...)\`) live in register.tsx: the engine only accepts` / `// \`read\`/\`update\` with a reference declared in the calling file.` |
| `hooks/register.tsx` | Trocar o shape quando o formato mudar: declina o que uma versão anterior guardou. | `// Bump the shape when the format changes: it discards what a previous version stored.` |
| `hooks/register.tsx` | O engine só aceita `$` passado a funções declaradas no topo do arquivo e `update` com o atom escrito no ponto da chamada: o trabalho serializado por `coalesce` só varre e guarda o resultado mais recente; quem pediu grava. | `// The engine only accepts \`$\` passed to top-level functions and \`update\` with the` / `// atom written at the call site: the work serialized by \`coalesce\` only scans and` / `// keeps the latest result; the caller writes it.` |
| `hooks/register.tsx` | Sessão sem as ferramentas nativas de tarefa: nada a sincronizar, sem aviso. | `// Session without the native task tools: nothing to sync, no warning.` |
| `hooks/register.tsx` | O engine troca a lista dinâmica pelo `watchPaths` que o hook devolve: só juntamos os nossos quando alguém (o engine ou outro hook) já devolve uma. | `// The engine replaces the dynamic list with the \`watchPaths\` the hook returns: we only` / `// merge ours when someone (the engine or another hook) already returns one.` |
| `hooks/register.tsx` | Outra sessão mexendo em docs/superpowers (ex.: .tasks.json chegando a 7/7) só aparece se o engine observar essas pastas e avisar via FileChanged. | `// Another session touching docs/superpowers (e.g. a .tasks.json reaching 7/7) only` / `// shows up if the engine watches those folders and reports it through FileChanged.` |
| `hooks/register.tsx` | `// falha aberta: nunca bloqueia o início` | `// fail open: never blocks session start` |
| `hooks/register.tsx` | `// falha aberta: nunca bloqueia o prompt` | `// fail open: never blocks the prompt` |
| `hooks/summary.ts` | Cabeçalho, spec e todas as tarefas (concluídas inclusive) de um plano. | `// Header, spec and every task (completed ones included) of a plan.` |
| `types/index.d.ts` | Caminho do plano aberto no DETALHE; '' quando nenhum. | `// Path of the plan open in DETALHE; '' when none.` |
| `tests/register.test.tsx` | O tsconfig não carrega libs de runtime (types: []); o runtime de teste tem setTimeout. | `// The tsconfig loads no runtime libs (types: []); the test runtime does have setTimeout.` |

(Na tabela, `/` separa as linhas do comentário no arquivo.) Para qualquer outro comentário que `bun run comments` ainda listar, traduza com o mesmo critério: mantenha o *porquê* e apague o comentário se ele só descrever o que a linha faz.

- [ ] **Step 2: Traduzir as descrições de teste**

Em cada `test('…', …)` de `tests/*.test.ts(x)`, traduza só o primeiro argumento, literalmente e no mesmo nível de detalhe. Os termos de domínio que são texto de UI ficam como estão (`DETALHE`, `PROJETO`, `sem tasks.json`). Exemplos:

| Antes | Depois |
|---|---|
| `'parseName extrai data e slug, removendo -design'` | `'parseName extracts date and slug, dropping -design'` |
| `'displaySubject remove o prefixo Task N:'` | `'displaySubject strips the Task N: prefix'` |
| `'taskLine por status'` | `'taskLine by status'` |
| `'summarize sem dados'` | `'summarize with no data'` |
| `'summarize: itens do PROJETO com barra; rótulo quando sem tasks.json'` | `'summarize: PROJETO items with a bar; label when there is no tasks.json'` |
| `'abre o pane e mostra os alertas do projeto'` | `'opens the pane and shows the project alerts'` |
| `'clicar num plano abre o DETALHE; ✕ fechar o tira'` | `'clicking a plan opens DETALHE; ✕ fechar removes it'` |
| `'TaskList negado no backfill marca sincronização parcial'` | `'TaskList denied during backfill flags a partial sync'` |

São 48 descrições ao todo (6 em `link`, 12 em `live`, 5 em `parse`, 10 em `register`, 8 em `scan` e 7 em `summary`, sem contar as duas novas, que já estão em inglês).

- [ ] **Step 3: Conferir**

Run: `bun run comments && bun run typecheck && bun run lint && bun run test`
Expected: comments sem saída; `50 pass`; `6 pass`.

Run: `git diff -- tests | grep -cE '^[-+]\s+expect'`
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add hooks types tests
git commit -m "docs: comentários e descrições de teste em inglês"
```

---

### Task 8: Convenções escritas e pre-commit

**Goal:** Escrever as convenções em `CLAUDE.md`, ativar o pre-commit versionado via `bun install` e mostrar que o repositório limpo passa e um commit com violação é bloqueado.

**Files:**
- Create: `CLAUDE.md`, `.githooks/pre-commit`
- Modify: `package.json` (script `prepare`)

**Acceptance Criteria:**
- [ ] `bun install` define `git config core.hooksPath` = `.githooks`
- [ ] `bun run check` sai com código 0 no repositório limpo
- [ ] Um commit de prova com `// não deveria passar` em `hooks/atoms.ts` é rejeitado pelo hook (saída do `check-comments` visível, commit não criado)
- [ ] Um commit de prova com uma função de complexidade > 10 em `hooks/atoms.ts` é rejeitado (diagnóstico `noExcessiveCognitiveComplexity` visível)
- [ ] Depois das provas, `git status` fica limpo e `git log -1` mostra o commit desta task

**Verify:** `bun install && git config core.hooksPath && bun run check` → `.githooks`, check verde

**Steps:**

- [ ] **Step 1: Criar `CLAUDE.md`**

```markdown
# superpowers-panel

Mod de function hooks para Claude Code. Veja o README para uso.

## Code conventions

- Identifiers, comments and test descriptions are written in **English**. User-facing text
  (pane, `/sp` replies) stays in **PT-BR** with correct accents.
- Use descriptive names. No 1–3 letter abbreviations, except `$`, `e` and `next` (the engine's
  hook API convention) and loop indexes. `raw` is fine for a not-yet-validated object.
- A comment explains *why* (an engine constraint, a non-obvious decision), never *what* the line does.
- No dead code and no commented-out code.
- Cognitive complexity ≤ 10 per function; a function with more than 4 parameters takes an object.
- Never raise the limits or add `biome-ignore` to get past a check: refactor instead.
- Engine constraints to preserve: atoms are declared in the file that calls `read`/`update` on them;
  `$` is only passed to top-level functions; `update` has the atom written at the call site.
- Mod tests use `claude-code/testing` and are named `*.test.ts(x)`; tooling tests under `scripts/`
  use `bun:test` and must be named `*.spec.ts` (`claude plugin test` collects every `*.test.ts`).

## Checks

    bun install      # installs the tools and enables the pre-commit hook
    bun run check    # typecheck + lint + dead code + comment language + tests
    bun run fix      # applies Biome formatting and safe fixes

The pre-commit hook runs `bun run check`; a failing check blocks the commit.
```

- [ ] **Step 2: Criar `.githooks/pre-commit`**

```sh
#!/bin/sh
# Blocks the commit when any quality check fails; enabled by `bun install` (prepare script).
exec bun run check
```

Run: `chmod +x .githooks/pre-commit`

- [ ] **Step 3: Script `prepare`**

Em `package.json`, acrescente aos scripts:

```json
    "prepare": "git config core.hooksPath .githooks",
```

Run: `bun install && git config core.hooksPath`
Expected: `.githooks`. Se o Bun não executar o `prepare` do pacote raiz, rode `bun run prepare` uma vez e anote na seção Checks do `CLAUDE.md` que, nesse caso, `bun run prepare` também é necessário.

- [ ] **Step 4: Check completo**

Run: `bun run check`
Expected: código 0. Se o `check-comments` acusar `.githooks/pre-commit`, isso não deve acontecer, porque ele só varre `.ts`/`.tsx`.

- [ ] **Step 5: Commit desta task (passa pelo próprio hook)**

```bash
git add CLAUDE.md .githooks/pre-commit package.json bun.lock
git commit -m "chore: convenções de código e pre-commit com bun run check"
```

Expected: o hook roda o `check` (saída visível) e o commit é criado.

- [ ] **Step 6: Provas de bloqueio (descartadas em seguida)**

```bash
echo "// não deveria passar" >> hooks/atoms.ts
git commit -am "prova: comentário em português"; echo "exit=$?"
git checkout -- hooks/atoms.ts
```

Expected: saída do `check-comments` apontando `hooks/atoms.ts`, `exit=1` e nenhum commit novo (`git log -1` continua no commit do Step 5).

```bash
cat >> hooks/atoms.ts <<'EOF'
export const tangled = (a: number, b: number, c: number) => {
  if (a > 0) { if (b > 0) { if (c > 0) { for (let i = 0; i < a; i++) { if (i % 2 && b) { if (c) return i } } } } }
  return a && b ? (c ? 1 : 2) : 3
}
EOF
git commit -am "prova: complexidade"; echo "exit=$?"
git checkout -- hooks/atoms.ts
```

Expected: diagnóstico `noExcessiveCognitiveComplexity` em `hooks/atoms.ts`, `exit=1` e nenhum commit novo.

Run: `git status --short && git log --oneline -1`
Expected: árvore limpa; último commit = `chore: convenções de código e pre-commit com bun run check`.

- [ ] **Step 7: Conferência manual do painel (com o usuário)**

Peça ao usuário que abra `claude --plugin-dir /Volumes/DevSSD/dev/superpowers-mod` num projeto com `docs/superpowers/` e confirme:
- o painel abre com a mesma aparência de antes (fase, PLANO ATUAL, PROJETO, recolher/expandir concluídos, clicar num plano abre o DETALHE);
- `/sp status` imprime o mesmo texto.

Registre a resposta do usuário no relatório da task.
