# superpowers-panel

Mod para Claude Code que mostra, num painel lateral animado, o fluxo do
[superpowers-extended-cc](https://github.com/pcvelz/superpowers):

- cartão com a fase atual (skill superpowers ativa), o plano em execução e o progresso;
- **Agora** (tarefas em andamento e as que aguardam você), **Próximas** e concluídas;
- tarefas da sessão fora do plano;
- specs sem plano, planos incompletos, planos sem spec e planos concluídos — clique num plano para
  ver o detalhe.

## Uso

    claude --plugin-dir /caminho/para/superpowers-mod

O painel abre sozinho em projetos com `docs/superpowers/`.

- `/sp` — abre/fecha o painel
- `/sp status` — resumo em texto
- `/sp sync` — relê o projeto e as tarefas da sessão
- `/sp lang [pt-BR|en|auto]` — mostra ou fixa o idioma

O idioma (pt-BR ou en) segue a configuração `language` do Claude Code; sem ela, a variável `LANG`;
sem nenhuma das duas, inglês. `/sp lang` fixa uma escolha e `/sp lang auto` volta à detecção.

## Desenvolvimento

    bun install        # instala as ferramentas e liga o pre-commit
    bun run check      # typecheck + lint + código morto + comentários + testes
    bun run fix        # aplica formatação e correções automáticas do Biome

Convenções de código em [`CLAUDE.md`](CLAUDE.md).
