import { expect, test } from 'claude-code/testing'
import { detectLocale, messagesFor, parseLocaleChoice } from '../hooks/i18n'

const SAMPLE_ARGS = [2, 'T1'] as const

const collectStrings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return collectStrings((value as (...args: unknown[]) => unknown)(...SAMPLE_ARGS))
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(collectStrings)
  return []
}

const keyPaths = (value: unknown, prefix = ''): string[] =>
  typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([key, child]) => [`${prefix}${key}`, ...keyPaths(child, `${prefix}${key}.`)])
    : []

test('detectLocale prefers the forced choice', async () => {
  expect(detectLocale('en', 'Português', 'pt_BR.UTF-8')).toBe('en')
  expect(detectLocale('pt-BR', 'English', 'en_US.UTF-8')).toBe('pt-BR')
})

test('detectLocale reads the language setting in its many spellings', async () => {
  expect(detectLocale('auto', 'Portugues (PT-BR)', undefined)).toBe('pt-BR')
  expect(detectLocale('auto', 'Português', undefined)).toBe('pt-BR')
  expect(detectLocale('auto', 'pt_BR', undefined)).toBe('pt-BR')
  expect(detectLocale('auto', 'brazilian (pt)', undefined)).toBe('pt-BR')
  expect(detectLocale('auto', 'English', 'pt_BR.UTF-8')).toBe('en')
  expect(detectLocale('auto', 'Optimistic', undefined)).toBe('en')
})

test('detectLocale falls back to LANG and then to English', async () => {
  expect(detectLocale('auto', '', 'pt_BR.UTF-8')).toBe('pt-BR')
  expect(detectLocale('auto', '   ', 'pt_PT')).toBe('pt-BR')
  expect(detectLocale('auto', undefined, 'C.UTF-8')).toBe('en')
  expect(detectLocale('auto', 42, undefined)).toBe('en')
  expect(detectLocale('auto', undefined, undefined)).toBe('en')
})

test('parseLocaleChoice accepts the documented spellings', async () => {
  expect(parseLocaleChoice('pt-BR')).toBe('pt-BR')
  expect(parseLocaleChoice('pt')).toBe('pt-BR')
  expect(parseLocaleChoice(' PT_br ')).toBe('pt-BR')
  expect(parseLocaleChoice('EN')).toBe('en')
  expect(parseLocaleChoice('auto')).toBe('auto')
  expect(parseLocaleChoice('fr')).toBeUndefined()
})

test('both catalogs are complete and render no empty text', async () => {
  const portuguese = messagesFor('pt-BR')
  const english = messagesFor('en')
  expect(keyPaths(english)).toEqual(keyPaths(portuguese))
  for (const text of [...collectStrings(portuguese), ...collectStrings(english)]) {
    expect(text.trim().length > 0).toBe(true)
    expect(/undefined|NaN/.test(text)).toBe(false)
  }
})

test('plurals agree with the count', async () => {
  expect(messagesFor('pt-BR').doneCount(1)).toBe('1 concluída')
  expect(messagesFor('pt-BR').doneCount(5)).toBe('5 concluídas')
  expect(messagesFor('en').doneCount(1)).toBe('1 done')
  expect(messagesFor('en').specsWithoutPlan(3)).toBe('3 specs without a plan')
})
