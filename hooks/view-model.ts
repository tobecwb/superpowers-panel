import type { Live, PlanTask, Project, SessionTask, TaskStatus } from '../types'
import type { Messages } from './i18n'
import { baseName, type Derived, derive, groupTasks, isBlocked, type PlanView } from './link'

type Tone = 'planMode' | 'claude' | 'permission' | 'suggestion' | 'error' | 'warning' | 'success' | 'subtle'

export type RowKind = 'running' | 'gate' | 'pending' | 'blocked' | 'done'

export type Row = { key: string; kind: RowKind; text: string; note?: string }

type PhaseBadge = { label: string; tone: Tone }

type Header = {
  phase?: PhaseBadge
  plan?: { name: string; done: number; total: number }
  hint?: string
  syncWarning?: string
}

type SectionId = 'specsWithoutPlan' | 'incomplete' | 'withoutSpec' | 'complete'

export type SectionItem = { key: string; label: string; note?: string; planPath?: string }

export type Section = {
  id: SectionId
  icon: string
  header: string
  tone: Tone
  collapsible: boolean
  expanded: boolean
  items: SectionItem[]
}

type DoneGroup = { label: string; expanded: boolean; keys: string[]; rows: Row[] }

type Detail = { path: string; title: string; note: string; specLine: string; rows: Row[] }

export type PanelModel = {
  isEmpty: boolean
  header: Header
  now: Row[]
  next: Row[]
  done?: DoneGroup
  outside: Row[]
  sections: Section[]
  detail?: Detail
  labels: Messages['labels']
}

type UiState = { expanded: readonly string[]; selected: string }

export type PanelInput = { project: Project; live: Live; ui: UiState; messages: Messages }

export const KIND_ICON: Record<RowKind, string> = { running: '▶', gate: '◆', pending: '○', blocked: '⊘', done: '✓' }

type PhaseKey = keyof Messages['phases']

// A Map keeps the hyphenated skill names out of object keys, which the naming lint rejects.
const PHASES = new Map<string, { key: PhaseKey; tone: Tone }>([
  ['brainstorming', { key: 'brainstorming', tone: 'planMode' }],
  ['writing-plans', { key: 'planning', tone: 'planMode' }],
  ['executing-plans', { key: 'executing', tone: 'claude' }],
  ['subagent-driven-development', { key: 'executing', tone: 'claude' }],
  ['checking-gates', { key: 'gate', tone: 'permission' }],
  ['specifying-gates', { key: 'gate', tone: 'permission' }],
  ['requesting-code-review', { key: 'review', tone: 'suggestion' }],
  ['receiving-code-review', { key: 'review', tone: 'suggestion' }],
  ['systematic-debugging', { key: 'debugging', tone: 'error' }],
])

const phaseBadge = (phase: string | undefined, messages: Messages): PhaseBadge | undefined => {
  if (phase === undefined) return undefined
  const known = PHASES.get(phase)
  return known ? { label: messages.phases[known.key], tone: known.tone } : { label: phase, tone: 'subtle' }
}

const displaySubject = (subject: string): string => subject.replace(/^Task\s+\d+:\s*/, '')

const pendingBlockers = (task: PlanTask, tasks: readonly PlanTask[]): string =>
  task.blockedBy
    .filter(id => tasks.some(other => other.id === id && other.status !== 'completed'))
    .map(id => `T${id}`)
    .join(', ')

const planRow = (task: PlanTask, tasks: readonly PlanTask[], messages: Messages): Row => {
  const base = { key: `task:${task.id}`, text: `T${task.id} ${displaySubject(task.subject)}` }
  const gateNote = task.userGate ? { note: messages.waitingYou } : {}
  if (task.status === 'completed') return { ...base, kind: 'done' }
  if (task.status === 'in_progress') return { ...base, kind: 'running', ...gateNote }
  if (isBlocked(task, tasks))
    return { ...base, kind: 'blocked', note: messages.waitingFor(pendingBlockers(task, tasks)) }
  return task.userGate ? { ...base, kind: 'gate', ...gateNote } : { ...base, kind: 'pending' }
}

const SESSION_KIND: Record<TaskStatus, RowKind> = { completed: 'done', in_progress: 'running', pending: 'pending' }

const sessionRow = (task: SessionTask): Row => ({
  key: `session:${task.id}`,
  kind: SESSION_KIND[task.status],
  text: task.subject,
})

const planRows = (plan: PlanView, messages: Messages): Row[] => {
  const groups = groupTasks(plan.tasks)
  return [...groups.running, ...groups.pending, ...groups.blocked, ...groups.done].map(task =>
    planRow(task, plan.tasks, messages),
  )
}

