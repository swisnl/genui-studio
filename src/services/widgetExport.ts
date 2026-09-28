import type { CanvasWidget } from '@/types/canvas'
import type { WidgetFile } from '@/embed/protocol'
import { compileJsx } from './jsx-compiler'
import { decompileToJsx } from './jsx-decompiler'

function encodeUrlSafeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  return btoa(String.fromCodePoint(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Serialize a canvas widget to the `.widget` file format (the inverse of `parseWidgetFile`).
 */
export function serializeWidgetFile(widget: CanvasWidget): WidgetFile {
  // Widgets created from raw template JSON have no source yet
  let view = widget.templateSource ?? ''
  if (!view) {
    try {
      view = decompileToJsx(widget.template)
    } catch {
      // If decompilation fails, leave empty
    }
  }

  // Encode the view + defaultState into URL-safe base64
  const encodedWidget = encodeUrlSafeBase64(JSON.stringify({
    id: widget.id,
    name: widget.name,
    view,
    defaultState: widget.previewData ?? {},
    states: [],
  }))

  // Compile JSX → nunjucks template
  let template = ''
  try {
    template = compileJsx(view)
  } catch {
    // If compilation fails, leave empty
  }

  return {
    version: '1.0',
    name: widget.name,
    encodedWidget,
    template,
    outputJsonPreview: widget.template,
    jsonSchema: widget.schema ?? {},
  }
}
