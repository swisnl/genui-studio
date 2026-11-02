import { useCanvasStore } from '@/stores/canvas'
import { useThemeStore } from '@/stores/theme'
import {
  sendMessage,
  createWidgetFromSource,
  updateWidgetFromSource,
  type WidgetWriteResult,
} from '@/services/agent'
import { buildSystemPrompt } from '@/services/prompts'
import { decompileToJsx } from '@/services/jsx-decompiler'
import type { AgentImage } from '@/stores/agent'
import type { CanvasWidget } from '@/types/canvas'

type JsonObject = Record<string, unknown>

export interface StudioTool {
  name: string
  description: string
  inputSchema: JsonObject
  annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean }
  execute: (args: JsonObject) => Promise<string>
}

type ToolErrorCode = 'invalid_input' | 'not_found' | 'validation' | 'busy' | 'llm' | 'internal'

class ToolError extends Error {
  constructor(public code: ToolErrorCode, message: string, public details?: string[]) {
    super(message)
  }
}

function ok(result: JsonObject): string {
  return JSON.stringify({ ok: true, ...result })
}

function fail(code: ToolErrorCode, message: string, details?: string[]): string {
  return JSON.stringify({ ok: false, error: { code, message, ...(details ? { details } : {}) } })
}

function summarize(w: CanvasWidget) {
  return {
    id: w.id,
    externalId: w.externalId,
    name: w.name,
    schema: w.schema,
    previewData: w.previewData,
  }
}

function requireString(args: JsonObject, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new ToolError('invalid_input', `"${key}" must be a non-empty string`)
  }
  return value
}

function optionalString(args: JsonObject, key: string): string | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new ToolError('invalid_input', `"${key}" must be a string`)
  return value
}

function optionalObject(args: JsonObject, key: string): JsonObject | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ToolError('invalid_input', `"${key}" must be an object`)
  }
  return value as JsonObject
}

function requireWidget(id: string): CanvasWidget {
  const widget = useCanvasStore().getWidget(id)
  if (!widget) throw new ToolError('not_found', `Widget ${id} not found. Call list_widgets for valid ids.`)
  return widget
}

function unwrap(result: WidgetWriteResult): CanvasWidget {
  if (result.ok) return result.widget
  if (result.code === 'not_found') throw new ToolError('not_found', result.errors[0])
  throw new ToolError(
    'validation',
    'The template is invalid. Fix the listed issues and call the tool again.',
    result.errors,
  )
}

function parseImages(args: JsonObject): AgentImage[] {
  const value = args.images
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new ToolError('invalid_input', '"images" must be an array')
  return value.map((img, i) => {
    const { mediaType, data } = (img ?? {}) as JsonObject
    if (typeof mediaType !== 'string' || typeof data !== 'string') {
      throw new ToolError('invalid_input', `images[${i}] needs "mediaType" and base64 "data"`)
    }
    return { mediaType: mediaType as AgentImage['mediaType'], data }
  })
}

const freeObject = (description: string) => ({ type: 'object', description, additionalProperties: true })

