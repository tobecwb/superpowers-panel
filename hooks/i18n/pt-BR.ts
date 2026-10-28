import type { Locale } from '../../types'

const plural = (count: number, one: string, other: string): string => (count === 1 ? one : other)

export const ptBR = {
  title: 'Superpowers',
  commandDescription: 'Painel superpowers: /sp, /sp status, /sp sync, /sp lang',
  usage: 'Uso: /sp (abre/fecha o painel) · /sp status · /sp sync · /sp lang [pt-BR|en|auto]',
  labels: {
    phase: 'Fase',
    plan: 'Plano',
    now: 'Agora',
    next: 'Próximas',
    outside: 'Fora do plano',
    project: 'Projeto',
    emptyProject: 'Nenhuma spec ou plano ainda.',
    noFlow: 'Nenhum fluxo ativo',
    close: '✕ fechar',
    noData: 'Nenhum dado superpowers neste projeto.',
  },
  phases: {
    brainstorming: 'Brainstorming',
    planning: 'Planejando',
    executing: 'Executando',
    gate: 'Verificando gate',
    review: 'Em revisão',
    debugging: 'Depurando',
  },
  startHint: 'Comece com /superpowers-extended-cc:brainstorming',
  syncWarning: '⚠ Algumas tarefas não puderam ser lidas — /sp sync',
  waitingYou: 'aguarda você',
  waitingFor: (ids: string) => `aguarda ${ids}`,
  doneCount: (count: number) => plural(count, '1 concluída', `${count} concluídas`),
  specsWithoutPlan: (count: number) => plural(count, '1 spec sem plano', `${count} specs sem plano`),
  incompletePlans: (count: number) => plural(count, '1 plano incompleto', `${count} planos incompletos`),
  plansWithoutSpec: (count: number) => plural(count, '1 plano sem spec', `${count} planos sem spec`),
  completePlans: (count: number) => plural(count, '1 plano concluído', `${count} planos concluídos`),
  tasksFile: { missing: 'sem tasks.json', invalid: 'tasks.json inválido' },
  specMissing: 'spec não encontrada',
  spec: (name: string) => `Spec: ${name}`,
  specNotFound: (ref: string) => `Spec: não encontrada (${ref})`,
  noSpec: 'Spec: —',
  replies: {
    synced: 'Superpowers: sincronizado.',
    opened: 'Painel superpowers aberto.',
    closed: 'Painel superpowers fechado.',
    waitingRoom: (reason: string) => `Painel aguardando espaço: ${reason}`,
    language: (locale: Locale, isAuto: boolean) =>
      `Idioma: ${locale}${isAuto ? ' (automático)' : ''} · /sp lang pt-BR|en|auto`,
    languageSet: (isAuto: boolean) => `Idioma do painel: português (pt-BR)${isAuto ? ', automático' : ''}.`,
    languageUsage: 'Uso: /sp lang pt-BR|en|auto',
  },
}

export type Messages = typeof ptBR
