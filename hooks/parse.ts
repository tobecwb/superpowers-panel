import type { PlanTask, TaskStatus } from '../types'

const STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'completed']
const FENCE = /```json:metadata\s*\n([\s\S]*?)\n```/

export const toStatus = (value: unknown): TaskStatus =>
  STATUSES.includes(value as TaskStatus) ? (value as TaskStatus) : 'pending'

export const parseName = (file: string): { date: string; slug: string } => {
  const base = file.replace(/\.md$/, '')
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(base)
  const rest = match ? match[2]! : base

  return { date: match ? match[1]! : '', slug: rest.replace(/-design$/, '') }
}

export const parseSpecRef = (planText: string): string | undefined =>
  /^\*\*Spec:\*\*\s*`?([^`\s]+)`?/m.exec(planText)?.[1]

export const parseMetadata = (description: string): Record<string, unknown> | undefined => {
  const match = FENCE.exec(description)
  if (!match) return undefined
  try {
    const value: unknown = JSON.parse(match[1]!)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

const isUserGate = (meta: Record<string, unknown> | undefined): boolean =>
  meta?.userGate === true || (Array.isArray(meta?.tags) && meta.tags.includes('user-gate'))

export const parseTasksFile = (text: string): PlanTask[] | undefined => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return undefined
  }
  const tasks = (data as { tasks?: unknown } | null)?.tasks
  if (!Array.isArray(tasks)) return undefined

  return tasks.flatMap((task: unknown, index): PlanTask[] => {
    if (!task || typeof task !== 'object') return []
    const raw = task as Record<string, unknown>
    const description = typeof raw.description === 'string' ? raw.description : ''

    return [
      {
        id: typeof raw.id === 'number' ? raw.id : index,
        subject: typeof raw.subject === 'string' ? raw.subject : `Task ${index}`,
        status: toStatus(raw.status),
        blockedBy: Array.isArray(raw.blockedBy)
          ? raw.blockedBy.filter((id): id is number => typeof id === 'number')
          : [],
        userGate: isUserGate(parseMetadata(description)),
      },
    ]
  })
}
