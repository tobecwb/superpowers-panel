import type { EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { Locale, LocaleChoice, Project } from '../types'

import { EMPTY_PROJECT, PANE } from './atoms'
import { detectLocale, messagesFor, parseLocaleChoice } from './i18n'
import { applyEvent, EMPTY_LIVE, type MessageLike, parsePromptSkill, replay, taskListOf, toolEvent } from './live'
import { parsePanelAction, toggleKey } from './panel-action'
import { coalesce, type FsLike, isSuperpowersPath, mergeWatchPaths, scanProject, watchTargets } from './scan'
import { textView } from './text-view'
import { buildPanel, type PanelModel } from './view-model'

// Bump the shape when the format changes: it discards what a previous version stored.
const projectAtom = atom({ plugin: 'superpowers-panel', key: 'project' } as const, EMPTY_PROJECT, {
  shape: 'project-1',
})
const liveAtom = atom({ plugin: 'superpowers-panel', key: 'live' } as const, EMPTY_LIVE, { shape: 'live-1' })
const expandedAtom = atom({ plugin: 'superpowers-panel', key: 'expanded' } as const, [] as string[], {
  shape: 'expanded-1',
})
const selectedAtom = atom({ plugin: 'superpowers-panel', key: 'selected' } as const, '', { shape: 'selected-1' })
const localeAtom = atom({ plugin: 'superpowers-panel', key: 'locale' } as const, 'auto' as LocaleChoice, {
  shape: 'locale-1',
})
const resolvedLocaleAtom = atom({ plugin: 'superpowers-panel', key: 'resolvedLocale' } as const, 'en' as Locale, {
  shape: 'resolved-locale-1',
})

const WATCHED = new Set(['TaskCreate', 'TaskUpdate', 'Skill', 'Read', 'Write', 'Edit'])

const debug = ($: EngineInterface, error: unknown) => $.ui.log(`superpowers-panel: ${String(error)}`, { to: 'debug' })

const fsOf = ($: EngineInterface): FsLike => ({
  exists: path => $.fs.exists(path),
  list: path => $.fs.list(path),
  read: path => $.fs.read(path) as Promise<string>,
})

const languageSetting = ($: EngineInterface): Promise<unknown> =>
  $.settings.read({ key: 'language' }).catch(error => {
    debug($, error)
    return undefined
  })

const resolveLocale = async ($: EngineInterface): Promise<Locale> => {
  const langEnv = await $.env.get('LANG').catch(error => {
    debug($, error)
    return undefined
  })
  const locale = detectLocale(await read($, localeAtom), await languageSetting($), langEnv)
  await update($, resolvedLocaleAtom, () => locale)
  $.ui.invalidate('command.describe')
  return locale
}

const sessionMessages = async ($: EngineInterface) => messagesFor(await read($, resolvedLocaleAtom))

const panelModel = async ($: EngineInterface): Promise<PanelModel> =>
  buildPanel({
    project: await read($, projectAtom),
    live: await read($, liveAtom),
    ui: { expanded: await read($, expandedAtom), selected: await read($, selectedAtom) },
    messages: await sessionMessages($),
  })

// The engine only accepts `$` passed to top-level functions and `update` with the
// atom written at the call site: the work serialized by `coalesce` only scans and
// keeps the latest result; the caller writes it.
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
    // Session without the native task tools: nothing to sync, no warning.
    const hasTaskList = (await $.tool.list()).some(tool => tool.name === 'TaskList')
    if (hasTaskList) {
      const hookResult = await $.tool.call({ tool: 'TaskList' })
      const tasks = 'deny' in hookResult && hookResult.deny !== undefined ? undefined : taskListOf(hookResult.result)
      if (!tasks) throw new Error('TaskList unavailable')
      live = { ...applyEvent(live, { kind: 'snapshot', tasks }), syncNote: undefined }
    } else {
      live = { ...live, syncNote: undefined }
    }
  } catch (error) {
    debug($, error)
    live = { ...live, syncNote: 'partial' }
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
  if ((await read($, projectAtom)).hasSuperpowersDir)
    await $.ui.open({ id: PANE, title: (await sessionMessages($)).title })
}

const rootOr = ($: EngineInterface, fallback: string): Promise<string> => $.session.root().catch(() => fallback)

// The engine replaces the dynamic list with the `watchPaths` the hook returns: we only
// merge ours when someone (the engine or another hook) already returns one.
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

