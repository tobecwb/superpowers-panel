import type { ClientElements, ClientModule, Color, JsonValue, RenderElement } from 'claude-code'

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
} from './animation'
import { fitName } from './fit'
import type { PanelAction } from './panel-action'
import {
  type Detail,
  type DoneGroup,
  KIND_ICON,
  type PanelModel,
  type Row,
  type RowKind,
  type Section,
  type SectionItem,
} from './view-model'

type Draw = {
  elements: ClientElements
  motion: Motion
  columns: number
  rows: number
  send: (action: PanelAction) => void
}

// The region reports 0 columns before its first layout.
const FALLBACK_COLUMNS = 40
// Round border plus one cell of padding on each side of the header card.
const CARD_CHROME = 4
// Short and fixed, so the plan names keep the width of a narrow pane.
const ITEM_BAR_CELLS = 8
// Indent, icon and the space after it, in front of a plan name in the project list.
const ITEM_LEAD = 4
const ITEM_GAP = 2

const ROW_COLOR: Record<RowKind, Color | undefined> = {
  running: 'claude',
  gate: 'permission',
  pending: undefined,
  blocked: 'subtle',
  done: 'success',
}

// Longer than any pane is wide: the desktop bar clips it to the share it is given.
const DESKTOP_BAR_GLYPHS = 400

const arrow = (isOpen: boolean): string => (isOpen ? '▾' : '▸')

// A column stretches its children: the desktop then centres a native button's label
// and paints a background across the whole width. A row keeps each at its own size.
const atOwnWidth = ({ elements }: Draw, key: string, child: RenderElement): RenderElement => (
  <elements.Box key={key}>{child}</elements.Box>
)

const spinnerFrame = (motion: Motion): string => SPINNER[motion.frame] ?? KIND_ICON.running

const rowIcon = (row: Row, motion: Motion, flashTicks: number): string => {
  if (flashTicks > 0) return flashTicks % 4 < 2 ? '✓' : '✔'
  return row.kind === 'running' ? spinnerFrame(motion) : KIND_ICON[row.kind]
}

const rowView = ({ elements, motion }: Draw, row: Row, flashTicks = 0): RenderElement => {
  const { Box, Text } = elements
  const isFlash = flashTicks > 0
  return (
    <Box key={row.key} gap={1}>
      <Text color={ROW_COLOR[row.kind]} bold={isFlash}>
        {rowIcon(row, motion, flashTicks)}
      </Text>
      <Text
        bold={isFlash || row.kind === 'running'}
        color={isFlash ? 'success' : undefined}
        dimColor={row.kind === 'done' && !isFlash}
        wrap="truncate-end"
      >
        {row.text}
      </Text>
      {row.note !== undefined && (
        <Text color={ROW_COLOR[row.kind]} dimColor wrap="truncate-end">
          {row.note}
        </Text>
      )}
    </Box>
  )
}

const phaseBadge = (draw: Draw): RenderElement => {
  const { Text } = draw.elements
  const { model } = draw.motion
  const phase = model.header.phase
  if (phase === undefined) return <Text bold>{model.labels.noFlow}</Text>
  const spinner = isSpinning(model) ? `${spinnerFrame(draw.motion)} ` : ''
  return atOwnWidth(
    draw,
    'phase',
    <Text backgroundColor={phase.tone} color="inverseText" bold>
      {` ${spinner}${phase.label} `}
    </Text>,
  )
}

// Widths in percent instead of counted glyphs, so the bar fills the line in any font. The
// desktop starts a flex item at its content's width and shrinks it in proportion: the glyph
// runs start at width 0 and grow, or they would crush the suffix and the done share.
const desktopProgressView = (draw: Draw, plan: { total: number }, suffix: string): RenderElement => {
  const { Box, Text } = draw.elements
  const glyphs = '━'.repeat(DESKTOP_BAR_GLYPHS)
  return (
    <Box gap={1}>
      <Box key="bar-track" width={0} flexGrow={1} height={1} overflow="hidden">
        <Box key="bar-done" width={`${percent(draw.motion.shownDone, plan.total)}%`} flexShrink={0} overflow="hidden">
          <Text color="success">{glyphs}</Text>
        </Box>
        <Box key="bar-left" width={0} flexGrow={1} overflow="hidden">
          <Text color="subtle">{glyphs}</Text>
        </Box>
      </Box>
      <Box key="bar-suffix" flexShrink={0}>
        <Text dimColor>{suffix.trim()}</Text>
      </Box>
    </Box>
  )
}

