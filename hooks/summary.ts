import type { Live, PlanTask, Project, SessionTask, TaskStatus } from '../types'
import { baseName, type Derived, groupTasks, isBlocked, type PlanView } from './link'

const CELLS = 10

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
      .filter(id => tasks.some(other => other.id === id && other.status !== 'completed'))
      .map(id => `T${id}`)
      .join(', ')
    return `⊘ ${name}  bloqueada por ${deps}${gate}`
  }
  return `○ ${name}${gate}`
}

const STATUS_MARK: Record<TaskStatus, string> = { completed: '✓', in_progress: '▶', pending: '○' }

export const sessionLine = (task: SessionTask): string => `${STATUS_MARK[task.status]} ${task.subject}`

export const phaseLine = (live: Live): string => `Fase: ${live.phase ? `▶ ${live.phase}` : '—'}`

const progress = (plan: PlanView): string => `${bar(plan.done, plan.total)} ${plan.done}/${plan.total}`

export const planLine = (plan: PlanView): string => `Plano: ${baseName(plan.path)}  ${progress(plan)}`

const incompleteItem = (plan: PlanView): string => `  · ${baseName(plan.path)}  ${plan.label ?? progress(plan)}`

const completeItem = (plan: PlanView): string => `  · ${baseName(plan.path)}  ${progress(plan)}`

const withoutSpecItem = (plan: PlanView): string =>
  `  · ${baseName(plan.path)}${plan.specMissing ? '  (spec ausente)' : ''}`

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

export const isEmpty = (project: Project, live: Live): boolean =>
  !project.hasSuperpowersDir && Object.keys(live.sessionTasks).length === 0 && live.phase === undefined

export const orderedPlanTasks = (plan: PlanView): PlanTask[] => {
  const groups = groupTasks(plan.tasks)
  return [...groups.running, ...groups.pending, ...groups.blocked, ...groups.done]
}

const specLine = (plan: PlanView): string => {
  if (plan.spec) return `Spec: ${baseName(plan.spec.path)}`
  if (plan.specMissing) return `Spec: ausente (${plan.specRef ?? ''})`
  return 'Spec: —'
}

// Header, spec and every task (completed ones included) of a plan.
export const detailLines = (plan: PlanView): string[] => [
  `${baseName(plan.path)}  ${plan.label ?? progress(plan)}`,
  specLine(plan),
  ...orderedPlanTasks(plan).map(task => taskLine(task, plan.tasks)),
]

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
  const sections = projectSections(derived)
  if (sections.length === 0) lines.push('Nenhuma spec ou plano ainda.')
  for (const section of sections) lines.push(section.header, ...section.items.map(item => item.label))
  return lines.join('\n')
}
