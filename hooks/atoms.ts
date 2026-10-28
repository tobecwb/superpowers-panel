import type { Project } from '../types'

// The atoms themselves (`atom(...)`) live in register.tsx: the engine only accepts
// `read`/`update` with a reference declared in the calling file.
export const PANE = 'superpowers'

export const EMPTY_PROJECT: Project = { specs: [], plans: [], scannedAt: 0, hasSuperpowersDir: false }
