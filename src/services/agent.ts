import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { useAgentStore } from '@/stores/agent'
import { useCanvasStore } from '@/stores/canvas'
import { useSelectionStore } from '@/stores/selection'
import { useThemeStore } from '@/stores/theme'
import { useHistoryStore } from '@/stores/history'
import { buildSystemPrompt, buildUserContext } from './prompts'
import { validateTemplate, normalizeTemplate } from './validation'
import { compileJsx } from './jsx-compiler'
import { decompileToJsx } from './jsx-decompiler'
import { resolveTemplate } from '@swis/genui-widgets'
import type { CanvasWidget } from '@/types/canvas'
import type { BaseColors } from '@/utils/deriveTheme'
import type { ThemePreset } from '@/stores/theme'
import type { AgentImage, AgentMessage } from '@/stores/agent'
import { imageToDataUrl } from '@/utils/image'
import { locale, type Locale } from '@/i18n'

const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', nl: 'Dutch' }

const THEME_COLOR_KEYS: (keyof BaseColors)[] = [
  'primary',
  'success',
  'danger',
  'warning',
  'info',
  'discovery',
  'caution',
  'surface',
  'border',
]

const THEME_TARGETS = ['active', 'light', 'dark', 'both'] as const

type ThemeToolTarget = typeof THEME_TARGETS[number]

function isThemePreset(value: unknown): value is ThemePreset {
  return value === 'light' || value === 'dark'
}

function isThemeToolTarget(value: unknown): value is ThemeToolTarget {
  return typeof value === 'string' && THEME_TARGETS.includes(value as ThemeToolTarget)
}

function collectThemeColorUpdates(input: Record<string, unknown>): Partial<BaseColors> {
  const partial: Partial<BaseColors> = {}
  for (const key of THEME_COLOR_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) {
      partial[key] = value
    }
  }
  return partial
}

const anthropicTools: Anthropic.Tool[] = [
  {
    name: 'create_widget',
    description: 'Creates a new widget on the canvas. Provide JSX-like markup as the templateSource.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Display name for the widget' },
        templateSource: { type: 'string', description: 'JSX-like widget template markup' },
        schema: { type: 'object', description: 'JSON Schema describing the template data variables' },
        previewData: { type: 'object', description: 'Sample data for rendering the template preview' },
      },
      required: ['name', 'templateSource', 'schema', 'previewData'],
    },
  },
  {
    name: 'update_widget',
    description: 'Replaces the template of an existing widget with new JSX-like markup.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Widget ID to update' },
        templateSource: { type: 'string', description: 'New JSX-like widget template markup' },
        schema: { type: 'object', description: 'Updated JSON Schema for template data variables' },
        previewData: { type: 'object', description: 'Updated sample data for preview' },
      },
      required: ['id', 'templateSource', 'schema', 'previewData'],
    },
  },
  {
    name: 'set_theme_colors',
    description: 'Updates the base theme colors for the active, light, dark, or both presets. Use this to change the core palettes (primary, surface, border) and semantic accent colors. Derived tokens like text, backgrounds, and scales are generated automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          enum: [...THEME_TARGETS],
          description: 'Which preset to update: "active" (default), "light", "dark", or "both". Use "both" to apply the same colors to light and dark presets.',
        },
        activatePreset: {
          type: 'string',
          enum: ['light', 'dark'],
          description: 'Optional preset to switch the canvas to after updating colors.',
        },
        primary: { type: 'string', description: 'Primary/core text palette seed (hex, e.g. "#181818")' },
        surface: { type: 'string', description: 'Surface/background palette seed (hex, e.g. "#18211F" or "#FFFFFF")' },
        border: { type: 'string', description: 'Border palette seed (hex, e.g. "#44514D")' },
        success: { type: 'string', description: 'Success semantic color (hex, e.g. "#10B981")' },
        danger: { type: 'string', description: 'Danger/error semantic color (hex, e.g. "#EF4444")' },
        warning: { type: 'string', description: 'Warning semantic color (hex, e.g. "#F59E0B")' },
        info: { type: 'string', description: 'Info semantic color (hex, e.g. "#3B82F6")' },
        discovery: { type: 'string', description: 'Discovery/highlight semantic color (hex, e.g. "#8B5CF6")' },
        caution: { type: 'string', description: 'Caution/attention semantic color (hex, e.g. "#F97316")' },
      },
    },
  },
]

