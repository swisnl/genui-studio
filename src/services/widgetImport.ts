import type { WidgetTemplate } from '@swis/genui-widgets'
import { resolveTemplate } from '@swis/genui-widgets'
import { compileJsx } from './jsx-compiler'
import { decompileToJsx } from './jsx-decompiler'

export interface WidgetFileData {
  name: string
  template: WidgetTemplate
  templateSource?: string
  schema?: Record<string, unknown>
  previewData?: Record<string, unknown>
}

/**
 * Decode a URL-safe base64 string.
 */
function decodeUrlSafeBase64(encoded: string): string {
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bytes = Uint8Array.from(atob(b64), c => c.codePointAt(0)!)
  return new TextDecoder().decode(bytes)
}

/**
 * Parse a .widget file (JSON format from the widget-builder).
 *
 * Prefers the `encodedWidget` field which contains:
 *   - view: JSX template source
 *   - defaultState: preview data
 *
 * Falls back to `outputJsonPreview` for older files.
 * Uses the top-level `jsonSchema` for the data schema.
 */
export function parseWidgetFile(json: string): WidgetFileData | null {
  try {
    const data = JSON.parse(json)
    const name = data.name ?? 'Imported Widget'

    // Try to extract from encodedWidget (preferred)
    if (data.encodedWidget) {
      try {
        const decoded = JSON.parse(decodeUrlSafeBase64(data.encodedWidget))
        const templateSource = decoded.view as string | undefined
        const previewData = decoded.defaultState as Record<string, unknown> | undefined

        // Use the top-level jsonSchema if available
        const schema = (data.jsonSchema && Object.keys(data.jsonSchema).length > 0)
          ? data.jsonSchema
          : undefined

        if (templateSource) {
          // Compile JSX → nunjucks → resolve with preview data to get the template JSON
          try {
            const nunjucksStr = compileJsx(templateSource)
            const template = resolveTemplate(nunjucksStr, previewData ?? {})
            return { name, template, templateSource, schema, previewData }
          } catch {
            // If compilation fails, fall back to outputJsonPreview
          }
        }
      } catch {
        // If decoding fails, fall through to fallback
      }
    }

    // Fallback: use outputJsonPreview or template
    const template = data.outputJsonPreview ?? data.template
    if (!template || typeof template !== 'object') return null

    const schema = (data.jsonSchema && Object.keys(data.jsonSchema).length > 0)
      ? data.jsonSchema
      : undefined

    let templateSource: string | undefined
    try {
      templateSource = decompileToJsx(template)
    } catch {
      // If decompilation fails, leave templateSource undefined
    }
    return { name, template, templateSource, schema }
  } catch {
    return null
  }
}

/**
 * Open a file picker and return the parsed widget data.
 */
export function pickWidgetFile(): Promise<WidgetFileData | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.widget,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const text = await file.text()
      resolve(parseWidgetFile(text))
    }
    input.click()
  })
}
