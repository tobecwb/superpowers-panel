import type { Live, PlanTask, Project, SessionTask } from '../types'
import { groupTasks, isBlocked, type Derived, type PlanView } from './link'

const CELLS = 10

export const baseName = (path: string): string => path.split('/').pop() ?? path

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

export const sessionLine = (task: SessionTask): string => {
  const mark = task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▶' : '○'
  return `${mark} ${task.subject}`
}

export const phaseLine = (live: Live): string => `Fase: ${live.phase ? `▶ ${live.phase}` : '—'}`

export const planLine = (plan: PlanView): string =>
  `Plano: ${baseName(plan.path)}  ${bar(plan.done, plan.total)} ${plan.done}/${plan.total}`

export const incompleteItem = (plan: PlanView): string =>
  `  · ${baseName(plan.path)}  ${plan.label ?? `${plan.done}/${plan.total}`}`

export const withoutSpecItem = (plan: PlanView): string =>
  `  · ${baseName(plan.path)}${plan.specMissing ? '  (spec ausente)' : ''}`

export const isEmpty = (project: Project, live: Live): boolean =>
  !project.hasSuperpowersDir && Object.keys(live.sessionTasks).length === 0 && live.phase === undefined

export const orderedPlanTasks = (plan: PlanView): PlanTask[] => {
  const groups = groupTasks(plan.tasks)
  return [...groups.running, ...groups.pending, ...groups.blocked, ...groups.done]
}

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
    lines.push(`⚠ ${derived.specsWithoutPlan.length} spec(s) sem plano`,
      ...derived.specsWithoutPlan.map(spec => `  · ${baseName(spec.path)}`))
  }
  if (derived.incomplete.length > 0) {
    lines.push(`◐ ${derived.incomplete.length} plano(s) incompleto(s)`, ...derived.incomplete.map(incompleteItem))
  }
  if (derived.withoutSpec.length > 0) {
    lines.push(`⚠ ${derived.withoutSpec.length} plano(s) sem spec`, ...derived.withoutSpec.map(withoutSpecItem))
  }
  if (derived.complete.length > 0) {
    lines.push(`✓ ${derived.complete.length} plano(s) concluído(s)`,
      ...derived.complete.map(plan => `  · ${baseName(plan.path)}`))
  }
  if (lines.length === before) lines.push('Nenhuma spec ou plano ainda.')
  return lines.join('\n')
}
