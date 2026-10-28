export type PanelAction = { action: 'toggle' | 'select'; key: string }

// Posts come from the drawing thread as plain data: anything else is dropped.
export const parsePanelAction = (raw: unknown): PanelAction | undefined => {
  if (typeof raw !== 'object' || raw === null) return undefined
  const { action, key } = raw as Record<string, unknown>
  if (action !== 'toggle' && action !== 'select') return undefined
  return typeof key === 'string' ? { action, key } : undefined
}

export const toggleKey = (list: readonly string[], key: string): string[] =>
  list.includes(key) ? list.filter(expandedKey => expandedKey !== key) : [...list, key]