// OpenAI strict mode requires additionalProperties:false and explicit required on every object,
// and does NOT support free-form objects (type:'object' without properties).
// We convert free-form objects to type:'string' (JSON) for OpenAI and parse them in handleToolCall.
function toStrictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...schema, additionalProperties: false }
  if (result.properties && typeof result.properties === 'object') {
    const props = result.properties as Record<string, Record<string, unknown>>
    const strictProps: Record<string, Record<string, unknown>> = {}
    for (const [key, value] of Object.entries(props)) {
      if (value.type === 'object' && !value.properties) {
        // Free-form object → JSON string for OpenAI strict mode
        strictProps[key] = { type: 'string', description: `${value.description || ''} (as JSON string)` }
      } else if (value.type === 'object') {
        strictProps[key] = toStrictSchema(value)
      } else {
        strictProps[key] = { ...value }
      }
    }
    result.properties = strictProps
    // Strict mode requires all properties to be listed in required
    result.required = Object.keys(props)
  }
  return result
}

// The Responses API takes flat function tools (no nested `function` wrapper).
const openaiTools: OpenAI.Responses.FunctionTool[] = anthropicTools.map((t) => ({
  type: 'function' as const,
  name: t.name,
  description: t.description,
  parameters: toStrictSchema(t.input_schema as Record<string, unknown>),
  strict: true,
}))

// Reasoning tokens count against max_output_tokens, so the OpenAI budget needs
// significantly more headroom than Anthropic's to still fit a widget template.
const OPENAI_MAX_OUTPUT_TOKENS = 16384

// Guards against a model that keeps calling tools (e.g. failing validation forever).
const MAX_TOOL_ROUNDS = 8

export function compileAndValidate(
  templateSource: string,
  previewData?: Record<string, unknown>,
): { template: import('@swis/genui-widgets').WidgetTemplate; errors: string[] } {
  try {
    const nunjucksStr = compileJsx(templateSource)
    const resolved = resolveTemplate(nunjucksStr, previewData ?? {})
    const normalized = normalizeTemplate(resolved)
    const errors = validateTemplate(normalized)
    return { template: normalized, errors }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { template: { type: 'Box' } as import('@swis/genui-widgets').WidgetTemplate, errors: [msg] }
  }
}

function parseJsonField(value: unknown): Record<string, unknown> | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'object') return value as Record<string, unknown>
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return undefined }
  }
  return undefined
}

export type WidgetWriteResult =
  | { ok: true; widget: CanvasWidget }
  | { ok: false; code: 'validation' | 'not_found'; errors: string[] }

export interface CreateWidgetInput {
  name: string
  templateSource: string
  schema?: Record<string, unknown>
  previewData?: Record<string, unknown>
  externalId?: string
  meta?: Record<string, unknown>
}

export function createWidgetFromSource(input: CreateWidgetInput): WidgetWriteResult {
  const canvas = useCanvasStore()
  const { template, errors } = compileAndValidate(input.templateSource, input.previewData)
  if (errors.length > 0) return { ok: false, code: 'validation', errors }

  const widget = canvas.addWidget(
    input.name,
    template,
    undefined,
    undefined,
    input.templateSource,
    input.schema,
    input.previewData,
  )
  if (input.externalId !== undefined) widget.externalId = input.externalId
  if (input.meta !== undefined) widget.meta = input.meta
  return { ok: true, widget }
}

export interface UpdateWidgetInput {
  id: string
  name?: string
  templateSource?: string
  schema?: Record<string, unknown>
  previewData?: Record<string, unknown>
}

