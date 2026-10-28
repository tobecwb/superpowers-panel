import { expect, test } from 'claude-code/testing'
import {
  barCells,
  isSpinning,
  type Motion,
  observe,
  percent,
  SPINNER,
  step,
  TICK_MS,
  withoutFlashing,
} from '../hooks/animation'
import type { PanelModel, Row } from '../hooks/view-model'

const LABELS: PanelModel['labels'] = {
  phase: 'Fase',
  plan: 'Plano',
  now: 'Agora',
  next: 'Próximas',
  outside: 'Fora do plano',
  project: 'Projeto',
  emptyProject: '-',
  noFlow: '-',
  close: '✕',
  noData: '-',
}

const row = (id: number, kind: Row['kind']): Row => ({ key: `task:${id}`, kind, text: `T${id}` })

const model = (extra: Partial<PanelModel> = {}): PanelModel => ({
  isEmpty: false,
  header: { plan: { name: 'auth.md', shortName: 'auth', done: 1, total: 4 } },
  now: [],
  next: [],
  outside: [],
  sections: [],
  labels: LABELS,
  ...extra,
})

const run = (motion: Motion, ticks: number): Motion => {
  let current = motion
  for (let index = 0; index < ticks; index++) current = step(current) ?? current
  return current
}

test('observe starts settled and ignores an equal model', async () => {
  const first = observe(undefined, model())
  expect(first.shownDone).toBe(1)
  expect(first.flashes).toEqual([])
  expect(observe(first, model())).toBe(first)
})

test('isSpinning looks at the running rows only', async () => {
  expect(isSpinning(model())).toBe(false)
  expect(isSpinning(model({ now: [row(1, 'pending')] }))).toBe(false)
  expect(isSpinning(model({ outside: [{ key: 'session:1', kind: 'running', text: 'Revisar' }] }))).toBe(true)
})

test('a running plan in the project list keeps the spinner turning', async () => {
  const section = (activity?: 'running' | 'gate'): PanelModel['sections'][number] => ({
    id: 'incomplete',
    icon: '◐',
    header: '1',
    tone: 'suggestion',
    collapsible: false,
    expanded: true,
    items: [{ key: 'plan:a', label: 'a.md', ...(activity ? { activity } : {}) }],
  })
  expect(isSpinning(model({ sections: [section('gate')] }))).toBe(false)
  expect(isSpinning(model({ sections: [section('running')] }))).toBe(true)
})

test('step is idle when nothing moves', async () => {
  expect(step(observe(undefined, model()))).toBeUndefined()
})

test('the spinner turns only while a row runs', async () => {
  const running = observe(undefined, model({ now: [{ ...row(1, 'running'), note: 'x' }] }))
  expect(step(running)?.frame).toBe(1)
  expect(run(running, SPINNER.length).frame).toBe(0)
  const outside = observe(undefined, model({ outside: [{ key: 'session:1', kind: 'running', text: 'Revisar' }] }))
  expect(step(outside)?.frame).toBe(1)
})

test('the bar eases to the new progress and then stops', async () => {
  const start = observe(undefined, model())
  const moved = observe(start, model({ header: { plan: { name: 'auth.md', shortName: 'auth', done: 3, total: 4 } } }))
  expect(moved.shownDone).toBe(1)
  const halfway = step(moved)!
  expect(halfway.shownDone).toBe(2)
  const settled = run(moved, 7)
  expect(settled.shownDone).toBe(3)
  expect(step(settled)).toBeUndefined()
})

test('a completed row flashes for 19 ticks', async () => {
  const start = observe(undefined, model({ now: [{ ...row(1, 'running'), note: 'aguarda você' }] }))
  const done = model({
    header: { plan: { name: 'auth.md', shortName: 'auth', done: 2, total: 4 } },
    done: { label: '2', expanded: false, keys: ['task:0', 'task:1'], rows: [] },
  })
  const flashed = observe(start, done)
  expect(flashed.flashes).toEqual([{ row: row(1, 'done'), ticksLeft: 19 }])
  expect(run(flashed, 18).flashes).toHaveLength(1)
  expect(run(flashed, 19).flashes).toEqual([])
  let ticks = 0
  for (let current = flashed; current.flashes.length > 0; ticks++) current = step(current)!
  expect(ticks * TICK_MS).toBeGreaterThanOrEqual(1400)
  expect(ticks * TICK_MS).toBeLessThanOrEqual(1600)
})

test('a new active plan pulses the border and snaps the bar', async () => {
  const start = observe(undefined, model())
  const other = observe(
    start,
    model({ header: { plan: { name: 'billing.md', shortName: 'billing', done: 3, total: 5 } } }),
  )
  expect(other.pulseTicks).toBe(8)
  expect(other.shownDone).toBe(3)
  expect(run(other, 8).pulseTicks).toBe(0)
  expect(step(run(other, 8))).toBeUndefined()
})

test('barCells and percent survive degenerate sizes', async () => {
  expect(barCells(2, 4, 10)).toEqual({ filled: 5, empty: 5 })
  expect(barCells(1, 0, 10)).toEqual({ filled: 0, empty: 10 })
  expect(barCells(9, 4, 10)).toEqual({ filled: 10, empty: 0 })
  expect(barCells(5, 10, -3)).toEqual({ filled: 0, empty: 0 })
  expect(percent(0, 0)).toBe(0)
  expect(percent(5, 9)).toBe(56)
})

test('a flashing row stays out of the done list until its flash ends', async () => {
  const start = observe(undefined, model({ now: [row(1, 'running')] }))
  const finished = model({
    done: { label: '1', expanded: true, keys: ['task:1'], rows: [row(1, 'done')] },
  })
  const flashing = observe(start, finished)
  expect(withoutFlashing(flashing, finished.done?.rows ?? [])).toEqual([])
  expect(withoutFlashing(run(flashing, 19), finished.done?.rows ?? [])).toEqual([row(1, 'done')])
})
