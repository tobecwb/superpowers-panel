import type { PanelModel, Row } from './view-model'

export const TICK_MS = 80

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const

// In ticks of TICK_MS: about 1.5 s of flash and 0.6 s of border pulse.
const FLASH_TICKS = 19
const PULSE_TICKS = 8
const SNAP_DISTANCE = 0.05

type Flash = { row: Row; ticksLeft: number }

export type Motion = {
  model: PanelModel
  // The engine may hand an equal model as a new object: comparing the JSON keeps
  // `observe` from turning every redraw into a state change (a render loop).
  signature: string
  frame: number
  shownDone: number
  flashes: Flash[]
  pulseTicks: number
}

export const isSpinning = (model: PanelModel): boolean =>
  [...model.now, ...model.outside].some(row => row.kind === 'running') ||
  model.sections.some(section => section.items.some(item => item.activity === 'running'))

const planName = (model: PanelModel): string | undefined => model.header.plan?.name

const doneOf = (model: PanelModel): number => model.header.plan?.done ?? 0

const completedFlashes = (previous: PanelModel, model: PanelModel): Flash[] => {
  const doneKeys = new Set(model.done?.keys ?? [])
  return [...previous.now, ...previous.next]
    .filter(row => doneKeys.has(row.key))
    .map(row => ({ row: { key: row.key, kind: 'done', text: row.text }, ticksLeft: FLASH_TICKS }))
}

export const observe = (previous: Motion | undefined, model: PanelModel): Motion => {
  const signature = JSON.stringify(model)
  if (previous === undefined) {
    return { model, signature, frame: 0, shownDone: doneOf(model), flashes: [], pulseTicks: 0 }
  }
  if (previous.signature === signature) return previous
  if (planName(previous.model) !== planName(model)) {
    const pulseTicks = planName(model) === undefined ? 0 : PULSE_TICKS
    return { ...previous, model, signature, shownDone: doneOf(model), flashes: [], pulseTicks }
  }
  return { ...previous, model, signature, flashes: [...previous.flashes, ...completedFlashes(previous.model, model)] }
}

const ease = (shown: number, target: number): number => {
  const gap = target - shown
  return Math.abs(gap) < SNAP_DISTANCE ? target : shown + gap / 2
}

export const step = (motion: Motion): Motion | undefined => {
  const target = doneOf(motion.model)
  const spinning = isSpinning(motion.model)
  const isIdle = !spinning && motion.shownDone === target && motion.flashes.length === 0 && motion.pulseTicks === 0
  if (isIdle) return undefined
  return {
    ...motion,
    frame: spinning ? (motion.frame + 1) % SPINNER.length : motion.frame,
    shownDone: ease(motion.shownDone, target),
    flashes: motion.flashes
      .map(flash => ({ ...flash, ticksLeft: flash.ticksLeft - 1 }))
      .filter(flash => flash.ticksLeft > 0),
    pulseTicks: Math.max(0, motion.pulseTicks - 1),
  }
}

export const barCells = (shownDone: number, total: number, cells: number): { filled: number; empty: number } => {
  const width = Math.max(0, Math.floor(cells))
  const ratio = total === 0 ? 0 : Math.min(1, Math.max(0, shownDone / total))
  const filled = Math.round(ratio * width)
  return { filled, empty: width - filled }
}

export const percent = (done: number, total: number): number => (total === 0 ? 0 : Math.round((done / total) * 100))

// A just-finished task lives in `flashes` for a moment: drawing it also from the done
// list would repeat the sibling key.
export const withoutFlashing = (motion: Motion, rows: readonly Row[]): Row[] => {
  const flashing = new Set(motion.flashes.map(flash => flash.row.key))
  return rows.filter(row => !flashing.has(row.key))
}
