// Host-side client for an embedded GenUI Studio, published as
// `@swis/genui-studio/embed`. Dependency-free; runs in the host page.

import {
  envelope,
  isEnvelope,
  type EmbedConfig,
  type EmbedError,
  type EmbedWidget,
  type HostMessage,
  type StudioMessage,
} from './protocol.js'

export * from './protocol.js'

export interface StudioEmbedOptions {
  /** The iframe that loads the studio with `?embed=1`. */
  iframe: HTMLIFrameElement
  /** The studio's origin. Defaults to the origin of `iframe.src`. */
  origin?: string
  config: EmbedConfig
  widgets: EmbedWidget[]
  /** Called on every widget add, remove, or content change in the studio. */
  onChange?: (widgets: EmbedWidget[]) => void
  onError?: (error: EmbedError) => void
  /** Called every time the studio (re)initializes. */
  onReady?: () => void
}

export interface StudioEmbed {
  /** Resolves once the studio has received its first `init`. */
  ready: Promise<void>
  /** The studio's current widgets. */
  getWidgets(): Promise<EmbedWidget[]>
  /** Replace the studio's widgets; matched by `studioId`, then `externalId`, to keep positions. */
  setWidgets(widgets: EmbedWidget[]): void
  updateConfig(config: EmbedConfig): void
  destroy(): void
}

const REQUEST_TIMEOUT_MS = 10_000

export function createStudioEmbed(options: StudioEmbedOptions): StudioEmbed {
  const { iframe } = options
  const origin = options.origin ?? new URL(iframe.src, location.href).origin
  let config = options.config
  let widgets = options.widgets
  let requestCounter = 0
  const pending = new Map<string, { resolve: (w: EmbedWidget[]) => void; reject: (e: Error) => void; timer: number }>()

  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => { resolveReady = resolve })

  function post(message: HostMessage) {
    iframe.contentWindow?.postMessage(envelope(message), origin)
  }

  function onMessage(event: MessageEvent) {
    if (event.origin !== origin || event.source !== iframe.contentWindow) return
    if (!isEnvelope(event.data)) return
    const message = event.data as unknown as StudioMessage

    switch (message.type) {
      case 'ready':
        // Also fires after a reload of the iframe; re-send the latest known state.
        post({ type: 'init', payload: { config, widgets } })
        resolveReady()
        options.onReady?.()
        break
      case 'change':
        widgets = message.payload.widgets
        options.onChange?.(widgets)
        break
      case 'response': {
        const request = pending.get(message.id)
        if (!request) return
        pending.delete(message.id)
        clearTimeout(request.timer)
        widgets = message.payload.widgets
        request.resolve(widgets)
        break
      }
      case 'error':
        options.onError?.(message.payload)
        break
    }
  }

  function onLoad() {
    post({ type: 'hello' })
  }

  window.addEventListener('message', onMessage)
  iframe.addEventListener('load', onLoad)
  // The iframe may already have loaded before this client was created.
  post({ type: 'hello' })

  return {
    ready,
    getWidgets() {
      const id = `req_${++requestCounter}`
      return new Promise<EmbedWidget[]>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          pending.delete(id)
          reject(new Error('GenUI Studio did not respond to getWidgets'))
        }, REQUEST_TIMEOUT_MS)
        pending.set(id, { resolve, reject, timer })
        post({ type: 'getWidgets', id })
      })
    },
    setWidgets(next) {
      widgets = next
      post({ type: 'setWidgets', payload: { widgets: next } })
    },
    updateConfig(next) {
      config = { ...config, ...next }
      post({ type: 'updateConfig', payload: { config: next } })
    },
    destroy() {
      window.removeEventListener('message', onMessage)
      iframe.removeEventListener('load', onLoad)
      for (const request of pending.values()) {
        clearTimeout(request.timer)
        request.reject(new Error('GenUI Studio embed destroyed'))
      }
      pending.clear()
    },
  }
}
