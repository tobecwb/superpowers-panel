# UI Polish + i18n — Design

**Data:** 2026-10-28
**Status:** aprovado em brainstorming, aguardando revisão da spec escrita

## Objetivo

Melhorar bastante a apresentação do painel superpowers (cor, separação, hierarquia e animação que
comunica estado) e passar **todo o texto exibido ao usuário** por um catálogo i18n com **pt-BR**
(o texto atual, revisado) e **en**.

O principal incômodo hoje é o visual: cru, monótono e sem "vida". Hierarquia e clareza dos textos
são ganhos secundários, mas fazem parte do escopo.

**Sucesso:**
- Ao bater o olho, a pessoa sabe em segundos a fase atual, o que está rodando e o que precisa dela.
- Tarefa em andamento e fase ativa animam (spinner); progresso e conclusões têm transição visível.
- Sem nada rodando e sem transição pendente, o painel não redesenha.
- O idioma é escolhido automaticamente e pode ser forçado com `/sp lang`.
- Nenhuma string visível fica fora do catálogo; faltar chave no `en` quebra o `typecheck`.
- `bun run check` passa inteiro.

## Escopo

### Dentro
- Painel inteiro desenhado por um módulo de superfície `Client` (`hooks/panel.tsx`) com animação.
- View model serializável (`hooks/view-model.ts`) compartilhado pelo painel e pelo `/sp status`.
- Catálogo i18n tipado próprio (`hooks/i18n/`), detecção de locale e o comando `/sp lang`.
- Textos revisados em pt-BR e traduzidos para en.
- Atualização de README e CLAUDE.md (a regra de idioma do texto ao usuário).

### Fora
- Mudar o que é detectado/derivado (`scan`, `parse`, `link`, `live` mantêm a lógica).
- Idiomas além de pt-BR e en.
- Dependências de runtime (bibliotecas de i18n ou de UI).
- Superfície desktop: o alvo é o terminal.

## Arquitetura

```
register.tsx (hooks, átomos, $)
  ├─ ui.render Pane ──► viewModel(derived, live, ui, messages) ──► <Client module="./panel.tsx" props={model}/>
  ├─ ui.message ◄── post({ action: 'toggle' | 'select', key }) ── panel.tsx
  └─ /sp status ──► viewModel(...) ──► textView(model)
```

A regra da engine continua: átomos, `read`/`update` e `$` ficam em `register.tsx`; `update` com o
átomo escrito no ponto da chamada. O `Client` não tem `$`; fala com os hooks só por `post`.

### Unidades

| Arquivo | Responsabilidade |
|---|---|
| `hooks/i18n/pt-BR.ts` | Catálogo de referência; dele deriva o tipo `Messages`. |
| `hooks/i18n/en.ts` | `const en: Messages`; chave faltante ou com tipo errado quebra o `typecheck`. |
| `hooks/i18n/index.ts` | `type Locale = 'pt-BR' \| 'en'`, `messagesFor(locale)`, `detectLocale(...)`. |
| `hooks/view-model.ts` | `(Derived, Live, UiState, Messages) → PanelModel`. Puro. Absorve `summary.ts`. |
| `hooks/text-view.ts` | `PanelModel → string` para o `/sp status` e o fallback estático. |
| `hooks/panel.tsx` | Módulo `Client`: desenha `PanelModel` em cartões e cuida da animação. |
| `hooks/register.tsx` | Átomo `locale`, hook `ui.message`, `/sp lang`, mensagens do `/sp` via catálogo. |

Saem: `hooks/pane.tsx` e `hooks/summary.ts` (o conteúdo útil migra para `view-model.ts`). `bar` e
`displaySubject` migram junto se ainda forem usados.

### PanelModel

JSON simples (props de `Client` têm limite de 100 000 caracteres), com textos **já traduzidos**:

