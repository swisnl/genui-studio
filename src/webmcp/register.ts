import { isEmbedded, parentOrigin } from '@/embed/mode'
import { studioTools, type StudioTool } from './tools'

// WebMCP is still a draft; only the parts used here are typed.
interface ModelContextTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: StudioTool['annotations']
  execute: (args: Record<string, unknown>) => Promise<string>
}

interface ModelContext {
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal; exposedTo?: string[] }): unknown
  // Older drafts and polyfills unregister by name instead of via an AbortSignal.
  unregisterTool?(name: string): void
}

function ownModelContext(win: Window): ModelContext | null {
  const doc = win.document as Document & { modelContext?: ModelContext }
  const nav = win.navigator as Navigator & { modelContext?: ModelContext }
  return doc.modelContext ?? nav.modelContext ?? null
}

/**
 * Polyfills only live in the document that installed them and cannot expose tools across
 * documents, so a same-origin embed without its own WebMCP registers on the host's instead.
 */
async function hostModelContext(): Promise<ModelContext | null> {
  if (!isEmbedded || window.parent === window) return null
  try {
    const host = window.parent
    // Hosts install their polyfill from module scripts, which run only once the host has parsed;
    // this iframe can get here first.
    if (host.document.readyState === 'loading') {
      await new Promise((resolve) => host.document.addEventListener('DOMContentLoaded', resolve, { once: true }))
    }
    return ownModelContext(host)
  } catch {
    // Cross-origin host: its document is off limits.
    return null
  }
}

async function getModelContext(): Promise<{ context: ModelContext; onHost: boolean } | null> {
  const own = ownModelContext(window)
  if (own) return { context: own, onHost: false }
  const host = await hostModelContext()
  return host ? { context: host, onHost: true } : null
}

/**
 * Registers the studio's widget tools with WebMCP so agents can build widgets on the board.
 * Embedded, the tools are exposed to the host page (`parentOrigin`), which must grant the
 * iframe `allow="tools"` and read them with `getTools({ fromOrigins: [studioOrigin] })`.
 * A same-origin host with a polyfill gets them on its own `modelContext` instead.
 * Returns a cleanup function; a no-op when the browser has no WebMCP.
 */
export async function registerStudioTools(): Promise<() => void> {
  const found = await getModelContext()
  if (!found) return () => {}
  const { context: modelContext, onHost } = found

  const controller = new AbortController()
  // exposedTo only accepts other secure origins; standalone, or registered on the host, the tools need none.
  const exposedTo = !onHost && isEmbedded && parentOrigin !== window.location.origin ? [parentOrigin] : undefined
  const registered: string[] = []

  for (const tool of studioTools) {
    try {
      await modelContext.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: tool.execute,
        },
        { signal: controller.signal, ...(exposedTo ? { exposedTo } : {}) },
      )
      registered.push(tool.name)
    } catch (err) {
      // Typically a cross-origin iframe without the `tools` permissions policy.
      console.warn(`[genui-studio] Could not register WebMCP tool "${tool.name}":`, err)
      break
    }
  }

  const cleanup = () => {
    controller.abort()
    for (const name of registered) modelContext.unregisterTool?.(name)
  }
  // The host outlives this iframe; leaving the tools behind would block the next registration.
  if (onHost) window.addEventListener('pagehide', cleanup, { once: true })
  return cleanup
}
