import type { Locale } from '../../types'
import type { Messages } from './pt-BR'

const plural = (count: number, one: string, other: string): string => (count === 1 ? one : other)

export const en: Messages = {
  title: 'Superpowers',
  commandDescription: 'Superpowers panel: /sp, /sp status, /sp sync, /sp lang',
  usage: 'Usage: /sp (toggle the panel) · /sp status · /sp sync · /sp lang [pt-BR|en|auto]',
  labels: {
    phase: 'Phase',
    plan: 'Plan',
    now: 'Now',
    next: 'Up next',
    outside: 'Outside the plan',
    project: 'Project',
    emptyProject: 'No specs or plans yet.',
    noFlow: 'No active flow',
    close: '✕ close',
    noData: 'No superpowers data in this project.',
  },
  phases: {
    brainstorming: 'Brainstorming',
    planning: 'Planning',
    executing: 'Executing',
    gate: 'Checking gate',
    review: 'In review',
    debugging: 'Debugging',
  },
  startHint: 'Start with /superpowers-extended-cc:brainstorming',
  syncWarning: '⚠ Some tasks could not be read — /sp sync',
  waitingYou: 'waiting on you',
  waitingFor: (ids: string) => `waiting on ${ids}`,
  doneCount: (count: number) => plural(count, '1 done', `${count} done`),
  specsWithoutPlan: (count: number) => plural(count, '1 spec without a plan', `${count} specs without a plan`),
  incompletePlans: (count: number) => plural(count, '1 incomplete plan', `${count} incomplete plans`),
  plansWithoutSpec: (count: number) => plural(count, '1 plan without a spec', `${count} plans without a spec`),
  completePlans: (count: number) => plural(count, '1 completed plan', `${count} completed plans`),
  tasksFile: { missing: 'no tasks.json', invalid: 'invalid tasks.json' },
  specMissing: 'spec not found',
  spec: (name: string) => `Spec: ${name}`,
  specNotFound: (ref: string) => `Spec: not found (${ref})`,
  noSpec: 'Spec: —',
  replies: {
    synced: 'Superpowers: synced.',
    opened: 'Superpowers panel opened.',
    closed: 'Superpowers panel closed.',
    waitingRoom: (reason: string) => `Panel waiting for room: ${reason}`,
    language: (locale: Locale, isAuto: boolean) =>
      `Language: ${locale}${isAuto ? ' (automatic)' : ''} · /sp lang pt-BR|en|auto`,
    languageSet: (isAuto: boolean) => `Panel language: English (en)${isAuto ? ', automatic' : ''}.`,
    languageUsage: 'Usage: /sp lang pt-BR|en|auto',
  },
}
