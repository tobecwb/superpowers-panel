import type { Project } from '../types'

// Os atoms em si (`atom(...)`) ficam em register.tsx: o engine só aceita
// `read`/`update` com uma referência declarada no próprio arquivo da chamada.
export const PANE = 'superpowers'
export const TITLE = 'Superpowers'

export const EMPTY_PROJECT: Project = { specs: [], plans: [], scannedAt: 0, hasSuperpowersDir: false }