const TOOLS: StudioTool[] = [
  {
    name: 'generate_widget',
    description:
      'Designs a widget on the GenUI Studio board from a natural-language description, using the studio\'s own design agent ' +
      '(component library, theme, validation). This is the preferred way to create or change a widget. ' +
      'Pass "data" with the real values the widget should show (e.g. an employee record); the studio binds them as template variables. ' +
      'Pass "widgetId" to change an existing widget instead of creating a new one. ' +
      'Takes up to a minute. Returns the created and updated widgets.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What the widget should show and look like, e.g. "an employee card with photo, role and contact details".' },
        data: freeObject('Optional real data to build the widget around. Becomes the widget\'s previewData.'),
        widgetId: { type: 'string', description: 'Optional id of an existing widget to modify.' },
        images: {
          type: 'array',
          description: 'Optional reference images (screenshots, mockups).',
          items: {
            type: 'object',
            properties: {
              mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] },
              data: { type: 'string', description: 'Base64-encoded image bytes, without data: prefix.' },
            },
            required: ['mediaType', 'data'],
          },
        },
        externalId: { type: 'string', description: 'Optional id from the calling system, stored on a newly created widget.' },
        meta: freeObject('Optional opaque metadata stored on a newly created widget.'),
      },
      required: ['prompt'],
    },
    async execute(args) {
      const prompt = requireString(args, 'prompt')
      const data = optionalObject(args, 'data')
      const widgetId = optionalString(args, 'widgetId')
      const externalId = optionalString(args, 'externalId')
      const meta = optionalObject(args, 'meta')
      const images = parseImages(args)
      if (widgetId) requireWidget(widgetId)

      const result = await sendMessage(prompt, images, {
        freshContext: true,
        targetWidgetIds: widgetId ? [widgetId] : [],
        data,
      })
      if (!result.ok) throw new ToolError(result.code, result.message)

      const canvas = useCanvasStore()
      const created = result.createdIds.map((id) => canvas.getWidget(id)).filter((w): w is CanvasWidget => !!w)
      const updated = result.updatedIds.map((id) => canvas.getWidget(id)).filter((w): w is CanvasWidget => !!w)
      for (const w of created) {
        if (externalId !== undefined) w.externalId = externalId
        if (meta !== undefined) w.meta = meta
      }
      if (created.length === 0 && updated.length === 0) {
        throw new ToolError('llm', `The studio agent did not produce a widget. It replied: ${result.text || '(nothing)'}`)
      }
      return ok({ created: created.map(summarize), updated: updated.map(summarize), message: result.text })
    },
  },
  {
    name: 'list_widgets',
    description: 'Lists the widgets on the GenUI Studio board with their id, name, data schema and current data.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    async execute() {
      return ok({ widgets: useCanvasStore().widgets.map(summarize) })
    },
  },
  {
    name: 'get_widget',
    description: 'Returns one widget including its JSX template source, data schema, data and metadata.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Widget id from list_widgets.' } },
      required: ['id'],
    },
    annotations: { readOnlyHint: true },
    async execute(args) {
      const w = requireWidget(requireString(args, 'id'))
      return ok({
        widget: { ...summarize(w), templateSource: w.templateSource ?? decompileToJsx(w.template), meta: w.meta },
      })
    },
  },
  {
    name: 'set_widget_data',
    description:
      'Replaces the data shown by an existing widget without redesigning it. Fast, no AI involved. ' +
      'The data should follow the widget\'s schema (see list_widgets).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Widget id.' },
        data: freeObject('New data for the widget.'),
      },
      required: ['id', 'data'],
    },
    async execute(args) {
      const id = requireString(args, 'id')
      const data = optionalObject(args, 'data')
      if (!data) throw new ToolError('invalid_input', '"data" is required')
      return ok({ widget: summarize(unwrap(updateWidgetFromSource({ id, previewData: data }))) })
    },
  },
  {
    name: 'delete_widget',
    description: 'Removes a widget from the GenUI Studio board.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Widget id.' } },
      required: ['id'],
    },
    annotations: { consequentialHint: true },
    async execute(args) {
      const w = requireWidget(requireString(args, 'id'))
      useCanvasStore().removeWidget(w.id)
      return ok({ deleted: w.id })
    },
  },
  {
    name: 'get_authoring_guide',
    description:
      'Returns the JSX template language, component catalog and current theme of GenUI Studio. ' +
      'Only needed when you want to write widget JSX yourself with create_widget or update_widget; otherwise use generate_widget.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    async execute() {
      const theme = useThemeStore()
      return buildSystemPrompt(theme.tokens, {
        activePreset: theme.activePreset,
        lightColors: theme.lightColors,
        darkColors: theme.darkColors,
      })
    },
  },
  {
    name: 'create_widget',
    description:
      'Creates a widget from JSX template markup you wrote yourself (see get_authoring_guide). ' +
      'Returns validation errors when the markup is invalid, so you can fix it and retry. Prefer generate_widget unless you need exact control.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name.' },
        templateSource: { type: 'string', description: 'JSX-like widget template markup.' },
        schema: freeObject('JSON Schema of the template variables.'),
        previewData: freeObject('Data rendered by the template.'),
        externalId: { type: 'string', description: 'Optional id from the calling system.' },
        meta: freeObject('Optional opaque metadata.'),
      },
      required: ['name', 'templateSource'],
    },
    async execute(args) {
      const widget = unwrap(createWidgetFromSource({
        name: requireString(args, 'name'),
        templateSource: requireString(args, 'templateSource'),
        schema: optionalObject(args, 'schema'),
        previewData: optionalObject(args, 'previewData'),
        externalId: optionalString(args, 'externalId'),
        meta: optionalObject(args, 'meta'),
      }))
      return ok({ widget: summarize(widget) })
    },
  },
  {
    name: 'update_widget',
    description:
      'Updates an existing widget with JSX template markup you wrote yourself. Omitted fields stay unchanged. ' +
      'Returns validation errors when the markup is invalid. Prefer generate_widget with widgetId unless you need exact control.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Widget id.' },
        name: { type: 'string', description: 'New display name.' },
        templateSource: { type: 'string', description: 'New JSX-like widget template markup.' },
        schema: freeObject('New JSON Schema of the template variables.'),
        previewData: freeObject('New data rendered by the template.'),
      },
      required: ['id'],
    },
    async execute(args) {
      const widget = unwrap(updateWidgetFromSource({
        id: requireString(args, 'id'),
        name: optionalString(args, 'name'),
        templateSource: optionalString(args, 'templateSource'),
        schema: optionalObject(args, 'schema'),
        previewData: optionalObject(args, 'previewData'),
      }))
      return ok({ widget: summarize(widget) })
    },
  },
]

/** The studio's tools, with errors turned into `{ ok: false, error }` results the calling agent can act on. */
export const studioTools: StudioTool[] = TOOLS.map((tool) => ({
  ...tool,
  async execute(args) {
    try {
      return await tool.execute(args ?? {})
    } catch (err) {
      if (err instanceof ToolError) return fail(err.code, err.message, err.details)
      return fail('internal', err instanceof Error ? err.message : String(err))
    }
  },
}))
