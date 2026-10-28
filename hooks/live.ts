import type { Live, SessionTask } from '../types'
import { toStatus } from './parse'

const SKILL_PREFIX = 'superpowers-extended-cc:'
export const EMPTY_LIVE: Live = { sessionTasks: {} }

const PLAN_SKILLS = new Set(['executing-plans', 'subagent-driven-development'])
const PLAN_PATH = /docs\/superpowers\/plans\/[^\s`'"]+?\.md(?![\w-])/

export type LiveEvent =
  | { kind: 'create'; id: string; subject: string }
  | { kind: 'update'; id: string; subject?: string; status?: string; addBlockedBy: string[] }
  | { kind: 'skill'; skill: string; args?: string }
  | { kind: 'touch'; path: string }
  | { kind: 'snapshot'; tasks: SessionTask[] }

export type MessageLike = {
  role: 'user' | 'assistant'
  text: string
  toolUses: readonly {
    tool_use_id?: string
    tool: string
    input: Record<string, unknown>
    result?: unknown
    isError?: true
  }[]
}

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export const extractPlanPath = (text: string): string | undefined => PLAN_PATH.exec(text)?.[0]

export const parsePromptSkill = (text: string): { skill: string; args?: string } | undefined => {
  const tag = /<command-name>\/?superpowers-extended-cc:([\w-]+)<\/command-name>/.exec(text)
  if (tag) {
    return { skill: SKILL_PREFIX + tag[1], args: /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1] }
  }
  const typed = /^\/superpowers-extended-cc:([\w-]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  return typed ? { skill: SKILL_PREFIX + typed[1], args: typed[2] } : undefined
}

export const toolEvent = (tool: string, input: Record<string, unknown>, result: unknown): LiveEvent | undefined => {
  switch (tool) {
    case 'TaskCreate': {
      const id = (result as { task?: { id?: unknown } } | undefined)?.task?.id
      const subject = asString(input.subject)
      return typeof id === 'string' && subject !== undefined ? { kind: 'create', id, subject } : undefined
    }
    case 'TaskUpdate': {
      const id = asString(input.taskId)
      return id === undefined
        ? undefined
        : {
            kind: 'update',
            id,
            subject: asString(input.subject),
            status: asString(input.status),
            addBlockedBy: asStringArray(input.addBlockedBy),
          }
    }
    case 'Skill': {
      const skill = asString(input.skill)
      return skill === undefined ? undefined : { kind: 'skill', skill, args: asString(input.args) }
    }
    case 'Read':
    case 'Write':
    case 'Edit': {
      const path = asString(input.file_path)
      return path === undefined ? undefined : { kind: 'touch', path }
    }
  }
  return undefined
}

export const taskListOf = (result: unknown): SessionTask[] | undefined => {
  const tasks = (result as { tasks?: unknown } | undefined)?.tasks
  if (!Array.isArray(tasks)) return undefined
  return tasks.flatMap((task: unknown): SessionTask[] => {
    const raw = task as Record<string, unknown> | null
    const id = asString(raw?.id)
    const subject = asString(raw?.subject)
    return id === undefined || subject === undefined
      ? []
      : [{ id, subject, status: toStatus(raw?.status), blockedBy: asStringArray(raw?.blockedBy) }]
  })
}

type UpdateEvent = Extract<LiveEvent, { kind: 'update' }>
type SkillEvent = Extract<LiveEvent, { kind: 'skill' }>
type TouchEvent = Extract<LiveEvent, { kind: 'touch' }>

const applyUpdate = (live: Live, event: UpdateEvent): Live => {
  const { [event.id]: current, ...rest } = live.sessionTasks
  if (event.status === 'deleted') return { ...live, sessionTasks: rest }
  // The native ID is never displayed: without a known subject there is nothing to show.
  if (!current && event.subject === undefined) return live
  const base: SessionTask = current ?? { id: event.id, subject: event.subject ?? '', status: 'pending', blockedBy: [] }
  return {
    ...live,
    sessionTasks: {
      ...live.sessionTasks,
      [event.id]: {
        ...base,
        subject: event.subject ?? base.subject,
        status: event.status === undefined ? base.status : toStatus(event.status),
        blockedBy: [...new Set([...base.blockedBy, ...event.addBlockedBy])],
      },
    },
  }
}

const applySkill = (live: Live, event: SkillEvent): Live => {
  if (!event.skill.startsWith(SKILL_PREFIX)) return live
  const phase = event.skill.slice(SKILL_PREFIX.length)
  const plan = PLAN_SKILLS.has(phase) && event.args ? extractPlanPath(event.args) : undefined
  return { ...live, phase, ...(plan ? { activePlan: plan } : {}) }
}

const applyTouch = (live: Live, event: TouchEvent): Live => {
  if (!event.path.endsWith('.tasks.json')) return live
  const plan = extractPlanPath(event.path)
  return plan ? { ...live, activePlan: plan } : live
}

export const applyEvent = (live: Live, event: LiveEvent): Live => {
  switch (event.kind) {
    case 'create':
      return {
        ...live,
        sessionTasks: {
          ...live.sessionTasks,
          [event.id]: { id: event.id, subject: event.subject, status: 'pending', blockedBy: [] },
        },
      }
    case 'update':
      return applyUpdate(live, event)
    case 'skill':
      return applySkill(live, event)
    case 'touch':
      return applyTouch(live, event)
    case 'snapshot':
      return { ...live, sessionTasks: Object.fromEntries(event.tasks.map(task => [task.id, task])) }
  }
}

export const replay = (messages: readonly MessageLike[]): Live =>
  messages.reduce((live, message) => {
    if (message.role === 'user') {
      const skill = parsePromptSkill(message.text)
      return skill ? applyEvent(live, { kind: 'skill', ...skill }) : live
    }
    return message.toolUses.reduce((currentLive, toolUse) => {
      if (toolUse.isError || typeof toolUse.result === 'string') return currentLive
      const event = toolEvent(toolUse.tool, toolUse.input, toolUse.result)
      return event ? applyEvent(currentLive, event) : currentLive
    }, live)
  }, EMPTY_LIVE)
