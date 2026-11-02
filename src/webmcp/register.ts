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

function getModelContext(): ModelContext | null {
  const doc = document as Document & { modelContext?: ModelContext }
  const nav = navigator as Navigator & { modelContext?: ModelContext }
  return doc.modelContext ?? nav.modelContext ?? null
}

/**
 * Registers the studio's widget tools with WebMCP so agents can build widgets on the board.
 * Embedded, the tools are exposed to the host page (`parentOrigin`), which must grant the
 * iframe `allow="tools"` and read them with `getTools({ fromOrigins: [studioOrigin] })`.
 * Returns a cleanup function; a no-op when the browser has no WebMCP.
 */
export async function registerStudioTools(): Promise<() => void> {
  const modelContext = getModelContext()
  if (!modelContext) return () => {}

  const controller = new AbortController()
  // exposedTo only accepts other secure origins; standalone the tools stay same-origin.
  const exposedTo = isEmbedded && parentOrigin !== window.location.origin ? [parentOrigin] : undefined
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

  return () => {
    controller.abort()
    for (const name of registered) modelContext.unregisterTool?.(name)
  }
}
