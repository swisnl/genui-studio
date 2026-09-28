// Studio side of the embed protocol: talks to the host page over postMessage.

import { ref, watch } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { generateId, useCanvasStore } from '@/stores/canvas'
import { useHistoryStore } from '@/stores/history'
import { useProjectStore } from '@/stores/project'
import { useThemeStore } from '@/stores/theme'
import { parseWidgetDefinition } from '@/services/widgetImport'
import { serializeWidgetFile } from '@/services/widgetExport'
import type { CanvasWidget } from '@/types/canvas'
import { isLocale, setLocale } from '@/i18n'
import { parentOrigin } from './mode'
import {
  envelope,
  isEnvelope,
  type EmbedConfig,
  type EmbedError,
  type EmbedWidget,
  type HostMessage,
  type StudioMessage,
} from './protocol'

const CHANGE_THROTTLE_MS = 150
const AUTH_STATUSES = [401, 403, 419]

/** True once the host has sent its first `init`. */
export const embedInitialized = ref(false)

export function startEmbedBridge(hooks: { onWidgetsLoaded: () => void }) {
  const canvas = useCanvasStore()
  const history = useHistoryStore()
  const agent = useAgentStore()
  const theme = useThemeStore()
  const project = useProjectStore()

  let lastSentKey = ''
  let changeTimer: ReturnType<typeof setTimeout> | null = null

  function post(message: StudioMessage) {
    window.parent.postMessage(envelope(message), parentOrigin)
  }

  function reportError(error: EmbedError) {
    post({ type: 'error', payload: error })
  }

  /** Plain (non-reactive) widgets, so they survive structured cloning. */
  function currentWidgets(): { widgets: EmbedWidget[]; key: string } {
    const widgets: EmbedWidget[] = canvas.widgets.map((w) => ({
      externalId: w.externalId,
      studioId: w.id,
      definition: serializeWidgetFile(w),
      meta: w.meta,
    }))
    const key = JSON.stringify(widgets)
    return { widgets: JSON.parse(key), key }
  }

  function flushChange() {
    if (changeTimer) {
      clearTimeout(changeTimer)
      changeTimer = null
    }
    const { widgets, key } = currentWidgets()
    if (key === lastSentKey) return
    lastSentKey = key
    post({ type: 'change', payload: { widgets } })
  }

  function applyConfig(config: EmbedConfig) {
    agent.configure(config)
    if (config.title) project.name = config.title
    if (isLocale(config.locale)) setLocale(config.locale)
    if (config.themeCard !== undefined) theme.themeCardEnabled = config.themeCard
    if (config.theme) {
      if (config.theme.lightColors) theme.lightColors = { ...theme.lightColors, ...config.theme.lightColors }
      if (config.theme.darkColors) theme.darkColors = { ...theme.darkColors, ...config.theme.darkColors }
      if (config.theme.activePreset) theme.applyPreset(config.theme.activePreset)
    }
    if (config.colorScheme === 'light' || config.colorScheme === 'dark') theme.setHostColorScheme(config.colorScheme)
  }

  /**
   * Replace the canvas widgets with the host's list. Widgets are matched by
   * studioId, then externalId, so existing ones keep their canvas position.
   */
  function applyWidgets(items: EmbedWidget[]) {
    const existing = [...canvas.widgets]
    const next: CanvasWidget[] = []
    let added = 0

    for (const item of items) {
      const match = existing.find((w) =>
        (item.studioId && w.id === item.studioId)
        || (item.externalId && w.externalId === item.externalId),
      )
      const definitionChanged = !match
        || JSON.stringify(serializeWidgetFile(match)) !== JSON.stringify(item.definition)
      const parsed = definitionChanged ? parseWidgetDefinition(item.definition) : null

      if (definitionChanged && !parsed) {
        reportError({
          code: 'parse',
          message: `Could not load widget "${item.definition?.name ?? 'unknown'}"`,
          externalId: item.externalId,
        })
        if (match) next.push(match)
        continue
      }

      if (match) {
        if (parsed) {
          match.name = parsed.name
          match.template = parsed.template
          match.templateSource = parsed.templateSource
          match.schema = parsed.schema
          match.previewData = parsed.previewData
        }
        match.externalId = item.externalId ?? match.externalId
        match.meta = item.meta ?? match.meta
        next.push(match)
        continue
      }

      // New widget: cascade from the top-left of the current view.
      const origin = {
        x: -canvas.viewport.x / canvas.viewport.scale + 100,
        y: -canvas.viewport.y / canvas.viewport.scale + 100,
      }
      next.push({
        id: generateId(),
        name: parsed!.name,
        position: { x: origin.x + added * 65, y: origin.y + added * 65 },
        size: { width: 360, height: 240 },
        template: parsed!.template,
        templateSource: parsed!.templateSource,
        schema: parsed!.schema,
        previewData: parsed!.previewData,
        locked: false,
        externalId: item.externalId,
        meta: item.meta,
      })
      added++
    }

    canvas.widgets = next
    // The host already knows this state; don't echo it back as a change.
    lastSentKey = currentWidgets().key
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== window.parent || event.origin !== parentOrigin) return
    if (!isEnvelope(event.data)) return
    const message = event.data as unknown as HostMessage

    switch (message.type) {
      case 'hello':
        if (!embedInitialized.value) post({ type: 'ready' })
        break
      case 'init':
        applyConfig(message.payload.config ?? {})
        if (embedInitialized.value) {
          // A duplicate handshake; merge instead of resetting the canvas.
          history.commit()
          applyWidgets(message.payload.widgets ?? [])
          break
        }
        canvas.widgets = []
        applyWidgets(message.payload.widgets ?? [])
        history.clear()
        embedInitialized.value = true
        hooks.onWidgetsLoaded()
        break
      case 'setWidgets':
        history.commit()
        applyWidgets(message.payload.widgets ?? [])
        break
      case 'updateConfig':
        applyConfig(message.payload.config ?? {})
        break
      case 'getWidgets': {
        flushChange()
        post({ type: 'response', id: message.id, payload: { widgets: currentWidgets().widgets } })
        break
      }
    }
  }

  window.addEventListener('message', onMessage)

  // Only content changes matter to the host; positions and sizes are not tracked.
  watch(
    () => canvas.widgets.map((w) => [w.id, w.name, w.templateSource, w.template, w.schema, w.previewData, w.externalId, w.meta]),
    () => {
      if (!embedInitialized.value || changeTimer) return
      changeTimer = setTimeout(flushChange, CHANGE_THROTTLE_MS)
    },
    { deep: true },
  )

  watch(
    () => agent.error,
    (message) => {
      if (!message) return
      const status = agent.errorStatus ?? undefined
      reportError({ code: status && AUTH_STATUSES.includes(status) ? 'auth' : 'llm', message, status })
    },
  )

  post({ type: 'ready' })
}
