import { appendFileSync } from 'node:fs'

import { decideRelease, type ReleaseDecision } from './release-version'

const manifest = (await Bun.file('.claude-plugin/plugin.json').json()) as { name: string; version: string }
const listing = Bun.spawnSync(['git', 'tag', '--list', `${manifest.name}--v*`])
if (listing.exitCode !== 0) {
  console.error(`git tag failed: ${listing.stderr.toString()}`)
  process.exit(1)
}
const tags = listing.stdout.toString().split('\n').filter(Boolean)
const decision = decideRelease(manifest.name, manifest.version, tags)

const describe = (outcome: ReleaseDecision): string => {
  switch (outcome.kind) {
    case 'release':
      return `Version ${outcome.version} is new: merging to main publishes ${outcome.tag}.`
    case 'unchanged':
      return `Version ${outcome.version} is already released: no release on merge.`
    case 'regression':
      return `Version ${outcome.version} is below the latest release ${outcome.latest}: bump plugin.json.`
  }
}

const message = describe(decision)
console.log(message)

// GitHub Actions reads step outputs and the job summary from these files; locally they are unset.
const outputFile = process.env.GITHUB_OUTPUT
if (outputFile) {
  const tag = decision.kind === 'release' ? decision.tag : ''
  appendFileSync(outputFile, `kind=${decision.kind}\nversion=${decision.version}\ntag=${tag}\n`)
}
const summaryFile = process.env.GITHUB_STEP_SUMMARY
if (summaryFile) appendFileSync(summaryFile, `${message}\n`)

if (decision.kind === 'regression') process.exit(1)
