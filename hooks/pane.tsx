import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import type { Live, Project } from '../types'
import { derive, groupTasks, type PlanView } from './link'
import {
  baseName, completeItem, detailLines, incompleteItem, isEmpty, orderedPlanTasks, phaseLine, planLine, sessionLine,
  taskLine, withoutSpecItem,
} from './summary'

export type PaneElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

// Desenho puro do pane. Os atoms e o `$` ficam em register.tsx: o engine só
// aceita `read`/`update` com um atom declarado no próprio arquivo da chamada.
export const paneView = (
  { Box, Text, Button }: PaneElements,
  project: Project,
  live: Live,
  expanded: readonly string[],
  toggle: (key: string) => () => void,
  selected: string,
  select: (path: string) => () => void,
): RenderElement => {
  if (isEmpty(project, live)) {
    return (
      <Box flexDirection="column">
        <Text dimColor>Nenhum dado superpowers neste projeto.</Text>
      </Box>
    )
  }

  const derived = derive(project, live)
  const active = derived.active
  const groups = active ? groupTasks(active.tasks) : undefined
  const showDone = expanded.includes('done')
  const showComplete = expanded.includes('complete')
  // Um plano pode estar em duas listas (incompleto e sem spec): a chave leva a lista.
  const planButton = (list: string, plan: PlanView, label: string, dim = false) => (
    <Button key={`${list}:${plan.path}`} label={label} onPress={select(plan.path)} plain dimColor={dim} />
  )
  const all = [...derived.incomplete, ...derived.complete]
  const detail = selected === '' ? undefined : all.find(plan => plan.path === selected)
  const hasAlerts = derived.specsWithoutPlan.length + derived.incomplete.length +
    derived.withoutSpec.length + derived.complete.length > 0

  return (
    <Box flexDirection="column">
      <Text bold>{phaseLine(live)}</Text>
      {active && <Text>{planLine(active)}</Text>}
      {live.syncNote && <Text color="warning">{live.syncNote}</Text>}

      {active && groups && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>PLANO ATUAL</Text>
          {[...groups.running, ...groups.pending, ...groups.blocked].map(task => (
            <Text color={task.status === 'in_progress' ? 'claude' : undefined}>{taskLine(task, active.tasks)}</Text>
          ))}
          {groups.done.length > 0 && (
            <Button key="done" label={`${showDone ? '▾' : '▸'} ✓ ${groups.done.length} concluída(s)`} onPress={toggle('done')} plain />
          )}
          {showDone && groups.done.map(task => <Text dimColor>{taskLine(task, active.tasks)}</Text>)}
        </Box>
      )}

      {derived.outside.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>FORA DO PLANO (sessão)</Text>
          {derived.outside.map(task => <Text>{sessionLine(task)}</Text>)}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold>PROJETO</Text>
        {!hasAlerts && <Text dimColor>Nenhuma spec ou plano ainda.</Text>}
        {derived.specsWithoutPlan.length > 0 && (
          <Text color="warning">{`⚠ ${derived.specsWithoutPlan.length} spec(s) sem plano`}</Text>
        )}
        {derived.specsWithoutPlan.map(spec => <Text>{`  · ${baseName(spec.path)}`}</Text>)}
        {derived.incomplete.length > 0 && (
          <Text color="suggestion">{`◐ ${derived.incomplete.length} plano(s) incompleto(s)`}</Text>
        )}
        {derived.incomplete.map(plan => planButton('plan', plan, incompleteItem(plan)))}
        {derived.withoutSpec.length > 0 && (
          <Text color="warning">{`⚠ ${derived.withoutSpec.length} plano(s) sem spec`}</Text>
        )}
        {derived.withoutSpec.map(plan => planButton('nospec', plan, withoutSpecItem(plan)))}
        {derived.complete.length > 0 && (
          <Button key="complete" label={`${showComplete ? '▾' : '▸'} ✓ ${derived.complete.length} plano(s) concluído(s)`} onPress={toggle('complete')} plain />
        )}
        {showComplete && derived.complete.map(plan => planButton('plan', plan, completeItem(plan), true))}
      </Box>

      {detail && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>DETALHE</Text>
          {detailLines(detail).slice(0, 2).map(line => <Text>{line}</Text>)}
          {orderedPlanTasks(detail).map(task => (
            <Text color={task.status === 'in_progress' ? 'claude' : undefined}>{taskLine(task, detail.tasks)}</Text>
          ))}
          <Button key="detail-close" label="✕ fechar" onPress={select(detail.path)} plain />
        </Box>
      )}
    </Box>
  )
}
