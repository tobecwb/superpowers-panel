# Code Quality — Design

**Data:** 2026-10-28
**Status:** aprovado em brainstorming, aguardando revisão da spec escrita

## Objetivo

Dar ao projeto `superpowers-panel` uma base de qualidade de código: boas práticas, nomes descritivos,
ausência de código morto, complexidade controlada e comentários úteis — com **identificadores,
comentários e descrições de teste em inglês**.

São duas entregas:

1. **Limpeza** do código atual (`hooks/`, `types/`, `tests/`), sem mudança de comportamento.
2. **Guarda** automática que impede regressão: um comando `bun run check` disparado por um git
   pre-commit hook.

**Sucesso:**
- `bun run check` passa no repositório limpo e falha diante de qualquer violação: erro de tipo, lint,
  complexidade cognitiva > 10, código morto, comentário em português ou teste quebrado.
- Um `git commit` com violação é bloqueado pelo pre-commit.
- Os textos exibidos ao usuário (pane, `/sp status`, mensagens de `/sp`) ficam idênticos, byte a byte.

## Escopo

### Dentro
- `package.json` só com devDependencies (Biome, Knip, TypeScript) e scripts `check`/`fix`/`prepare`.
- Configuração do Biome (lint + formatter) e do Knip (código morto entre arquivos).
- Script de heurística para detectar comentários em português.
- Pre-commit versionado em `.githooks/`.
- Convenções escritas em `CLAUDE.md` (raiz), com link no README.
- Refatoração: código morto, duplicação, complexidade, nomes, tradução de comentários e de
  descrições de teste.
- Testes novos apenas para a função pura extraída (`projectSections`).

### Fora
- Mudar comportamento do painel ou de `/sp`.
- Traduzir a interface (continua em PT-BR).
- CI (GitHub Actions).
- Ampliar cobertura de testes além do item acima.

## Restrições

- O mod é carregado pelo engine do Claude Code, que não usa `node_modules`: as ferramentas são só de
  desenvolvimento e nada em `hooks/` pode importar delas.
- Restrições do engine que a refatoração deve preservar (e que justificam os comentários existentes):
  atoms declarados no próprio arquivo da chamada de `read`/`update`; `$` passado apenas a funções de
  topo de arquivo; `update` com o atom escrito no ponto da chamada.
- Os módulos `claude-code` e `claude-code/testing` são fornecidos pelo engine (tipos em
  `.claude-plugin/types/`, fora do git) — devem ser tratados como externos pelo Knip.
- Os testes rodam com `claude plugin test .` (importam `claude-code/testing`), não com `bun test`.

## Design

### 1. Ferramentas e configuração

**`package.json`** (`"private": true`, `"type": "module"`), devDependencies com versão exata:
`@biomejs/biome`, `knip`, `typescript` (substitui o `npx -p typescript@5.6.3` atual). Scripts:

| Script     | Comando                                                                                         |
|------------|-------------------------------------------------------------------------------------------------|
| `check`    | `tsc -p . && biome check . && knip && bun scripts/check-comments.ts && claude plugin validate . && claude plugin test .` |
| `fix`      | `biome check --write .`                                                                         |
| `prepare`  | `git config core.hooksPath .githooks`                                                           |

**`biome.json`:**
- Formatter no estilo atual: aspas simples, sem ponto e vírgula (`semicolons: asNeeded`), indentação
  de 2 espaços, `lineWidth: 120`.
- Linter: `recommended`, mais:
  - `complexity/noExcessiveCognitiveComplexity` = erro, `maxAllowedComplexity: 10`;
  - `correctness/noUnusedVariables`, `correctness/noUnusedImports` = erro;
  - `style/noNestedTernary` = erro;
  - `style/useNamingConvention` = erro (camelCase / PascalCase / CONSTANT_CASE; exceções
    configuradas para chaves que vêm de APIs externas, ex. `file_path`, `new_cwd`, `tool_use_id`);
  - `style/useBlockStatements` desligado (mantém `if (x) return y`).
- Ignora `docs/`, `.claude-plugin/types/`, `node_modules/`.

**`knip.json`:** entradas `hooks/register.tsx`, `tests/**/*.test.{ts,tsx}`, `scripts/*.ts`;
`project` = `hooks/**`, `types/**`, `scripts/**`; `claude-code` e `claude-code/testing` em
`ignoreDependencies`. O `types/index.d.ts` é declarado em `plugin.json` e deve ser tratado como
entrada.

**`.gitignore`:** acrescenta `node_modules/`. O lockfile (`bun.lock`) é versionado.

### 2. Convenções (`CLAUDE.md`)

