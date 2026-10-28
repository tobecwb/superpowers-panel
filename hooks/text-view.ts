import { KIND_ICON, type PanelModel, type Row, type Section, type SectionItem } from './view-model'

const CELLS = 10

export const bar = (done: number, total: number): string => {
  const full = total === 0 ? 0 : Math.round((done / total) * CELLS)
  return '█'.repeat(full) + '░'.repeat(CELLS - full)
}

const withNote = (text: string, note: string | undefined): string => (note === undefined ? text : `${text}  ${note}`)

const rowText = (row: Row): string => withNote(`${KIND_ICON[row.kind]} ${row.text}`, row.note)

const block = (title: string, rows: readonly Row[]): string[] =>
  rows.length === 0 ? [] : ['', title, ...rows.map(rowText)]

const itemText = (item: SectionItem): string => withNote(`  · ${item.label}`, item.note)

const sectionText = (section: Section): string[] => [
  `${section.icon} ${section.header}`,
  ...section.items.map(itemText),
]

const headerText = ({ header, labels }: PanelModel): string[] => {
  const lines = [`${labels.phase}: ${header.phase?.label ?? '—'}`]
  const plan = header.plan
  if (plan) lines.push(`${labels.plan}: ${plan.name}  ${bar(plan.done, plan.total)} ${plan.done}/${plan.total}`)
  if (header.syncWarning) lines.push(header.syncWarning)
  return lines
}

// Plain text of the same model the panel draws, for `/sp status` and surfaces without a rich client.
export const textView = (model: PanelModel): string => {
  if (model.isEmpty) return model.labels.noData
  const projectLines = model.sections.length === 0 ? [model.labels.emptyProject] : model.sections.flatMap(sectionText)
  return [
    ...headerText(model),
    ...block(model.labels.now, model.now),
    ...block(model.labels.next, model.next),
    ...(model.done ? ['', `${KIND_ICON.done} ${model.done.label}`] : []),
    ...block(model.labels.outside, model.outside),
    '',
    model.labels.project,
    ...projectLines,
  ].join('\n')
}