/** Recompiles a widget; omitted fields keep their current value. */
export function updateWidgetFromSource(input: UpdateWidgetInput): WidgetWriteResult {
  const canvas = useCanvasStore()
  const history = useHistoryStore()
  const w = canvas.getWidget(input.id)
  if (!w) return { ok: false, code: 'not_found', errors: [`Widget ${input.id} not found`] }

  const templateSource = input.templateSource ?? w.templateSource ?? decompileToJsx(w.template)
  const previewData = input.previewData ?? w.previewData
  const { template, errors } = compileAndValidate(templateSource, previewData)
  if (errors.length > 0) return { ok: false, code: 'validation', errors }

  history.commit()
  w.template = template
  w.templateSource = templateSource
  if (input.name !== undefined) w.name = input.name
  if (input.schema !== undefined) w.schema = input.schema
  if (input.previewData !== undefined) w.previewData = input.previewData
  return { ok: true, widget: w }
}

function validationMessage(errors: string[]): string {
  return `VALIDATION_ERROR: The template is invalid:\n${errors.join('\n')}\nPlease fix these issues and try again with corrected JSX markup.`
}

function handleToolCall(name: string, input: Record<string, unknown>, run?: RunTracker): string {
  const theme = useThemeStore()
  const agent = useAgentStore()

  agent.setThinkingPhase('applying')

  switch (name) {
    case 'create_widget': {
      const result = createWidgetFromSource({
        name: input.name as string,
        templateSource: input.templateSource as string,
        schema: parseJsonField(input.schema),
        previewData: parseJsonField(input.previewData),
      })
      if (!result.ok) return validationMessage(result.errors)
      run?.createdIds.push(result.widget.id)
      return `Created widget "${result.widget.name}" (id: ${result.widget.id})`
    }
    case 'update_widget': {
      const result = updateWidgetFromSource({
        id: input.id as string,
        templateSource: input.templateSource as string,
        schema: parseJsonField(input.schema),
        previewData: parseJsonField(input.previewData),
      })
      if (!result.ok) {
        return result.code === 'not_found' ? result.errors[0] : validationMessage(result.errors)
      }
      if (!run?.updatedIds.includes(result.widget.id)) run?.updatedIds.push(result.widget.id)
      return `Updated widget ${input.id}`
    }
    case 'set_theme_colors': {
      const partial = collectThemeColorUpdates(input)
      const target = isThemeToolTarget(input.target) ? input.target : 'active'
      const activatePreset = isThemePreset(input.activatePreset) ? input.activatePreset : undefined

      if (Object.keys(partial).length > 0) {
        if (target === 'both') {
          theme.setBaseColors(partial, 'light')
          theme.setBaseColors(partial, 'dark')
        } else {
          theme.setBaseColors(partial, target)
        }
      }

      if (activatePreset) {
        theme.applyPreset(activatePreset)
      }

      const changes = Object.entries(partial).map(([key, value]) => `${key}=${value}`).join(', ')
      const actions: string[] = []
      if (changes) {
        actions.push(`updated ${target} theme colors (${changes})`)
      }
      if (activatePreset) {
        actions.push(`activated ${activatePreset} preset`)
      }

      return actions.length > 0 ? `Theme updated: ${actions.join('; ')}` : 'No theme changes were applied'
    }
    default:
      return `Unknown tool: ${name}`
  }
}

/** Widgets touched during one agent run. */
interface RunTracker {
  createdIds: string[]
  updatedIds: string[]
}

async function sendMessageAnthropic(
  agent: ReturnType<typeof useAgentStore>,
  apiMessages: Anthropic.MessageParam[],
  systemPrompt: string,
  run: RunTracker,
) {
  const provider = agent.providers.anthropic
  const client = new Anthropic({
    // A host proxy authenticates the request itself; the SDK still requires a key.
    apiKey: provider?.apiKey ?? (agent.apiKey || 'proxy'),
    baseURL: provider?.baseURL,
    defaultHeaders: provider?.headers,
    dangerouslyAllowBrowser: true,
  })

  agent.setThinkingPhase('generating')

  let response = await client.messages.create({
    model: agent.selectedModel,
    max_tokens: 4096,
    system: systemPrompt,
    tools: anthropicTools,
    messages: apiMessages,
  })

  let textContent = ''
  const toolCallsLog: { name: string; input: Record<string, unknown> }[] = []
  let rounds = 0

  while (true) {
    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text
        agent.streamingContent = textContent
      } else if (block.type === 'tool_use') {
        agent.setThinkingPhase('validating')
        const result = handleToolCall(block.name, block.input as Record<string, unknown>, run)
        toolCallsLog.push({ name: block.name, input: block.input as Record<string, unknown> })

        apiMessages.push({ role: 'assistant', content: response.content })
        apiMessages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: block.id, content: result }],
        })

        if (result.startsWith('VALIDATION_ERROR:')) {
          agent.setThinkingPhase('retrying')
        }
      }
    }

    if (response.stop_reason === 'tool_use' && ++rounds < MAX_TOOL_ROUNDS) {
      agent.setThinkingPhase('generating')
      response = await client.messages.create({
        model: agent.selectedModel,
        max_tokens: 4096,
        system: systemPrompt,
        tools: anthropicTools,
        messages: apiMessages,
      })
    } else {
      break
    }
  }

  return { textContent, toolCallsLog }
}

