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
import type { PanelAction } from './panel-action'
import {
  type Detail,
  KIND_ICON,
  type PanelModel,
  type Row,
  type RowKind,
  type Section,
  type SectionItem,
} from './view-model'

type Draw = { elements: ClientElements; motion: Motion; columns: number; send: (action: PanelAction) => void }

// The region reports 0 columns before its first layout.
const FALLBACK_COLUMNS = 40
// Round border plus one cell of padding on each side of the header card.
const CARD_CHROME = 4

const ROW_COLOR: Record<RowKind, Color | undefined> = {
  running: 'claude',
  gate: 'permission',
  pending: undefined,
  blocked: 'subtle',
  done: 'success',
}

const arrow = (isOpen: boolean): string => (isOpen ? '▾' : '▸')

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

const phaseBadge = ({ elements, motion }: Draw): RenderElement => {
  const { Text } = elements
  const { model } = motion
  const phase = model.header.phase
  if (phase === undefined) return <Text bold>{model.labels.noFlow}</Text>
  const spinner = isSpinning(model) ? `${spinnerFrame(motion)} ` : ''
  return (
    <Text backgroundColor={phase.tone} color="inverseText" bold>
      {` ${spinner}${phase.label} `}
    </Text>
  )
}

const progressView = (draw: Draw, plan: { done: number; total: number }): RenderElement => {
  const { Box, Text } = draw.elements
  const suffix = ` ${plan.done}/${plan.total} · ${percent(plan.done, plan.total)}%`
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
            {header.plan.name}
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

const doneView = (draw: Draw): RenderElement | false => {
  const { Box, Button } = draw.elements
  const done = draw.motion.model.done
  return (
    done !== undefined && (
      <Box flexDirection="column" marginTop={1}>
        <Button
          key="done"
          label={`${arrow(done.expanded)} ${KIND_ICON.done} ${done.label}`}
          onPress={() => draw.send({ action: 'toggle', key: 'done' })}
          plain
          dimColor
        />
        {withoutFlashing(draw.motion, done.rows).map(row => rowView(draw, row))}
      </Box>
    )
  )
}

const itemLabel = (item: SectionItem): string => `  · ${item.label}${item.note === undefined ? '' : `  ${item.note}`}`

const itemView = (draw: Draw, item: SectionItem): RenderElement => {
  const { Text, Button } = draw.elements
  const planPath = item.planPath
  if (planPath === undefined) {
    return (
      <Text key={item.key} dimColor>
        {itemLabel(item)}
      </Text>
    )
  }
  return (
    <Button
      key={item.key}
      label={itemLabel(item)}
      onPress={() => draw.send({ action: 'select', key: planPath })}
      plain
    />
  )
}

const sectionView = (draw: Draw, section: Section): RenderElement[] => {
  const { Text, Button } = draw.elements
  const title = `${section.icon} ${section.header}`
  const header = section.collapsible ? (
    <Button key={section.id} onPress={() => draw.send({ action: 'toggle', key: section.id })} plain>
      <Text color={section.tone}>{`${arrow(section.expanded)} ${title}`}</Text>
    </Button>
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

const detailView = (draw: Draw, detail: Detail): RenderElement => {
  const { Box, Text, Button } = draw.elements
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1} marginTop={1}>
      <Box gap={1}>
        <Text bold wrap="truncate-end">
          {detail.title}
        </Text>
        <Text dimColor>{detail.note}</Text>
      </Box>
      <Text dimColor wrap="truncate-end">
        {detail.specLine}
      </Text>
      {detail.rows.map(row => rowView(draw, row))}
      <Button
        key="detail-close"
        label={draw.motion.model.labels.close}
        onPress={() => draw.send({ action: 'select', key: detail.path })}
        plain
      />
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
      {model.detail && detailView(draw, model.detail)}
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
    send: action => surface.post(action),
  })
}
