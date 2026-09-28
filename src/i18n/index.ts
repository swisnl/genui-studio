import { ref } from 'vue'
import { isEmbedded } from '@/embed/mode'
import type { Locale } from '@/embed/protocol'
import en from './en'
import nl from './nl'

export type { Locale }
export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>

const messages: Record<Locale, Messages> = { en, nl }
export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'nl', label: 'Nederlands' },
]

const STORAGE_KEY = 'genui-studio-locale'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in messages
}

function detectLocale(): Locale {
  const fromQuery = new URLSearchParams(window.location.search).get('locale')
  if (isLocale(fromQuery)) return fromQuery
  if (!isEmbedded) {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLocale(stored)) return stored
  }
  return navigator.language.toLowerCase().startsWith('nl') ? 'nl' : 'en'
}

export const locale = ref<Locale>(detectLocale())
document.documentElement.lang = locale.value

export function setLocale(next: Locale) {
  locale.value = next
  document.documentElement.lang = next
  if (!isEmbedded) localStorage.setItem(STORAGE_KEY, next)
}

/** Translate a key, replacing `{param}` placeholders. Reactive: re-renders when the locale changes. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = messages[locale.value][key] ?? en[key]
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}
