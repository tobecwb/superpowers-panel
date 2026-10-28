import type { Locale, LocaleChoice } from '../../types'
import { en } from './en'
import { type Messages, ptBR } from './pt-BR'

export type { Messages }

export const messagesFor = (locale: Locale): Messages => (locale === 'en' ? en : ptBR)

// Accents and case are stripped so that any spelling of the setting compares the same way.
const normalize = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const PORTUGUESE_TOKEN = /(^|[^a-z])pt([^a-z]|$)/

const isPortuguese = (text: string): boolean =>
  text.includes('portug') || text.startsWith('pt') || PORTUGUESE_TOKEN.test(text)

// The `language` setting is free text ("Portugues (PT-BR)", "English"): any non-empty value decides.
export const detectLocale = (choice: LocaleChoice, languageSetting: unknown, langEnv: string | undefined): Locale => {
  if (choice !== 'auto') return choice
  const setting = typeof languageSetting === 'string' ? normalize(languageSetting) : ''
  if (setting !== '') return isPortuguese(setting) ? 'pt-BR' : 'en'
  const lang = normalize(langEnv ?? '')
  return lang.startsWith('pt') ? 'pt-BR' : 'en'
}

export const parseLocaleChoice = (raw: string): LocaleChoice | undefined => {
  const text = normalize(raw)
  if (text === 'auto') return 'auto'
  if (text === 'en') return 'en'
  return text === 'pt' || text.replace('_', '-') === 'pt-br' ? 'pt-BR' : undefined
}
