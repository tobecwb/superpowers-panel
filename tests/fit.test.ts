import { expect, test } from 'claude-code/testing'
import { fitName } from '../hooks/fit'

const NAMES = { full: '2026-10-15-fase-0-fundacao-e-envio.md', short: 'fase-0-fundacao-e-envio' }

test('fitName keeps the full name while it fits', async () => {
  expect(fitName({ ...NAMES, width: 80 })).toBe('2026-10-15-fase-0-fundacao-e-envio.md')
  expect(fitName({ ...NAMES, width: 37 })).toBe('2026-10-15-fase-0-fundacao-e-envio.md')
})

test('fitName drops the date and extension before truncating', async () => {
  expect(fitName({ ...NAMES, width: 36 })).toBe('fase-0-fundacao-e-envio')
  expect(fitName({ ...NAMES, width: 23 })).toBe('fase-0-fundacao-e-envio')
})

test('fitName truncates the short name with an ellipsis as the last resort', async () => {
  expect(fitName({ ...NAMES, width: 22 })).toBe('fase-0-fundacao-e-env…')
  expect(fitName({ ...NAMES, width: 1 })).toBe('…')
  expect(fitName({ ...NAMES, width: 0 })).toBe('')
  expect(fitName({ ...NAMES, width: -5 })).toBe('')
})