const progressView = (draw: Draw, plan: { done: number; total: number }): RenderElement => {
  const { Box, Text } = draw.elements
  const suffix = ` ${plan.done}/${plan.total} · ${percent(plan.done, plan.total)}%`
  if (draw.motion.model.surface === 'desktop') return desktopProgressView(draw, plan, suffix)
  const { filled, empty } = barCells(draw.motion.shownDone, plan.total, draw.columns - CARD_CHROME - suffix.length)
  return (
    <Box>
      <Text color="success">{'━'.repeat(filled)}</Text>
      <Text color="subtle">{'━'.repeat(empty)}</Text>
      <Text dimColor>{suffix}</Text>
    </Box>
  )
}

const headerView = (draw: Draw): RenderElement => {
  const { Box, Text } = draw.elements
  const { header } = draw.motion.model
  const borderColor = draw.motion.pulseTicks > 0 ? 'success' : (header.phase?.tone ?? 'subtle')
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
        {phaseBadge(draw)}
        {header.plan && (
          <Text bold wrap="truncate-end">
            {fitName({ full: header.plan.name, short: header.plan.shortName, width: draw.columns - CARD_CHROME })}
          </Text>
        )}
        {header.plan && progressView(draw, header.plan)}
        {header.hint && <Text dimColor>{header.hint}</Text>}
      </Box>
      {header.syncWarning && <Text color="warning">{header.syncWarning}</Text>}
    </Box>
  )
}

const rowsSection = (draw: Draw, title: string, rows: RenderElement[]): RenderElement | false => {
  const { Box, Text } = draw.elements
  return (
    rows.length > 0 && (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>{title}</Text>
        {rows}
      </Box>
    )
  )
}

const nowRows = (draw: Draw): RenderElement[] => [
  ...withoutFlashing(draw.motion, draw.motion.model.now).map(row => rowView(draw, row)),
  ...draw.motion.flashes.map(flash => rowView(draw, flash.row, flash.ticksLeft)),
]

const doneToggle = (draw: Draw, done: DoneGroup, key: string): RenderElement =>
  atOwnWidth(
    draw,
    key,
    <draw.elements.Button
      key={key}
      label={`${arrow(done.expanded)} ${KIND_ICON.done} ${done.label}`}
      onPress={() => draw.send({ action: 'toggle', key })}
      plain
      dimColor
    />,
  )

const doneView = (draw: Draw): RenderElement | false => {
  const { Box } = draw.elements
  const done = draw.motion.model.done
  return (
    done !== undefined && (
      <Box flexDirection="column" marginTop={1}>
        {doneToggle(draw, done, 'done')}
        {withoutFlashing(draw.motion, done.rows).map(row => rowView(draw, row))}
      </Box>
    )
  )
}

const itemLabel = (item: SectionItem): string => `  · ${item.label}${item.note === undefined ? '' : `  ${item.note}`}`

const itemIcon = (motion: Motion, item: SectionItem): string => {
  if (item.activity === 'running') return spinnerFrame(motion)
  return item.activity ? KIND_ICON[item.activity] : '·'
}

const itemBar = (draw: Draw, progress: { done: number; total: number }): RenderElement[] => {
  const { Text } = draw.elements
  const { filled, empty } = barCells(progress.done, progress.total, ITEM_BAR_CELLS)
  return [
    <Text key="filled" color="success">
      {'▰'.repeat(filled)}
    </Text>,
    <Text key="empty" color="subtle">
      {'▱'.repeat(empty)}
    </Text>,
  ]
}

const noteText = (item: SectionItem): string | undefined =>
  item.note === undefined ? undefined : `${item.progress ? ' ' : ''}${item.note}`

const currentText = (item: SectionItem): string | undefined =>
  item.current === undefined ? undefined : ` · ${item.current}`

const itemGap = (item: SectionItem): string => (item.progress || item.note !== undefined ? ' '.repeat(ITEM_GAP) : '')

// Everything on the line but the name keeps its width; the name takes what is left.
const itemNameWidth = (columns: number, item: SectionItem): number => {
  const tail = [itemGap(item), noteText(item), currentText(item)].reduce((sum, part) => sum + (part?.length ?? 0), 0)
  return columns - ITEM_LEAD - (item.progress ? ITEM_BAR_CELLS : 0) - tail
}

const planItemView = (draw: Draw, item: SectionItem, planPath: string): RenderElement => {
  const { Text, Button } = draw.elements
  const color = item.activity ? ROW_COLOR[item.activity] : undefined
  const name = fitName({
    full: item.label,
    short: item.shortLabel ?? item.label,
    width: itemNameWidth(draw.columns, item),
  })
  const note = noteText(item)
  const current = currentText(item)
  return atOwnWidth(
    draw,
    item.key,
    <Button key={item.key} onPress={() => draw.send({ action: 'select', key: planPath })} plain>
      <Text color={color} bold={item.activity !== undefined}>{`  ${itemIcon(draw.motion, item)} `}</Text>
      <Text bold={item.activity !== undefined}>{`${name}${itemGap(item)}`}</Text>
      {item.progress && itemBar(draw, item.progress)}
      {note !== undefined && <Text dimColor>{note}</Text>}
      {current !== undefined && <Text color={color}>{current}</Text>}
    </Button>,
  )
}

