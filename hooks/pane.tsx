import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import type { Live, PlanTask, Project } from '../types'
import { type Derived, derive, groupTasks, type PlanView } from './link'
import {
  detailLines,
  isEmpty,
  orderedPlanTasks,
  type ProjectSection,
  phaseLine,
  planLine,
  projectSections,
  type SectionId,
  type SectionItem,
  sessionLine,
  taskLine,
} from './summary'

export type PaneElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export type PaneInput = {
  elements: PaneElements
  project: Project
  live: Live
  expanded: readonly string[]
  selected: string
  onToggle: (key: string) => () => void
  onSelect: (path: string) => () => void
}

// Pure pane drawing. The atoms and `$` stay in register.tsx: the engine only
// accepts `read`/`update` with an atom declared in the calling file.

// A plan can be in two lists (incomplete and without spec): the key carries the list.
const ITEM_KEY_PREFIX: Record<SectionId, string> = {
  specsWithoutPlan: 'spec',
  incomplete: 'plan',
  withoutSpec: 'nospec',
  complete: 'plan',
}

const taskColor = (task: PlanTask) => (task.status === 'in_progress' ? 'claude' : undefined)

const arrow = (isOpen: boolean) => (isOpen ? '▾' : '▸')

const activePlanView = ({ elements, expanded, onToggle }: PaneInput, active: PlanView): RenderElement => {
  const { Box, Text, Button } = elements
  const groups = groupTasks(active.tasks)
  const showDone = expanded.includes('done')
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>PLANO ATUAL</Text>
      {[...groups.running, ...groups.pending, ...groups.blocked].map(task => (
        <Text color={taskColor(task)}>{taskLine(task, active.tasks)}</Text>
      ))}
      {groups.done.length > 0 && (
        <Button
          key="done"
          label={`${arrow(showDone)} ✓ ${groups.done.length} concluída(s)`}
          onPress={onToggle('done')}
          plain
        />
      )}
      {showDone && groups.done.map(task => <Text dimColor>{taskLine(task, active.tasks)}</Text>)}
    </Box>
  )
}

const outsideView = ({ elements }: PaneInput, derived: Derived): RenderElement => {
  const { Box, Text } = elements
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>FORA DO PLANO (sessão)</Text>
      {derived.outside.map(task => (
        <Text>{sessionLine(task)}</Text>
      ))}
    </Box>
  )
}

const sectionItemView = ({ elements, onSelect }: PaneInput, section: ProjectSection, item: SectionItem) => {
  const { Text, Button } = elements
  if (item.planPath === undefined) return <Text>{item.label}</Text>
  return (
    <Button
      key={`${ITEM_KEY_PREFIX[section.id]}:${item.planPath}`}
      label={item.label}
      onPress={onSelect(item.planPath)}
      plain
      dimColor={section.collapsible}
    />
  )
}

const sectionView = (input: PaneInput, section: ProjectSection): RenderElement[] => {
  const { Text, Button } = input.elements
  const isOpen = !section.collapsible || input.expanded.includes(section.id)
  const header = section.collapsible ? (
    <Button key={section.id} label={`${arrow(isOpen)} ${section.header}`} onPress={input.onToggle(section.id)} plain />
  ) : (
    <Text color={section.color}>{section.header}</Text>
  )
  const items = isOpen ? section.items.map(item => sectionItemView(input, section, item)) : []
  return [header, ...items]
}

const projectView = (input: PaneInput, derived: Derived): RenderElement => {
  const { Box, Text } = input.elements
  const sections = projectSections(derived)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>PROJETO</Text>
      {sections.length === 0 && <Text dimColor>Nenhuma spec ou plano ainda.</Text>}
      {sections.flatMap(section => sectionView(input, section))}
    </Box>
  )
}

const detailView = ({ elements, onSelect }: PaneInput, detail: PlanView): RenderElement => {
  const { Box, Text, Button } = elements
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>DETALHE</Text>
      {detailLines(detail)
        .slice(0, 2)
        .map(line => (
          <Text>{line}</Text>
        ))}
      {orderedPlanTasks(detail).map(task => (
        <Text color={taskColor(task)}>{taskLine(task, detail.tasks)}</Text>
      ))}
      <Button key="detail-close" label="✕ fechar" onPress={onSelect(detail.path)} plain />
    </Box>
  )
}

const selectedPlan = (derived: Derived, selected: string): PlanView | undefined =>
  selected === '' ? undefined : [...derived.incomplete, ...derived.complete].find(plan => plan.path === selected)

export const paneView = (input: PaneInput): RenderElement => {
  const { Box, Text } = input.elements
  const { project, live } = input
  if (isEmpty(project, live)) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Nenhum dado superpowers neste projeto.</Text>
      </Box>
    )
  }

  const derived = derive(project, live)
  const active = derived.active
  const detail = selectedPlan(derived, input.selected)

  return (
    <Box flexDirection="column">
      <Text bold>{phaseLine(live)}</Text>
      {active && <Text>{planLine(active)}</Text>}
      {live.syncNote && <Text color="warning">{live.syncNote}</Text>}
      {active && activePlanView(input, active)}
      {derived.outside.length > 0 && outsideView(input, derived)}
      {projectView(input, derived)}
      {detail && detailView(input, detail)}
    </Box>
  )
}