async function sendMessageOpenAI(
  agent: ReturnType<typeof useAgentStore>,
  input: OpenAI.Responses.ResponseInputItem[],
  systemPrompt: string,
  run: RunTracker,
) {
  const provider = agent.providers.openai
  const client = new OpenAI({
    // A host proxy authenticates the request itself; the SDK still requires a key.
    apiKey: provider?.apiKey ?? (agent.openaiApiKey || 'proxy'),
    baseURL: provider?.baseURL,
    defaultHeaders: provider?.headers,
    dangerouslyAllowBrowser: true,
  })

  agent.setThinkingPhase('generating')

  const createResponse = () =>
    client.responses.create({
      model: agent.selectedModel,
      instructions: systemPrompt,
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      tools: openaiTools,
      input,
      // Nothing is persisted server-side, so reasoning has to travel with the
      // request for the model to keep its chain of thought across tool turns.
      store: false,
      include: ['reasoning.encrypted_content'],
    })

  let response = await createResponse()

  let textContent = ''
  const toolCallsLog: { name: string; input: Record<string, unknown> }[] = []
  let rounds = 0

  while (true) {
    if (response.output_text) {
      textContent += response.output_text
      agent.streamingContent = textContent
    }

    const functionCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call',
    )

    if (functionCalls.length === 0) {
      if (response.status === 'incomplete') {
        throw new Error(
          `Response was cut short (${response.incomplete_details?.reason ?? 'unknown reason'}).`,
        )
      }
      break
    }

    agent.setThinkingPhase('validating')

    // Replay every output item — reasoning items included — before the outputs.
    // Output items are valid input items; the SDK types only disagree on the `status` union.
    input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]))

    for (const call of functionCalls) {
      const args = JSON.parse(call.arguments) as Record<string, unknown>
      const result = handleToolCall(call.name, args, run)
      toolCallsLog.push({ name: call.name, input: args })

      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: result,
      })

      if (result.startsWith('VALIDATION_ERROR:')) {
        agent.setThinkingPhase('retrying')
      }
    }

    if (++rounds >= MAX_TOOL_ROUNDS) break
    agent.setThinkingPhase('generating')
    response = await createResponse()
  }

  return { textContent, toolCallsLog }
}

function toAnthropicMessage(m: AgentMessage, text: string): Anthropic.MessageParam {
  if (m.role !== 'user' || !m.images?.length) {
    return { role: m.role, content: text }
  }
  return {
    role: 'user',
    content: [
      ...m.images.map((img): Anthropic.ImageBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data },
      })),
      // Image-only turns have no text; empty text blocks are rejected.
      ...(text ? [{ type: 'text' as const, text }] : []),
    ],
  }
}

// The system prompt moves to `instructions`; conversation turns become input items.
function toOpenAIInput(m: AgentMessage, text: string): OpenAI.Responses.ResponseInputItem {
  if (m.role !== 'user' || !m.images?.length) {
    return { role: m.role, content: text }
  }
  return {
    role: 'user',
    content: [
      ...m.images.map((img): OpenAI.Responses.ResponseInputImage => ({
        type: 'input_image',
        image_url: imageToDataUrl(img),
        detail: 'auto',
      })),
      ...(text ? [{ type: 'input_text' as const, text }] : []),
    ],
  }
}

