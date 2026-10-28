# Superpowers Panel — Design

**Data:** 2026-10-28
**Status:** aprovado em brainstorming, aguardando revisão da spec escrita

## Objetivo

Mod para Claude Code que exibe, num painel lateral fixo ao lado do chat, o estado do fluxo do fork
[`superpowers-extended-cc`](https://github.com/pcvelz/superpowers): o que está sendo executado agora
na sessão (foco principal) e o estado do projeto (specs e planos).

**Sucesso:** ao abrir o painel no meio de uma execução, o usuário sabe em poucos segundos em que fase
está, qual tarefa do plano está em andamento, o que falta, e quais specs/planos estão pendurados no
projeto.

## Escopo

### Dentro (v1)
- Painel (pane) com três blocos: cabeçalho (fase + plano ativo), plano atual / fora do plano (sessão),
  projeto (alertas).
- Alertas de projeto: **spec sem plano**, **plano incompleto**, **plano sem spec**, mais o total de
  planos concluídos (recolhido).
- Backfill automático de tarefas criadas antes do mod carregar.
- Slash command `/sp` (abrir/fechar), `/sp status` (resumo em texto), `/sp sync` (ressincronizar).
- Abertura automática do painel quando o projeto tem `docs/superpowers/`.

### Fora (v1)
- Ações no painel (retomar plano, escrever plano para spec etc.).
- Verificação de evidência de `acceptanceCriteria` / user-gates.
- Escrita em qualquer arquivo do projeto — o mod é somente leitura.

## Convenções do fork usadas

- Specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Planos: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`, com cabeçalho contendo
  `**Spec:** <caminho>`.
- Tarefas persistidas: `docs/superpowers/plans/<plano>.md.tasks.json`:
  `{ planPath, tasks: [{ id, subject, status, blockedBy?, description }], lastUpdated }`.
  A `description` termina com um bloco ```` ```json:metadata ```` (`files`, `acceptanceCriteria`,
  `verifyCommand`, `userGate`, `tags`, `modelTier`…).
- `executing-plans` e `subagent-driven-development` sincronizam o `.tasks.json` após cada mudança de
  status, e criam tarefas nativas (`TaskCreate`) com o mesmo `subject` do `.tasks.json`.
- Skills do fork são chamadas como `superpowers-extended-cc:<skill>`.

## Layout do painel

```
┌ Superpowers ─────────────────────────────┐
│ Fase: ▶ executing-plans                   │
│ Plano: 2026-10-28-auth.md   ███████░░ 7/9 │
│                                           │
│ PLANO ATUAL                               │
│ ▶ T8 Add token refresh      em andamento  │
│ ○ T9 Gate: E2E login    🔒 user-gate      │
│ ✓ T1–T7 concluídas (7)        [expandir]  │
│                                           │
│ FORA DO PLANO (sessão)                    │
│ ○ Revisar spec de billing                 │
│                                           │
│ PROJETO                                   │
│ ⚠ 2 specs sem plano                       │
│   · 2026-10-20-billing-design.md          │
│ ◐ 1 plano incompleto                      │
│   · 2026-10-28-auth.md       7/9          │
│ ⚠ 1 plano sem spec                        │
│   · 2026-09-02-hotfix.md                  │
│ ✓ 4 planos concluídos         [expandir]  │
└───────────────────────────────────────────┘
```

Regras:
- Numeração `T<n>` vem do `id` do `.tasks.json` (`T{id}`); IDs nativos da sessão nunca são exibidos.
- Ordem no plano atual: em andamento → pendentes → bloqueadas (`bloqueada por T<n>`) → concluídas
  (recolhidas por padrão).
- `🔒 user-gate` quando `userGate: true` ou `tags` contém `user-gate`.
- Sem plano ativo, o bloco PLANO ATUAL some. Sem tarefas fora do plano, FORA DO PLANO some.
- Sem fase detectada, o cabeçalho mostra `Fase: —`.

## Fontes de dados

| Fonte | Fornece | Lida em |
|---|---|---|
| `docs/superpowers/specs/*.md` | specs (data, slug) | varredura |
| `docs/superpowers/plans/*.md` | planos, linha `**Spec:**` | varredura |
| `docs/superpowers/plans/*.md.tasks.json` | tarefas do plano | varredura |
| hook `tool.call` `TaskCreate`/`TaskUpdate` | status ao vivo | cada chamada |
| hook `tool.call` `Skill` (`superpowers-extended-cc:*`) | fase, plano ativo | cada chamada |
| `$.session.messages()` + `$.tool.call({ tool: 'TaskList' })` | backfill | `session.start`, `/sp sync` |

## Modelo de estado (`$.state`)

- `project`: `{ specs: Spec[], plans: Plan[], scannedAt: number, hasSuperpowersDir: boolean }`
  - `Spec`: `{ path, slug, date }`
  - `Plan`: `{ path, slug, date, specRef?: string, tasksFile: 'ok' | 'missing' | 'invalid',
    tasks: PlanTask[] }`
  - `PlanTask`: `{ id: number, subject, status: 'pending' | 'in_progress' | 'completed',
    blockedBy: number[], userGate: boolean }`
- `live`: `{ phase?: string, activePlan?: string, sessionTasks: Record<string, SessionTask>,
  syncNote?: string }`
  - `SessionTask`: `{ id, subject, status, blockedBy: string[] }`

Alertas são derivados no desenho (nunca persistidos):
- **Spec sem plano:** nenhum plano liga a ela.
- **Plano sem spec:** não há `**Spec:**` nem match por slug; ou `**Spec:**` aponta para arquivo
  inexistente (rótulo "spec ausente").
- **Plano incompleto:** `tasksFile !== 'ok'` (rótulos "sem tasks.json" / "tasks.json inválido") ou
  alguma tarefa com status ≠ `completed` (inclui 0/N).
- **Plano concluído:** `tasksFile === 'ok'`, ≥1 tarefa e todas `completed`.

### Ligação spec ↔ plano
1. `**Spec:** <caminho>` no plano, resolvido a partir da raiz do repositório (aceita caminho com ou
   sem crases).
2. Fallback por slug: plano `YYYY-MM-DD-<slug>.md` casa com spec `*-<slug>-design.md` ou
   `*-<slug>.md`.

### Detecção do plano ativo (primeira regra que casar)
1. Argumento da skill `executing-plans` / `subagent-driven-development` contendo um caminho de plano.
2. `Read`/`Write`/`Edit` de um `.tasks.json` na sessão.
3. Plano cujo conjunto de `subject`s tem a maior interseção (≥1) com as tarefas nativas da sessão.

### Precedência de status
Para uma tarefa do plano ativo com tarefa nativa correspondente (mesmo `subject`), vale o status
nativo; senão, o do `.tasks.json`. Tarefas nativas sem correspondência vão para FORA DO PLANO.

## Fluxo de eventos

- `session.start`: registra `/sp`; varre o projeto; backfill (replay de `TaskCreate`/`TaskUpdate`/
  `Skill` do transcript, depois `TaskList` como verdade final de status/subject/blockedBy); abre o
  painel se `hasSuperpowersDir`.
- `tool.call` `TaskCreate` / `TaskUpdate`: após `next(e)`, se sucesso, atualiza `live.sessionTasks`.
- `tool.call` `Skill`: se `superpowers-extended-cc:*`, atualiza `phase` (nome sem prefixo) e, se
  aplicável, `activePlan`.
- `prompt.submit` com texto iniciando em `/superpowers-extended-cc:<skill>` (skill digitada pelo
  usuário, que não passa pela ferramenta `Skill`): mesmo efeito que o item anterior. O replay do
  backfill também reconhece essas mensagens do usuário.
- `tool.call` `Write`/`Edit` com caminho sob `docs/superpowers/`: revarredura imediata.
- `turn.complete`: revarredura (cobre mudanças via Bash/git).
- `command.run` `/sp`: sem argumento alterna o painel; `status` imprime o resumo; `sync` refaz
  varredura + backfill.

Varreduras são serializadas: uma pedida durante outra é coalescida numa única execução seguinte.

## Componentes

| Arquivo | Responsabilidade |
|---|---|
| `hooks/register.tsx` | liga eventos; só orquestração |
| `hooks/scan.ts` | lê `docs/superpowers/` via `$.fs`, produz `project` |
| `hooks/parse.ts` | puro: `.tasks.json`, `json:metadata`, `**Spec:**`, slug/data |
| `hooks/link.ts` | puro: ligação, alertas, plano ativo, precedência |
| `hooks/live.ts` | puro: aplica eventos em `live`; replay do transcript |
| `hooks/pane.tsx` | desenha o painel |
| `hooks/summary.ts` | texto de `/sp status` |
| `types/index.d.ts` | contrato do `$.state` |

## Tratamento de erros

- Sem `docs/superpowers/`: não abre sozinho; `/sp` mostra "nenhum dado superpowers neste projeto".
- `.tasks.json` ilegível, inválido ou > 4 MiB: `tasksFile: 'invalid'`; demais planos seguem.
- `json:metadata` malformado: ignora só os metadados.
- `TaskList` falha/negado no backfill: mantém o replay, `live.syncNote = "sincronização parcial"`.
- Hooks de ferramenta nunca bloqueiam nem alteram a chamada; exceções do mod vão para
  `$.ui.log(..., { to: 'debug' })`.

## Testes

- Unitários nas partes puras (`parse`, `link`, `live`): `.tasks.json` no formato do fork, metadata
  válido/malformado, ligação por `**Spec:**` e por slug, os quatro estados de plano, precedência,
  replay com tarefas pré-existentes, plano ativo pelas três regras.
- Teste de mod (`claude plugin test`): fixture com 2 specs, 3 planos; painel exibe as seções
  esperadas; um `TaskUpdate` simulado muda a linha da tarefa.
- `claude plugin validate` e `tsc -p` limpos; verificação manual carregando o mod nesta sessão.
