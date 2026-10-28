import { expect, test } from 'bun:test'

import { findPortugueseComments, isPortuguese } from './comment-language'

const linesOf = (source: string, fileName: string) =>
  findPortugueseComments(source, fileName).map(finding => finding.line)

test('flags line and block comments written in Portuguese', () => {
  const source = [
    '// não bloqueia',
    'const value = 1 /* para o engine */',
    '/**',
    ' * Explains why',
    ' * sem atraso',
    ' */',
    '// English only',
  ].join('\n')
  expect(linesOf(source, 'sample.ts')).toEqual([1, 2, 3])
})

test('ignores Portuguese inside strings, templates, regex and JSX text', () => {
  const source = [
    "const label = 'Não há // nada'",
    'const header = `para $' + '{label} // sem`',
    'const pattern = /não|sem/u',
    'const view = <Text>// não é comentário</Text>',
  ].join('\n')
  expect(findPortugueseComments(source, 'sample.tsx')).toEqual([])
})

test('flags JSX comments', () => {
  expect(linesOf('const view = <Box>{/* sem dados */}</Box>', 'sample.tsx')).toEqual([1])
})

test('matches whole words only', () => {
  expect(isPortuguese('// compare parameters, semantic queue, see example.com')).toBe(false)
  expect(isPortuguese('// Quando the engine restarts')).toBe(true)
})

test('flags uppercase accented letters', () => {
  expect(isPortuguese('// ÚLTIMO')).toBe(true)
})

test('parses generic arrow functions in .ts files', () => {
  expect(linesOf('const identity = <T>(value: T) => value // para', 'sample.ts')).toEqual([1])
})

test('flags unaccented Portuguese words like nunca and falha', () => {
  expect(isPortuguese('// falha aberta: nunca bloqueia o prompt')).toBe(true)
  expect(isPortuguese('// failure handling never blocks')).toBe(false)
})
