// Shared contract between an embedded studio (iframe) and its host page.
// This file must stay free of runtime dependencies: it is part of the
// `@swis/genui-studio/embed` host client bundle.

export const MESSAGE_SOURCE = 'genui-studio'
export const PROTOCOL_VERSION = 1

/** The `.widget` file format, as downloaded from the studio and imported by hosts. */
export interface WidgetFile {
  version: string
  name: string
  /** URL-safe base64 of `{ id, name, view, defaultState, states }` */
  encodedWidget: string
  /** Nunjucks/Jinja template that renders to widget JSON */
  template: string
  /** Widget JSON resolved with the preview data */
  outputJsonPreview: unknown
  jsonSchema: Record<string, unknown>
}

export interface EmbedWidget {
  /** The host's identifier for this widget, if it has one yet. */
  externalId?: string
  /** The studio's identifier; echo it back in `setWidgets` to keep canvas positions. */
  studioId?: string
  definition: WidgetFile
  /** Opaque host data, passed through untouched. */
  meta?: Record<string, unknown>
}

export interface ProviderConfig {
  /** For example a host proxy such as `/app/genui-studio/llm/v1`. */
  baseURL?: string
  /** Optional; a proxy can authenticate with same-origin cookies instead. */
  apiKey?: string
  headers?: Record<string, string>
}

export type ModelFamily = 'anthropic' | 'openai'

export interface ModelOption {
  id: string
  label: string
  /** Which SDK and API shape to use: Anthropic Messages or OpenAI Responses. */
  family: ModelFamily
  /** Heading in the model picker. Defaults to the family name. */
  group?: string
}

export interface ThemeColors {
  primary?: string
  surface?: string
  border?: string
  success?: string
  danger?: string
  warning?: string
  info?: string
  discovery?: string
  caution?: string
}

export type Locale = 'en' | 'nl'

export interface EmbedConfig {
  /** Shown in the top bar instead of the project name. */
  title?: string
  /** UI language. Defaults to the browser language. */
  locale?: Locale
  /**
   * Light or dark mode, controlled by the host: the studio follows it and hides its own toggle.
   * Send updates with `updateConfig`, for example when the host's theme switch changes.
   */
  colorScheme?: 'light' | 'dark'
  /** Show the theme card on the canvas, and its toggle. Defaults to `true`. */
  themeCard?: boolean
  providers?: {
    openai?: ProviderConfig
    anthropic?: ProviderConfig
  }
  /** Replaces the built-in model list. */
  models?: ModelOption[]
  defaultModel?: string
  theme?: {
    /** Initial light or dark mode; the user can still toggle it. See `colorScheme` to control it. */
    activePreset?: 'light' | 'dark'
    lightColors?: ThemeColors
    darkColors?: ThemeColors
  }
}

export type EmbedErrorCode = 'auth' | 'llm' | 'parse'

export interface EmbedError {
  code: EmbedErrorCode
  message: string
  /** HTTP status for `auth` and `llm` errors, when known. */
  status?: number
  /** For `parse` errors: the widget that could not be loaded. */
  externalId?: string
}

/** Messages sent by the host to the studio. */
export type HostMessage =
  | { type: 'hello' }
  | { type: 'init'; payload: { config: EmbedConfig; widgets: EmbedWidget[] } }
  | { type: 'setWidgets'; payload: { widgets: EmbedWidget[] } }
  | { type: 'updateConfig'; payload: { config: EmbedConfig } }
  | { type: 'getWidgets'; id: string }

/** Messages sent by the studio to the host. */
export type StudioMessage =
  | { type: 'ready' }
  | { type: 'change'; payload: { widgets: EmbedWidget[] } }
  | { type: 'response'; id: string; payload: { widgets: EmbedWidget[] } }
  | { type: 'error'; payload: EmbedError }

export type Envelope<M> = M & { source: typeof MESSAGE_SOURCE; v: typeof PROTOCOL_VERSION }

export function envelope<M extends object>(message: M): Envelope<M> {
  return { source: MESSAGE_SOURCE, v: PROTOCOL_VERSION, ...message }
}

export function isEnvelope(data: unknown): data is Envelope<{ type: string }> {
  return !!data
    && typeof data === 'object'
    && (data as { source?: unknown }).source === MESSAGE_SOURCE
    && (data as { v?: unknown }).v === PROTOCOL_VERSION
    && typeof (data as { type?: unknown }).type === 'string'
}
