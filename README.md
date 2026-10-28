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