const languageCommand = async ($: EngineInterface, argument: string) => {
  if (argument === '') {
    const choice = await read($, localeAtom)
    const locale = await read($, resolvedLocaleAtom)
    return { text: messagesFor(locale).replies.language(locale, choice === 'auto') }
  }
  const choice = parseLocaleChoice(argument)
  if (choice === undefined) return { text: (await sessionMessages($)).replies.languageUsage }
  await update($, localeAtom, () => choice)
  return { text: messagesFor(await resolveLocale($)).replies.languageSet(choice === 'auto') }
}

// The detail card sits at the top of the pane: a plan clicked far down a long list would open it out of sight.
const selectPlan = async ($: EngineInterface, planPath: string) => {
  const selected = await update($, selectedAtom, current => (current === planPath ? '' : planPath))
  if (selected !== '') await $.ui.scroll({ in: PANE, to: 'start', block: 'start' }).catch(error => debug($, error))
}

const takesNoArguments = (subcommand: string): boolean => subcommand === 'sync' || subcommand === 'status'

const togglePane = async ($: EngineInterface) => {
  const messages = await sessionMessages($)
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
    await $.ui.close({ id: PANE })
    return { text: messages.replies.closed }
  }
  const opened = await $.ui.open({ id: PANE, title: messages.title })
  return { text: opened.isPlaced ? messages.replies.opened : messages.replies.waitingRoom(opened.reason) }
}

const runCommand = async ($: EngineInterface, args: string) => {
  const [subcommand = '', ...rest] = args.trim().split(/\s+/)
  if (takesNoArguments(subcommand) && rest.length > 0) return { text: (await sessionMessages($)).usage }
  if (subcommand === 'sync') {
    await rescan($)
    await backfill($)
    return { text: (await sessionMessages($)).replies.synced }
  }
  if (subcommand === 'status') return { text: textView(await panelModel($)) }
  if (subcommand === 'lang') return languageCommand($, rest.join(' '))
  if (subcommand !== '') return { text: (await sessionMessages($)).usage }
  return togglePane($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const messages = messagesFor(await resolveLocale($).catch(() => 'en' as const))
    await $.command.register({ name: 'sp', description: messages.commandDescription })
    void initialize($).catch(error => debug($, error))
    return next(e)
  })

  on('command.describe', { command: 'sp' }, async ($, e, next) => {
    const described = await next(e)
    return { ...described, description: (await sessionMessages($)).commandDescription }
  }).catch((_$, e, next) => next(e))

  // Another session touching docs/superpowers (e.g. a .tasks.json reaching 7/7) only
  // shows up if the engine watches those folders and reports it through FileChanged.
  on('classic.SessionStart', async ($, e, next) => {
    const hookResult = await next(e)
    try {
      const root = await rootOr($, e.cwd)
      return { ...hookResult, watchPaths: mergeWatchPaths(hookResult.watchPaths, watchTargets(root)) }
    } catch (error) {
      debug($, error)
      return hookResult
    }
  }).catch((_$, e, next) => next(e)) // fail open: never blocks session start

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
  }).catch((_$, e, next) => next(e)) // fail open: never blocks the tool

  on('prompt.submit', async ($, e, next) => {
    const skill = parsePromptSkill(e.text)
    if (skill)
      await update($, liveAtom, live => applyEvent(live, { kind: 'skill', ...skill })).catch(error => debug($, error))
    return next(e)
  }).catch((_$, e, next) => next(e)) // fail open: never blocks the prompt

  on('turn.complete', async ($, e, next) => {
    void rescan($).catch(error => debug($, error))
    return next(e)
  })

  on('command.run', { command: 'sp' }, ($, e) => runCommand($, e.args))

  on('ui.render', { component: 'Pane', requestId: 'superpowers' }, async ($, e) => {
    const model = await panelModel($)
    // `resolve` completes every table with all element names (a missing one draws a
    // fragment), so `'Client' in elements` is always true: the surface tells instead.
    if (e.surface === 'terminal' || e.surface === 'desktop') {
      const { Client } = $.ui.resolve(e)
      return (
        <Client
          key="panel"
          module="./panel.tsx"
          width="100%"
          props={{ ...model, bodyRows: e.props.scroll.bodyRows, surface: e.surface }}
        />
      )
    }
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {textView(model)
          .split('\n')
          .map((line, index) => (
            <Text key={String(index)}>{line}</Text>
          ))}
      </Box>
    )
  })

  on('ui.message', async ($, e, next) => {
    const action = parsePanelAction(e.data)
    if (action?.action === 'toggle') await update($, expandedAtom, list => toggleKey(list, action.key))
    else if (action?.action === 'select') await selectPlan($, action.key)
    else debug($, `unknown panel message: ${JSON.stringify(e.data)}`)
    return next(e)
  }).catch((_$, e, next) => next(e))
}