export interface SendMessageOptions {
  /** Send only this turn, without replaying the earlier chat. */
  freshContext?: boolean
  /** Widgets to edit. Replaces the user's selection as context; `[]` means none. */
  targetWidgetIds?: string[]
  /** Real data the widget should be built around. */
  data?: Record<string, unknown>
}

export type SendMessageResult =
  | { ok: true; text: string; createdIds: string[]; updatedIds: string[] }
  | { ok: false; code: 'busy' | 'llm'; message: string; status: number | null }

export async function sendMessage(
  userText: string,
  images: AgentImage[] = [],
  opts: SendMessageOptions = {},
): Promise<SendMessageResult> {
  const agent = useAgentStore()
  const canvas = useCanvasStore()
  const selection = useSelectionStore()
  const theme = useThemeStore()
  const history = useHistoryStore()

  if (agent.isStreaming) {
    return { ok: false, code: 'busy', message: 'The studio agent is already working on a request.', status: null }
  }

  agent.setError(null)
  const userMessage = agent.addUserMessage(userText, images)
  agent.setStreaming(true)
  agent.setThinkingPhase('thinking')

  // Build context
  const contextWidgets = opts.targetWidgetIds
    ? opts.targetWidgetIds.map((id) => canvas.getWidget(id)).filter((w): w is CanvasWidget => !!w)
    : selection.selectedWidgets
  const elementPath = opts.targetWidgetIds ? null : selection.elementPath
  const allNames = canvas.widgets.map((w) => w.name)
  const userContext = buildUserContext(contextWidgets, elementPath, allNames)
  const imageContext = images.length > 0
    ? `\n\n## Attached Images\nThe user attached ${images.length} image(s) as visual reference (e.g. a screenshot, mockup or design). Use them to match layout, content, and styling as closely as the available components allow.`
    : ''
  const dataContext = opts.data
    ? `\n\n## Data\nBuild the widget around this real data. Use it as previewData and derive the schema from it; bind every value with {{ }} expressions instead of hard-coding it.\n\`\`\`json\n${JSON.stringify(opts.data, null, 2)}\n\`\`\``
    : ''
  const fullUserMessage = `${userContext}${imageContext}${dataContext}\n\n## User Request\n${userText || 'Recreate the attached image(s) as a widget.'}`
  const systemPrompt = buildSystemPrompt(theme.tokens, {
    activePreset: theme.activePreset,
    lightColors: theme.lightColors,
    darkColors: theme.darkColors,
  }) + `\n\n## Language\nThe studio's interface is in ${LANGUAGE_NAMES[locale.value]}. Write your chat replies in the language the user writes in, or in ${LANGUAGE_NAMES[locale.value]} if that is unclear. This applies to your replies only; widget content follows the user's request.`

  // The latest user turn carries the full context; earlier turns are replayed as-is.
  const textFor = (m: AgentMessage) => (m.id === userMessage.id ? fullUserMessage : m.content)
  const turns = opts.freshContext ? [userMessage] : agent.messages
  const run: RunTracker = { createdIds: [], updatedIds: [] }

  try {
    history.beginBatch()

    let result: { textContent: string; toolCallsLog: { name: string; input: Record<string, unknown> }[] }

    if (agent.modelFamily === 'anthropic') {
      const apiMessages = turns.map((m) => toAnthropicMessage(m, textFor(m)))
      result = await sendMessageAnthropic(agent, apiMessages, systemPrompt, run)
    } else {
      const input = turns.map((m) => toOpenAIInput(m, textFor(m)))
      result = await sendMessageOpenAI(agent, input, systemPrompt, run)
    }

    history.endBatch()
    agent.addAssistantMessage(result.textContent, result.toolCallsLog.length > 0 ? result.toolCallsLog : undefined)
    return { ok: true, text: result.textContent, ...run }
  } catch (err) {
    history.endBatch()
    const msg = err instanceof Error ? err.message : 'Unknown error'
    // Both SDKs expose the HTTP status on their API errors.
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : null
    agent.setError(msg, status)
    return { ok: false, code: 'llm', message: msg, status }
  } finally {
    agent.setStreaming(false)
  }
}