- `header`: `{ phase?: { label, tone }, plan?: { name, done, total }, emptyHint? , syncWarning? }`
- `now: Row[]`: tarefas em andamento e user-gates pendentes.
- `next: Row[]`: pendentes e bloqueadas.
- `done: { label, expanded, rows: Row[] }` (rows vazio se recolhido; ausente se não há concluídas).
- `outside: Row[]`: tarefas da sessão fora do plano.
- `project: { title, sections: Section[] }`, com `Section = { id, header, tone, collapsible, expanded, items: Item[] }`
  e `Item = { key, label, selectable }`.
- `detail?: { title, specLine, rows: Row[], closeLabel }`.
- `labels`: rótulos fixos do painel (títulos das seções, "fechar", etc.).

`Row = { key, kind: 'running' | 'gate' | 'pending' | 'blocked' | 'done', id, text, note? }`.
`key` é estável (`task:<id>`, `session:<id>`, `spec:<path>`, `plan:<path>`, `nospec:<path>`) para a
animação reconhecer a mesma linha entre renders.

`tone` usa chaves do tema: `planMode`, `claude`, `permission`, `suggestion`, `error`, `warning`,
`success`, `subtle`.

## Visual

**Cartão de cabeçalho** (`borderStyle="round"`, `borderColor` igual ao tom da fase):
1. Selo da fase com `backgroundColor`, nome curto traduzido e mapeado a partir da skill:
   brainstorming → `planMode`; writing-plans → `planMode`; executing-plans e
   subagent-driven-development → `claude`; checking-gates/specifying-gates → `permission`;
   requesting/receiving-code-review → `suggestion`; systematic-debugging → `error`.
   Skill desconhecida mostra o nome cru com tom `subtle`.
2. Nome do plano ativo em negrito.
3. Barra `━` (feito em `success`, resto em `subtle`) + `5/9 · 56%`, largura adaptada a
   `surface.columns`.
- Sem fase nem plano: "Nenhum fluxo ativo" + dica de como começar.
- Aviso de sincronização logo abaixo do cartão, em `warning`.

**Seções:**
- **Agora**: `running` com spinner em `claude`; `gate` com `◆` em `permission` e nota "aguarda você".
- **Próximas**: `○` pendente; `⊘` bloqueada em `subtle` com nota "aguarda T8".
- **▸ ✓ N concluídas**: botão recolhível, em `success` atenuado.
- **Fora do plano**: tarefas da sessão com os mesmos ícones.
- **Projeto**: títulos com tom (`⚠` warning, `◐` suggestion, `✓` success), itens clicáveis.
- **Detalhe**: cartão próprio com borda `subtle` e botão "✕ fechar".
- Textos longos usam `wrap="truncate-end"`.

**Textos revisados (pt-BR):** "PLANO ATUAL" vira o cartão; "FORA DO PLANO (sessão)" → "Fora do
plano"; "sincronização parcial" → "⚠ Algumas tarefas não puderam ser lidas — /sp sync";
"(spec ausente)" → "spec não encontrada"; "user-gate" → "aguarda você". O en segue o mesmo tom.

## Animação

Um único `surface.every(80, tick)` iniciado na primeira chamada (estado ainda `undefined`). O
`tick` só chama `setState` quando algo anima, então não há redesenho ocioso.

Estado local do `Client`: `frame`, `shownProgress`, `flashes: Record<key, expiresAt>`,
`borderPulseUntil`, `previous` (último `PanelModel` visto, para detectar mudanças).

1. **Spinner** braille `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` em linhas `running` e no selo da fase, enquanto houver algum.
2. **Barra suave:** `shownProgress` se aproxima de `done/total` em cerca de 400 ms (ease-out).
3. **Flash de conclusão:** uma linha que passou a `done` fica em destaque (`success` + negrito, `✓`
   alternando) por cerca de 1,5 s antes de sumir para "concluídas".
4. **Plano novo:** quando o plano ativo muda, a borda do cabeçalho pisca uma vez (cerca de 600 ms).

A lógica de transição (próximo estado a partir de estado + modelo + tempo) é uma função pura
exportada à parte, testável sem a superfície.