const itemView = (draw: Draw, item: SectionItem): RenderElement => {
  const planPath = item.planPath
  if (planPath !== undefined) return planItemView(draw, item, planPath)
  const { Text } = draw.elements
  return (
    <Text key={item.key} dimColor>
      {itemLabel(item)}
    </Text>
  )
}

const sectionView = (draw: Draw, section: Section): RenderElement[] => {
  const { Text, Button } = draw.elements
  const title = `${section.icon} ${section.header}`
  const header = section.collapsible ? (
    atOwnWidth(
      draw,
      section.id,
      <Button key={section.id} onPress={() => draw.send({ action: 'toggle', key: section.id })} plain>
        <Text color={section.tone}>{`${arrow(section.expanded)} ${title}`}</Text>
      </Button>,
    )
  ) : (
    <Text color={section.tone}>{title}</Text>
  )
  return [header, ...(section.expanded ? section.items.map(item => itemView(draw, item)) : [])]
}

const projectView = (draw: Draw): RenderElement => {
  const { Box, Text } = draw.elements
  const { sections, labels } = draw.motion.model
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{labels.project}</Text>
      {sections.length === 0 && <Text dimColor>{labels.emptyProject}</Text>}
      {sections.flatMap(section => sectionView(draw, section))}
    </Box>
  )
}

const CLOSE_MARK = '✕'

// The title shares its line with the progress note and the close mark, one cell apart each.
const detailTitleWidth = (columns: number, detail: Detail): number =>
  columns - CARD_CHROME - 1 - detail.note.length - 1 - CLOSE_MARK.length

// The engine draws no scrollbar on a pane: without this a card running past the window looks cut.
const isTallerThanPane = (draw: Draw): boolean => {
  const bodyRows = draw.motion.model.bodyRows
  return bodyRows !== undefined && draw.rows > bodyRows
}

const detailView = (draw: Draw, detail: Detail): RenderElement => {
  const { Box, Text, Button } = draw.elements
  const { labels } = draw.motion.model
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1} marginTop={1}>
      <Box gap={1}>
        <Text bold wrap="truncate-end">
          {fitName({ full: detail.title, short: detail.shortTitle, width: detailTitleWidth(draw.columns, detail) })}
        </Text>
        <Text dimColor>{detail.note}</Text>
        <Box flexGrow={1} />
        <Button
          key="detail-close"
          label={labels.close}
          onPress={() => draw.send({ action: 'select', key: detail.path })}
          plain
        >
          {CLOSE_MARK}
        </Button>
      </Box>
      <Text dimColor wrap="truncate-end">
        {detail.specLine}
      </Text>
      {isTallerThanPane(draw) && <Text dimColor>{labels.scrollHint}</Text>}
      {detail.rows.map(row => rowView(draw, row))}
      {detail.done && doneToggle(draw, detail.done, 'detail-done')}
      {detail.done?.rows.map(row => rowView(draw, row))}
    </Box>
  )
}

const panelView = (draw: Draw): RenderElement => {
  const { Box, Text } = draw.elements
  const { model } = draw.motion
  if (model.isEmpty) return <Text dimColor>{model.labels.noData}</Text>
  return (
    <Box flexDirection="column">
      {headerView(draw)}
      {model.detail && detailView(draw, model.detail)}
      {rowsSection(draw, model.labels.now, nowRows(draw))}
      {rowsSection(
        draw,
        model.labels.next,
        model.next.map(row => rowView(draw, row)),
      )}
      {doneView(draw)}
      {rowsSection(
        draw,
        model.labels.outside,
        model.outside.map(row => rowView(draw, row)),
      )}
      {projectView(draw)}
    </Box>
  )
}

// Props arrive as JsonValue, which cannot spell PanelModel's optional fields; register.tsx builds them.
export const Panel: ClientModule<JsonValue, Motion> = (props, surface) => {
  if (surface.state === undefined) {
    surface.every(TICK_MS, () => {
      const next = surface.state && step(surface.state)
      if (next) surface.setState(next)
    })
  }
  const motion = observe(surface.state, props as unknown as PanelModel)
  if (motion !== surface.state) surface.setState(motion)
  return panelView({
    elements: surface.elements,
    motion,
    columns: surface.columns || FALLBACK_COLUMNS,
    rows: surface.rows,
    send: action => surface.post(action),
  })
}
