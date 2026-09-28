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
import { resolveTemplate } from '@swis/genui-widgets'
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

function compileAndValidate(
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

function handleToolCall(name: string, input: Record<string, unknown>): string {
  const canvas = useCanvasStore()
  const theme = useThemeStore()
  const agent = useAgentStore()

  agent.setThinkingPhase('applying')

  switch (name) {
    case 'create_widget': {
      const templateSource = input.templateSource as string
      const previewData = parseJsonField(input.previewData)
      const schema = parseJsonField(input.schema)

      const { template, errors } = compileAndValidate(templateSource, previewData)
      if (errors.length > 0) {
        return `VALIDATION_ERROR: The template is invalid:\n${errors.join('\n')}\nPlease fix these issues and try again with corrected JSX markup.`
      }

      const widget = canvas.addWidget(
        input.name as string,
        template,
        undefined,
        undefined,
        templateSource,
        schema,
        previewData,
      )
      return `Created widget "${widget.name}" (id: ${widget.id})`
    }
    case 'update_widget': {
      const templateSource = input.templateSource as string
      const previewData = parseJsonField(input.previewData)
      const schema = parseJsonField(input.schema)

      const { template, errors } = compileAndValidate(templateSource, previewData)
      if (errors.length > 0) {
        return `VALIDATION_ERROR: The template is invalid:\n${errors.join('\n')}\nPlease fix these issues and try again with corrected JSX markup.`
      }

      const w = canvas.getWidget(input.id as string)
      if (!w) return `Widget ${input.id} not found`

      w.template = template
      w.templateSource = templateSource
      if (schema !== undefined) w.schema = schema
      if (previewData !== undefined) w.previewData = previewData
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

async function sendMessageAnthropic(
  agent: ReturnType<typeof useAgentStore>,
  apiMessages: Anthropic.MessageParam[],
  systemPrompt: string,
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

  while (true) {
    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text
        agent.streamingContent = textContent
      } else if (block.type === 'tool_use') {
        agent.setThinkingPhase('validating')
        const result = handleToolCall(block.name, block.input as Record<string, unknown>)
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

    if (response.stop_reason === 'tool_use') {
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
    input.push(...response.output)

    for (const call of functionCalls) {
      const args = JSON.parse(call.arguments) as Record<string, unknown>
      const result = handleToolCall(call.name, args)
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

export async function sendMessage(userText: string, images: AgentImage[] = []) {
  const agent = useAgentStore()
  const canvas = useCanvasStore()
  const selection = useSelectionStore()
  const theme = useThemeStore()
  const history = useHistoryStore()

  agent.setError(null)
  const userMessage = agent.addUserMessage(userText, images)
  agent.setStreaming(true)
  agent.setThinkingPhase('thinking')

  // Build context
  const selectedWidgets = selection.selectedWidgets
  const allNames = canvas.widgets.map((w) => w.name)
  const userContext = buildUserContext(selectedWidgets, selection.elementPath, allNames)
  const imageContext = images.length > 0
    ? `\n\n## Attached Images\nThe user attached ${images.length} image(s) as visual reference (e.g. a screenshot, mockup or design). Use them to match layout, content, and styling as closely as the available components allow.`
    : ''
  const fullUserMessage = `${userContext}${imageContext}\n\n## User Request\n${userText || 'Recreate the attached image(s) as a widget.'}`
  const systemPrompt = buildSystemPrompt(theme.tokens, {
    activePreset: theme.activePreset,
    lightColors: theme.lightColors,
    darkColors: theme.darkColors,
  }) + `\n\n## Language\nThe studio's interface is in ${LANGUAGE_NAMES[locale.value]}. Write your chat replies in the language the user writes in, or in ${LANGUAGE_NAMES[locale.value]} if that is unclear. This applies to your replies only; widget content follows the user's request.`

  // The latest user turn carries the full context; earlier turns are replayed as-is.
  const textFor = (m: AgentMessage) => (m.id === userMessage.id ? fullUserMessage : m.content)

  try {
    history.beginBatch()

    let result: { textContent: string; toolCallsLog: { name: string; input: Record<string, unknown> }[] }

    if (agent.modelFamily === 'anthropic') {
      const apiMessages = agent.messages.map((m) => toAnthropicMessage(m, textFor(m)))
      result = await sendMessageAnthropic(agent, apiMessages, systemPrompt)
    } else {
      const input = agent.messages.map((m) => toOpenAIInput(m, textFor(m)))
      result = await sendMessageOpenAI(agent, input, systemPrompt)
    }

    history.endBatch()
    agent.addAssistantMessage(result.textContent, result.toolCallsLog.length > 0 ? result.toolCallsLog : undefined)
  } catch (err) {
    history.endBatch()
    const msg = err instanceof Error ? err.message : 'Unknown error'
    // Both SDKs expose the HTTP status on their API errors.
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : null
    agent.setError(msg, status)
  } finally {
    agent.setStreaming(false)
  }
}
