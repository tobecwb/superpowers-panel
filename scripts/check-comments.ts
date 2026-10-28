import { Glob } from 'bun'

import { findPortugueseComments } from './comment-language'

const PATTERN = '{hooks,types,tests,scripts}/**/*.{ts,tsx}'

const findings: string[] = []
for await (const path of new Glob(PATTERN).scan('.')) {
  const source = await Bun.file(path).text()
  for (const finding of findPortugueseComments(source, path)) findings.push(`${path}:${finding.line}: ${finding.text}`)
}

if (findings.length > 0) {
  console.error(`Comments must be written in English (see CLAUDE.md):\n${findings.sort().join('\n')}`)
  process.exit(1)
}
