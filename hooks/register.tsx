import type { EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { Project } from '../types'

import { EMPTY_PROJECT, PANE, TITLE } from './atoms'
import { derive } from './link'
import { applyEvent, EMPTY_LIVE, type MessageLike, parsePromptSkill, replay, taskListOf, toolEvent } from './live'
import { type PaneElements, paneView } from './pane'
import { coalesce, type FsLike, isSuperpowersPath, mergeWatchPaths, scanProject, watchTargets } from './scan'
import { summarize } from './summary'

// Trocar o shape quando o formato mudar: declina o que uma versão anterior guardou.
const projectAtom = atom({ plugin: 'superpowers-panel', key: 'project' } as const, EMPTY_PROJECT, {
  shape: 'project-1',
})
const liveAtom = atom({ plugin: 'superpowers-panel', key: 'live' } as const, EMPTY_LIVE, { shape: 'live-1' })
const expandedAtom = atom({ plugin: 'superpowers-panel', key: 'expanded' } as const, [] as string[], {
  shape: 'expanded-1',
})
const selectedAtom = atom({ plugin: 'superpowers-panel', key: 'selected' } as const, '', { shape: 'selected-1' })

const WATCHED = new Set(['TaskCreate', 'TaskUpdate', 'Skill', 'Read', 'Write', 'Edit'])
const USAGE = 'Uso: /sp (abre/fecha o painel) · /sp status · /sp sync'

const debug = ($: EngineInterface, error: unknown) => $.ui.log(`superpowers-panel: ${String(error)}`, { to: 'debug' })

const fsOf = ($: EngineInterface): FsLike => ({
  exists: path => $.fs.exists(path),
  list: path => $.fs.list(path),
  read: path => $.fs.read(path) as Promise<string>,
})

// O engine só aceita `$` passado a funções declaradas no topo do arquivo e
// `update` com o atom escrito no ponto da chamada: o trabalho serializado por
// `coalesce` só varre e guarda o resultado mais recente; quem pediu grava.
const scans: { latest?: Project } = {}

const scanLatest = coalesce(async (job: { fs: FsLike; root: string }) => {
  scans.latest = await scanProject(job.fs, job.root, Date.now())
})

const rescan = async ($: EngineInterface) => {
  await scanLatest({ fs: fsOf($), root: await $.session.root() })
  const project = scans.latest
  if (project) await update($, projectAtom, () => project)
}

const backfill = async ($: EngineInterface) => {
  const messages = await $.session.messages()
  let live = replay(Array.isArray(messages) ? (messages as readonly MessageLike[]) : [])
  try {
    // Sessão sem as ferramentas nativas de tarefa: nada a sincronizar, sem aviso.
    const hasTaskList = (await $.tool.list()).some(tool => tool.name === 'TaskList')
    if (hasTaskList) {
      const hookResult = await $.tool.call({ tool: 'TaskList' })
      const tasks = 'deny' in hookResult && hookResult.deny !== undefined ? undefined : taskListOf(hookResult.result)
      if (!tasks) throw new Error('TaskList indisponível')
      live = { ...applyEvent(live, { kind: 'snapshot', tasks }), syncNote: undefined }
    } else {
      live = { ...live, syncNote: undefined }
    }
  } catch (error) {
    debug($, error)
    live = { ...live, syncNote: 'sincronização parcial' }
  }
  const synced = live
  await update($, liveAtom, current => ({
    ...synced,
    phase: current.phase ?? synced.phase,
    activePlan: current.activePlan ?? synced.activePlan,
  }))
}

const initialize = async ($: EngineInterface) => {
  await rescan($)
  await backfill($)
  if ((await read($, projectAtom)).hasSuperpowersDir) await $.ui.open({ id: PANE, title: TITLE })
}

const rootOr = ($: EngineInterface, fallback: string): Promise<string> => $.session.root().catch(() => fallback)

// O engine troca a lista dinâmica pelo `watchPaths` que o hook devolve: só
// juntamos os nossos quando alguém (o engine ou outro hook) já devolve uma.
const withOurWatch = async <R extends object>($: EngineInterface, hookResult: R, root: string): Promise<R> => {
  const existing = (hookResult as { watchPaths?: unknown }).watchPaths
  if (!Array.isArray(existing)) return hookResult
  return { ...hookResult, watchPaths: mergeWatchPaths(existing as string[], watchTargets(await rootOr($, root))) }
}

const recordToolCall = async ($: EngineInterface, tool: string, input: Record<string, unknown>, result: unknown) => {
  const event = toolEvent(tool, input, result)
  if (event) await update($, liveAtom, live => applyEvent(live, event))
  const isSuperpowersWrite = (tool === 'Write' || tool === 'Edit') && isSuperpowersPath(input.file_path)
  if (isSuperpowersWrite) void rescan($).catch(error => debug($, error))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sp', description: 'Painel superpowers: /sp, /sp status, /sp sync' })
    void initialize($).catch(error => debug($, error))
    return next(e)
  })

  // Outra sessão mexendo em docs/superpowers (ex.: .tasks.json chegando a 7/7)
  // só aparece se o engine observar essas pastas e avisar via FileChanged.
  on('classic.SessionStart', async ($, e, next) => {
    const hookResult = await next(e)
    try {
      const root = await rootOr($, e.cwd)
      return { ...hookResult, watchPaths: mergeWatchPaths(hookResult.watchPaths, watchTargets(root)) }
    } catch (error) {
      debug($, error)
      return hookResult
    }
  }).catch((_$, e, next) => next(e)) // falha aberta: nunca bloqueia o início

  on('classic.CwdChanged', async ($, e, next) => {
    const hookResult = await next(e)
    void rescan($).catch(error => debug($, error))
    try {
      return await withOurWatch($, hookResult, e.new_cwd)
    } catch (error) {
      debug($, error)
      return hookResult
    }
  }).catch((_$, e, next) => next(e))

  on('classic.FileChanged', async ($, e, next) => {
    const hookResult = await next(e)
    if (isSuperpowersPath(e.file_path)) void rescan($).catch(error => debug($, error))
    try {
      return await withOurWatch($, hookResult, e.cwd)
    } catch (error) {
      debug($, error)
      return hookResult
    }
  }).catch((_$, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (!WATCHED.has(tool)) return next(e)
    const hookResult = await next(e)
    const isDenied = 'deny' in hookResult && hookResult.deny !== undefined
    if (isDenied || hookResult.isError) return hookResult
    const input = e as unknown as Record<string, unknown>
    await recordToolCall($, tool, input, hookResult.result).catch(error => debug($, error))
    return hookResult
  }).catch((_$, e, next) => next(e)) // falha aberta: nunca bloqueia a ferramenta

  on('prompt.submit', async ($, e, next) => {
    const skill = parsePromptSkill(e.text)
    if (skill)
      await update($, liveAtom, live => applyEvent(live, { kind: 'skill', ...skill })).catch(error => debug($, error))
    return next(e)
  }).catch((_$, e, next) => next(e)) // falha aberta: nunca bloqueia o prompt

  on('turn.complete', async ($, e, next) => {
    void rescan($).catch(error => debug($, error))
    return next(e)
  })

  on('command.run', { command: 'sp' }, async ($, e) => {
    const subcommand = e.args.trim()
    if (subcommand === 'sync') {
      await rescan($)
      await backfill($)
      return { text: 'Superpowers: sincronizado.' }
    }
    if (subcommand === 'status') {
      const project = await read($, projectAtom)
      const live = await read($, liveAtom)
      return { text: summarize(derive(project, live), project, live) }
    }
    if (subcommand !== '') return { text: USAGE }
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: 'Painel superpowers fechado.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Painel superpowers aberto.' : `Painel aguardando espaço: ${opened.reason}` }
  })

  on('ui.render', { component: 'Pane', requestId: 'superpowers' }, async ($, e) => {
    const elements: PaneElements = $.ui.resolve(e)
    const project = await read($, projectAtom)
    const live = await read($, liveAtom)
    const expanded = await read($, expandedAtom)
    const onToggle = (key: string) => () => {
      void update($, expandedAtom, list =>
        list.includes(key) ? list.filter(expandedKey => expandedKey !== key) : [...list, key],
      )
    }
    const selected = await read($, selectedAtom)
    const onSelect = (path: string) => () => {
      void update($, selectedAtom, current => (current === path ? '' : path))
    }
    return paneView({ elements, project, live, expanded, selected, onToggle, onSelect })
  })
}
