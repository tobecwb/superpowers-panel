export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type Spec = { path: string; slug: string; date: string }

export type PlanTask = {
  id: number
  subject: string
  status: TaskStatus
  blockedBy: number[]
  userGate: boolean
}

export type Plan = {
  path: string
  slug: string
  date: string
  specRef?: string
  tasksFile: 'ok' | 'missing' | 'invalid'
  tasks: PlanTask[]
}

export type Project = {
  specs: Spec[]
  plans: Plan[]
  scannedAt: number
  hasSuperpowersDir: boolean
}

export type SessionTask = {
  id: string
  subject: string
  status: TaskStatus
  blockedBy: string[]
}

export type Live = {
  phase?: string
  activePlan?: string
  sessionTasks: Record<string, SessionTask>
  syncNote?: string
}

declare module 'claude-code' {
  interface PluginState {
    'superpowers-panel': {
      project: Shaped<Project>
      live: Shaped<Live>
      expanded: Shaped<string[]>
      // Caminho do plano aberto no DETALHE; '' quando nenhum.
      selected: Shaped<string>
    }
  }
}
