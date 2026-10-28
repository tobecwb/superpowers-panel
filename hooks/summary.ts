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
      .filter(id => tasks.some(one => one.id === id && one.status !== 'completed'))
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

export const incompleteItem = (plan: PlanView): string => `  · ${baseName(plan.path)}  ${plan.label ?? progress(plan)}`

export const completeItem = (plan: PlanView): string => `  · ${baseName(plan.path)}  ${progress(plan)}`

export const withoutSpecItem = (plan: PlanView): string =>
  `  · ${baseName(plan.path)}${plan.specMissing ? '  (spec ausente)' : ''}`

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

// Cabeçalho, spec e todas as tarefas (concluídas inclusive) de um plano.
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
  const before = lines.length
  if (derived.specsWithoutPlan.length > 0) {
    lines.push(
      `⚠ ${derived.specsWithoutPlan.length} spec(s) sem plano`,
      ...derived.specsWithoutPlan.map(spec => `  · ${baseName(spec.path)}`),
    )
  }
  if (derived.incomplete.length > 0) {
    lines.push(`◐ ${derived.incomplete.length} plano(s) incompleto(s)`, ...derived.incomplete.map(incompleteItem))
  }
  if (derived.withoutSpec.length > 0) {
    lines.push(`⚠ ${derived.withoutSpec.length} plano(s) sem spec`, ...derived.withoutSpec.map(withoutSpecItem))
  }
  if (derived.complete.length > 0) {
    lines.push(`✓ ${derived.complete.length} plano(s) concluído(s)`, ...derived.complete.map(completeItem))
  }
  if (lines.length === before) lines.push('Nenhuma spec ou plano ainda.')
  return lines.join('\n')
}