Seção "Code conventions" na raiz:
- Identificadores, comentários e descrições de teste em **inglês**; textos de interface em **PT-BR**.
- Nomes descritivos; sem abreviações de 1–3 letras, exceto `$`, `e`, `next` (convenção da API de hooks
  do engine) e índices de laço.
- Comentário explica o *porquê* (restrição do engine, decisão não óbvia), nunca o *quê*.
- Sem código morto nem código comentado.
- Complexidade cognitiva ≤ 10; funções com mais de 4 parâmetros recebem um objeto.
- Rodar `bun run check` antes de commitar (o pre-commit também roda).

O README ganha um parágrafo em "Desenvolvimento" com `bun install` (liga o hook) e `bun run check`,
apontando para `CLAUDE.md`.

### 3. Heurística de comentários (`scripts/check-comments.ts`)

- Varre `hooks/`, `types/`, `tests/`, `scripts/` (`.ts`/`.tsx`).
- Extrai comentários `//` e `/* … */`, ignorando o conteúdo de strings e template literals
  (para não acusar textos de UI ou fixtures).
- Falha se um comentário contiver caractere acentuado do português (`[áàâãéêíóôõúç]`, maiúsculas
  inclusive) ou uma palavra de uma lista curta (`não`, `quando`, `para`, `sem`, `com`, `uma`, `que`,
  `ainda`, `só`) como palavra inteira.
- Saída: `arquivo:linha: comentário` para cada ocorrência; código de saída 1 se houver alguma.
- A detecção fica numa função pura exportada (`findPortugueseComments(source)`), e o script só faz
  a varredura de arquivos e a saída. Um teste em `tests/check-comments.test.ts` cobre string vs. comentário,
  bloco multilinha e palavra inteira vs. substring (ex. `para` em `parameter` não acusa).

É uma heurística: não substitui a convenção escrita nem a revisão.

### 4. Pre-commit (`.githooks/pre-commit`)

Shell script executável: `exec bun run check`. Ativado por `bun install` (script `prepare`). Se ficar
lento demais, a decisão de separar testes será revisitada — por ora roda tudo.

### 5. Limpeza do código

Ordem — cada passo é um commit e termina com a suíte verde e a UI idêntica:

1. **Ferramentas em modo relatório.** Entra a configuração; registra-se o baseline de violações.
   O formatter roda uma vez, num commit isolado só de formatação.
2. **Código morto** (guiado pelo Knip): remover exports/constantes sem uso (ex. `PLUGIN` em
   `hooks/atoms.ts`; exports de `summary.ts`/`link.ts` usados só internamente); deduplicar `baseName`
   (hoje em `hooks/link.ts` e `hooks/summary.ts`) num único lugar.
3. **Duplicação e complexidade:**
   - extrair `projectSections(derived)` puro em `hooks/summary.ts`, devolvendo a lista de seções do
     bloco PROJETO (título, cor, itens, se recolhível); `summarize` e `paneView` passam a consumi-la;
   - `paneView` recebe um objeto `{ elements, project, live, expanded, selected, onToggle, onSelect }`;
   - quebrar o handler de `tool.call` e `backfill` (`hooks/register.tsx`) em funções de topo menores
     até ficarem ≤ 10, respeitando as restrições do engine;
   - trocar ternários aninhados (`labelOf`, `specLine`, `sessionLine`) por `if`/tabela de lookup.
4. **Nomes:** ex. `str`→`asString`, `strs`→`asStringArray`, `ran`→`result`/`hookResult`,
   `acc`→`currentLive`, `dep`→`dependency`, `one`→nome do domínio, `P`/`FILES` nos testes. `$`, `e`,
   `next` permanecem.
5. **Comentários e testes em inglês:** traduzir os comentários de `hooks/`, `types/` e `tests/`;
   remover os que só repetem o código; traduzir as descrições de `test(...)`. Asserções sobre textos
   de UI continuam esperando PT-BR.
6. **Ligar a guarda:** `check-comments` e pre-commit ativos; verificar que um commit com violação
   (ex. comentário em português, função com complexidade > 10) é bloqueado e que o repositório limpo
   passa.

## Verificação

- `bun run check` verde ao fim de cada passo.
- Os testes existentes (`summary.test.ts`, `register.test.tsx`) já fixam os textos de UI: suas
  asserções não podem mudar durante a limpeza — só as descrições de `test(...)` são traduzidas.
- Teste manual final: `claude --plugin-dir .` abre o painel com a mesma aparência; `/sp status`
  imprime o mesmo texto.
- Teste de bloqueio: commit de prova com violação é rejeitado pelo hook (e descartado em seguida).
