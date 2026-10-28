import type { Plan, PlanTask, Project, Spec } from '../types'
import { parseName, parseSpecRef, parseTasksFile } from './parse'

export type FsLike = {
  exists: (path: string) => Promise<boolean>
  list: (path: string) => Promise<readonly { name: string; kind: string }[]>
  read: (path: string) => Promise<string>
}

const ROOT_DIR = 'docs/superpowers'
const MAX_TASKS_BYTES = 4 * 1024 * 1024
const SPECS = `${ROOT_DIR}/specs`
const PLANS = `${ROOT_DIR}/plans`

export const isSuperpowersPath = (path: unknown): boolean =>
  typeof path === 'string' && path.replace(/\\/g, '/').includes(`${ROOT_DIR}/`)

export const watchTargets = (root: string): string[] => {
  const base = `${root.replace(/\/+$/, '')}/${ROOT_DIR}`
  return [base, `${base}/specs`, `${base}/plans`]
}

export const mergeWatchPaths = (existing: readonly string[] | undefined, ours: readonly string[]): string[] => {
  const merged = [...(existing ?? [])]
  for (const path of ours) if (!merged.includes(path)) merged.push(path)
  return merged
}

const markdownIn = async (fs: FsLike, root: string, dir: string): Promise<string[]> => {
  const full = `${root}/${dir}`
  if (!(await fs.exists(full))) return []
  return (await fs.list(full))
    .filter(entry => entry.kind === 'file' && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort()
}

const readPlan = async (fs: FsLike, root: string, name: string): Promise<Plan> => {
  const path = `${PLANS}/${name}`
  const text = await fs.read(`${root}/${path}`).catch(() => '')
  const tasksPath = `${root}/${path}.tasks.json`
  let tasksFile: Plan['tasksFile'] = 'missing'
  let tasks: PlanTask[] = []
  if (await fs.exists(tasksPath)) {
    const parsed = await fs.read(tasksPath).then(raw => (raw.length > MAX_TASKS_BYTES ? undefined : parseTasksFile(raw)), () => undefined)
    tasksFile = parsed ? 'ok' : 'invalid'
    tasks = parsed ?? []
  }
  return { path, ...parseName(name), specRef: parseSpecRef(text), tasksFile, tasks }
}

export const scanProject = async (fs: FsLike, root: string, now: number): Promise<Project> => {
  const hasSuperpowersDir = await fs.exists(`${root}/${ROOT_DIR}`)
  if (!hasSuperpowersDir) return { specs: [], plans: [], scannedAt: now, hasSuperpowersDir }
  const specs: Spec[] = (await markdownIn(fs, root, SPECS)).map(name => ({ path: `${SPECS}/${name}`, ...parseName(name) }))
  const plans = await Promise.all((await markdownIn(fs, root, PLANS)).map(name => readPlan(fs, root, name)))
  return { specs, plans, scannedAt: now, hasSuperpowersDir }
}

export const coalesce = <T>(task: (arg: T) => Promise<void>): ((arg: T) => Promise<void>) => {
  let running: Promise<void> | undefined
  let again = false
  let latest: T
  return arg => {
    latest = arg
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      try {
        do {
          again = false
          await task(latest)
        } while (again)
      } finally {
        running = undefined
      }
    })()
    return running
  }
}