const ofKinds = (rows: readonly Row[], kinds: readonly RowKind[]): Row[] => rows.filter(row => kinds.includes(row.kind))

const doneGroup = (rows: readonly Row[], ui: UiState, messages: Messages): DoneGroup | undefined => {
  const done = ofKinds(rows, ['done'])
  if (done.length === 0) return undefined
  const expanded = ui.expanded.includes('done')
  return {
    label: messages.doneCount(done.length),
    expanded,
    keys: done.map(row => row.key),
    rows: expanded ? done : [],
  }
}

const progressNote = (plan: PlanView): string => `${plan.done}/${plan.total}`

const planNote = (plan: PlanView, messages: Messages): string =>
  plan.tasksFile === 'ok' ? progressNote(plan) : messages.tasksFile[plan.tasksFile]

const planItem = (prefix: string, plan: PlanView, note: string | undefined): SectionItem => ({
  key: `${prefix}:${plan.path}`,
  label: baseName(plan.path),
  planPath: plan.path,
  ...(note === undefined ? {} : { note }),
})

const projectSections = (derived: Derived, ui: UiState, messages: Messages): Section[] => {
  const sections: Omit<Section, 'expanded'>[] = [
    {
      id: 'specsWithoutPlan',
      icon: '⚠',
      header: messages.specsWithoutPlan(derived.specsWithoutPlan.length),
      tone: 'warning',
      collapsible: false,
      items: derived.specsWithoutPlan.map(spec => ({ key: `spec:${spec.path}`, label: baseName(spec.path) })),
    },
    {
      id: 'incomplete',
      icon: '◐',
      header: messages.incompletePlans(derived.incomplete.length),
      tone: 'suggestion',
      collapsible: false,
      items: derived.incomplete.map(plan => planItem('plan', plan, planNote(plan, messages))),
    },
    {
      id: 'withoutSpec',
      icon: '⚠',
      header: messages.plansWithoutSpec(derived.withoutSpec.length),
      tone: 'warning',
      collapsible: false,
      items: derived.withoutSpec.map(plan =>
        planItem('nospec', plan, plan.specMissing ? messages.specMissing : undefined),
      ),
    },
    {
      id: 'complete',
      icon: '✓',
      header: messages.completePlans(derived.complete.length),
      tone: 'success',
      collapsible: true,
      items: derived.complete.map(plan => planItem('plan', plan, progressNote(plan))),
    },
  ]
  return sections
    .filter(section => section.items.length > 0)
    .map(section => ({ ...section, expanded: !section.collapsible || ui.expanded.includes(section.id) }))
}

const specLine = (plan: PlanView, messages: Messages): string => {
  if (plan.spec) return messages.spec(baseName(plan.spec.path))
  if (plan.specMissing) return messages.specNotFound(plan.specRef ?? '')
  return messages.noSpec
}

const detailOf = (derived: Derived, selected: string, messages: Messages): Detail | undefined => {
  const plan = [...derived.incomplete, ...derived.complete].find(view => view.path === selected)
  if (selected === '' || plan === undefined) return undefined
  return {
    path: plan.path,
    title: baseName(plan.path),
    note: planNote(plan, messages),
    specLine: specLine(plan, messages),
    rows: planRows(plan, messages),
  }
}

const headerOf = (derived: Derived, live: Live, messages: Messages): Header => {
  const phase = phaseBadge(live.phase, messages)
  const plan = derived.active
  return {
    ...(phase ? { phase } : {}),
    ...(plan ? { plan: { name: baseName(plan.path), done: plan.done, total: plan.total } } : {}),
    ...(phase || plan ? {} : { hint: messages.startHint }),
    ...(live.syncNote ? { syncWarning: messages.syncWarning } : {}),
  }
}

const isEmpty = (project: Project, live: Live): boolean =>
  !project.hasSuperpowersDir && Object.keys(live.sessionTasks).length === 0 && live.phase === undefined

export const buildPanel = ({ project, live, ui, messages }: PanelInput): PanelModel => {
  const derived = derive(project, live)
  const rows = derived.active ? planRows(derived.active, messages) : []
  const done = doneGroup(rows, ui, messages)
  const detail = detailOf(derived, ui.selected, messages)
  return {
    isEmpty: isEmpty(project, live),
    header: headerOf(derived, live, messages),
    now: ofKinds(rows, ['running', 'gate']),
    next: ofKinds(rows, ['pending', 'blocked']),
    ...(done ? { done } : {}),
    outside: derived.outside.map(sessionRow),
    sections: projectSections(derived, ui, messages),
    ...(detail ? { detail } : {}),
    labels: messages.labels,
  }
}