## i18n

- `Messages` mistura strings e funções: `tasksDone: count => count === 1 ? '1 concluída' : \`${count} concluídas\``,
  `waitingFor: ids => …`, `phases: { brainstorming: 'Brainstorming', … }`.
- **Detecção** (`detectLocale(forced, languageSetting, langEnv)`): `forced` (`'pt-BR' | 'en'`)
  vence; senão normaliza `languageSetting` (sem acento, minúsculas): contém `portug`, ou começa com
  `pt`, ou tem `pt` como palavra, resulta em pt-BR; qualquer outro texto não vazio resulta em en;
  vazio passa para `langEnv` (`pt*` resulta em pt-BR, outro valor em en); nada resulta em **en**.
- Fontes: átomo `locale` (`'auto' | 'pt-BR' | 'en'`, persistido), `$.settings.read({ key: 'language' })`,
  `$.env.get('LANG')`. O locale efetivo é resolvido no `session.start` e no `/sp lang` e guardado no
  átomo `resolvedLocale`; o render só lê o átomo.
- **Cobertura:** painel, `/sp status`, respostas do `/sp`, `description` do comando, título do pane,
  aviso de sincronização. Ficam como estão: nomes de arquivo, slugs, assuntos das tarefas, nomes
  crus de skill desconhecida.
- `/sp lang` sem argumento mostra o idioma atual e as opções; `/sp lang pt-BR|en|auto` grava e
  responde já no idioma novo. O uso do `/sp` passa a listar `lang`.

## Fluxo de dados

- `ui.render` (Pane `superpowers`): lê os átomos, monta `PanelModel` e devolve
  `<Client key="panel" module="./panel.tsx" props={model} />`.
- Clique no `Client`: `post({ action: 'toggle', key })` ou `post({ action: 'select', key: path })`.
- `ui.message`: valida o `raw` (ação conhecida, `key` string) e faz `update` em `expandedAtom` ou
  `selectedAtom`; a engine redesenha e o `Client` recebe as novas props.
- `/sp lang`: atualiza `locale` e `resolvedLocale`; a description do comando é registrada de novo
  no idioma resolvido.

## Erros

- `ui.message` com dado inválido: ignorado e registrado no log de debug.
- Hooks continuam em *fail open*.
- Falha ao ler `settings`/`env` na detecção: usa `en` e registra no debug.
- Se o `Client` não puder ser desenhado, o `ui.render` devolve um fallback estático com o texto de
  `textView`, para o painel nunca ficar em branco.

## Testes

Mod usa `claude-code/testing`, arquivos `*.test.ts(x)`.

- `tests/i18n.test.ts`: `detectLocale` (forced, settings em vários formatos, `LANG`, vazio → en);
  os dois catálogos, chamados com entradas de exemplo, não produzem string vazia nem `undefined`.
- `tests/view-model.test.ts` (substitui `summary.test.ts`): classificação em now/next/done, ordem,
  tons por fase, chaves estáveis, seções do projeto, detalhe, e as saídas nos dois idiomas.
- `tests/text-view.test.ts`: texto do `/sp status` em pt-BR e en.
- `tests/panel.test.tsx`: renderiza o `Client` com um modelo e verifica cartão e seções; a função
  de transição cobre o avanço do spinner, o easing da barra, o flash que expira, o pulso de plano
  novo e a ausência de `setState` quando ocioso.
- `tests/register.test.tsx`: `ui.message` (toggle, select, inválido), `/sp lang`, respostas
  traduzidas, render devolvendo `Client`.
- `bun run check` passa: typecheck, Biome (complexidade ≤ 10), knip, detector de comentários,
  testes.

## Documentação

- README: seções de uso com `/sp lang` e a detecção de idioma.
- CLAUDE.md: "User-facing text … stays in PT-BR" passa a "User-facing text goes through the i18n
  catalog (`hooks/i18n/`), in PT-BR and English, with correct accents".
