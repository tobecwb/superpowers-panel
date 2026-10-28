import type { Live, Plan, PlanTask, Project, SessionTask, Spec } from '../types'

export type PlanView = Plan & {
  spec?: Spec
  specMissing: boolean
  done: number
  total: number
  isComplete: boolean
  label?: string
}

export type Derived = {
  active?: PlanView
  outside: SessionTask[]
  specsWithoutPlan: Spec[]
  incomplete: PlanView[]
  withoutSpec: PlanView[]
  complete: PlanView[]
}

export type TaskGroups = {
  running: PlanTask[]
  pending: PlanTask[]
  blocked: PlanTask[]
  done: PlanTask[]
}

export const baseName = (path: string): string => path.split('/').pop() ?? path

export const linkPlan = (plan: Plan, specs: readonly Spec[]): { spec?: Spec; specMissing: boolean } => {
  if (plan.specRef !== undefined) {
    const ref = plan.specRef.replace(/\\/g, '/').replace(/^\.\//, '')
    const spec = specs.find(one => one.path === ref || baseName(one.path) === baseName(ref))
    return spec ? { spec, specMissing: false } : { specMissing: true }
  }
  const spec = specs.find(one => one.slug === plan.slug)
  return spec ? { spec, specMissing: false } : { specMissing: false }
}

export const activePlanPath = (plans: readonly Plan[], live: Live): string | undefined => {
  if (live.activePlan && plans.some(plan => plan.path === live.activePlan)) return live.activePlan
  const subjects = new Set(Object.values(live.sessionTasks).map(task => task.subject))
  let best: { path: string; hits: number } | undefined
  for (const plan of plans) {
    const hits = plan.tasks.filter(task => subjects.has(task.subject)).length
    if (hits > 0 && (!best || hits >= best.hits)) best = { path: plan.path, hits }
  }
  return best?.path
}

const mergeStatuses = (tasks: readonly PlanTask[], session: Record<string, SessionTask>): PlanTask[] => {
  const bySubject = new Map(Object.values(session).map(task => [task.subject, task.status]))
  return tasks.map(task => {
    const status = bySubject.get(task.subject)
    return status ? { ...task, status } : task
  })
}

export const isBlocked = (task: PlanTask, tasks: readonly PlanTask[]): boolean =>
  task.status !== 'completed' &&
  task.blockedBy.some(id => {
    const dep = tasks.find(one => one.id === id)
    return dep !== undefined && dep.status !== 'completed'
  })

export const groupTasks = (tasks: readonly PlanTask[]): TaskGroups => ({
  running: tasks.filter(task => task.status === 'in_progress'),
  pending: tasks.filter(task => task.status === 'pending' && !isBlocked(task, tasks)),
  blocked: tasks.filter(task => task.status === 'pending' && isBlocked(task, tasks)),
  done: tasks.filter(task => task.status === 'completed'),
})

const TASKS_FILE_LABEL: Record<Plan['tasksFile'], string | undefined> = {
  ok: undefined,
  missing: 'sem tasks.json',
  invalid: 'tasks.json inválido',
}

const labelOf = (plan: Plan): string | undefined => TASKS_FILE_LABEL[plan.tasksFile]

export const derive = (project: Project, live: Live): Derived => {
  const activePath = activePlanPath(project.plans, live)
  const views: PlanView[] = project.plans.map(plan => {
    const tasks = plan.path === activePath ? mergeStatuses(plan.tasks, live.sessionTasks) : plan.tasks
    const done = tasks.filter(task => task.status === 'completed').length
    return {
      ...plan,
      ...linkPlan(plan, project.specs),
      tasks,
      done,
      total: tasks.length,
      isComplete: plan.tasksFile === 'ok' && tasks.length > 0 && done === tasks.length,
      label: labelOf(plan),
    }
  })
  const linked = new Set(views.flatMap(view => (view.spec ? [view.spec.path] : [])))
  const active = views.find(view => view.path === activePath)
  const activeSubjects = new Set(active?.tasks.map(task => task.subject) ?? [])

  return {
    active,
    outside: Object.values(live.sessionTasks).filter(task => !activeSubjects.has(task.subject)),
    specsWithoutPlan: project.specs.filter(spec => !linked.has(spec.path)),
    incomplete: views.filter(view => !view.isComplete),
    withoutSpec: views.filter(view => !view.spec),
    complete: views.filter(view => view.isComplete),
  }
}
