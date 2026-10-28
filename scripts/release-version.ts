export type ReleaseDecision =
  | { kind: 'release'; version: string; tag: string }
  | { kind: 'unchanged'; version: string }
  | { kind: 'regression'; version: string; latest: string }

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/

const partsOf = (version: string): number[] => {
  const match = VERSION.exec(version)
  if (!match) throw new Error(`plugin.json version "${version}" is not MAJOR.MINOR.PATCH`)
  return match.slice(1).map(Number)
}

// `claude plugin tag` names releases {name}--v{version}; the workflow keeps that convention.
export const releaseTag = (name: string, version: string): string => `${name}--v${version}`

export const compareVersions = (left: string, right: string): number => {
  const leftParts = partsOf(left)
  const rightParts = partsOf(right)
  for (let index = 0; index < 3; index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

const releasedVersions = (name: string, tags: readonly string[]): string[] => {
  const prefix = releaseTag(name, '')
  return tags
    .filter(tag => tag.startsWith(prefix))
    .map(tag => tag.slice(prefix.length))
    .filter(version => VERSION.test(version))
}

export const decideRelease = (name: string, version: string, tags: readonly string[]): ReleaseDecision => {
  partsOf(version)
  const latest = releasedVersions(name, tags).sort(compareVersions).at(-1)
  if (latest === undefined || compareVersions(version, latest) > 0) {
    return { kind: 'release', version, tag: releaseTag(name, version) }
  }
  if (compareVersions(version, latest) === 0) return { kind: 'unchanged', version }
  return { kind: 'regression', version, latest }
}
