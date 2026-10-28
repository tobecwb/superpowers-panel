import { expect, test } from 'claude-code/testing'
import { parsePanelAction, toggleKey } from '../hooks/panel-action'

test('parsePanelAction keeps only known actions with a string key', async () => {
  expect(parsePanelAction({ action: 'toggle', key: 'done' })).toEqual({ action: 'toggle', key: 'done' })
  expect(parsePanelAction({ action: 'select', key: 'docs/a.md' })).toEqual({ action: 'select', key: 'docs/a.md' })
  expect(parsePanelAction({ action: 'bogus', key: 'done' })).toBeUndefined()
  expect(parsePanelAction({ action: 'toggle', key: 3 })).toBeUndefined()
  expect(parsePanelAction('toggle')).toBeUndefined()
  expect(parsePanelAction(null)).toBeUndefined()
})

test('toggleKey adds and removes', async () => {
  expect(toggleKey([], 'done')).toEqual(['done'])
  expect(toggleKey(['done', 'complete'], 'done')).toEqual(['complete'])
})
