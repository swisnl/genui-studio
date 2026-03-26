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
import type { Position } from '@/types/canvas'
import type { BaseColors } from '@/utils/deriveTheme'
import type { ThemePreset } from '@/stores/theme'

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
        position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          description: 'Optional canvas position',
        },
      },
      required: ['name', 'templateSource'],
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
      required: ['id', 'templateSource'],
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

const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = anthropicTools.map((t) => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema as Record<string, unknown>,
  },
}))

// Map our display model IDs to actual API model IDs
const OPENAI_MODEL_MAP: Record<string, string> = {
  'chatgpt-5.4': 'gpt-5.4',
  'chatgpt-5.4-mini': 'gpt-5.4-mini',
  'chatgpt-5.4-nano': 'gpt-5.4-nano',
}

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

function handleToolCall(name: string, input: Record<string, unknown>): string {
  const canvas = useCanvasStore()
  const theme = useThemeStore()
  const agent = useAgentStore()

  agent.setThinkingPhase('Applying changes')

  switch (name) {
    case 'create_widget': {
      const templateSource = input.templateSource as string
      const previewData = input.previewData as Record<string, unknown> | undefined
      const schema = input.schema as Record<string, unknown> | undefined

      const { template, errors } = compileAndValidate(templateSource, previewData)
      if (errors.length > 0) {
        return `VALIDATION_ERROR: The template is invalid:\n${errors.join('\n')}\nPlease fix these issues and try again with corrected JSX markup.`
      }

      const widget = canvas.addWidget(
        input.name as string,
        template,
        input.position as Position | undefined,
        undefined,
        templateSource,
        schema,
        previewData,
      )
      return `Created widget "${widget.name}" (id: ${widget.id})`
    }
    case 'update_widget': {
      const templateSource = input.templateSource as string
      const previewData = input.previewData as Record<string, unknown> | undefined
      const schema = input.schema as Record<string, unknown> | undefined

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
  const client = new Anthropic({ apiKey: agent.apiKey, dangerouslyAllowBrowser: true })

  agent.setThinkingPhase('Generating')

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
        agent.setThinkingPhase('Validating')
        const result = handleToolCall(block.name, block.input as Record<string, unknown>)
        toolCallsLog.push({ name: block.name, input: block.input as Record<string, unknown> })

        apiMessages.push({ role: 'assistant', content: response.content })
        apiMessages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: block.id, content: result }],
        })

        if (result.startsWith('VALIDATION_ERROR:')) {
          agent.setThinkingPhase('Retrying (invalid template)')
        }
      }
    }

    if (response.stop_reason === 'tool_use') {
      agent.setThinkingPhase('Generating')
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
  userMessages: { role: string; content: string }[],
  systemPrompt: string,
) {
  const client = new OpenAI({ apiKey: agent.openaiApiKey, dangerouslyAllowBrowser: true })
  const apiModelId = OPENAI_MODEL_MAP[agent.selectedModel] ?? agent.selectedModel

  agent.setThinkingPhase('Generating')

  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...userMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  let response = await client.chat.completions.create({
    model: apiModelId,
    max_completion_tokens: 4096,
    tools: openaiTools,
    messages: openaiMessages,
  })

  let textContent = ''
  const toolCallsLog: { name: string; input: Record<string, unknown> }[] = []

  while (true) {
    const choice = response.choices[0]
    const message = choice.message

    if (message.content) {
      textContent += message.content
      agent.streamingContent = textContent
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      agent.setThinkingPhase('Validating')

      // Add assistant message with tool calls to conversation
      openaiMessages.push(message)

      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== 'function') continue
        const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
        const result = handleToolCall(toolCall.function.name, input)
        toolCallsLog.push({ name: toolCall.function.name, input })

        openaiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        })

        if (result.startsWith('VALIDATION_ERROR:')) {
          agent.setThinkingPhase('Retrying (invalid template)')
        }
      }
    }

    if (choice.finish_reason === 'tool_calls') {
      agent.setThinkingPhase('Generating')
      response = await client.chat.completions.create({
        model: apiModelId,
        max_completion_tokens: 4096,
        tools: openaiTools,
        messages: openaiMessages,
      })
    } else {
      break
    }
  }

  return { textContent, toolCallsLog }
}

export async function sendMessage(userText: string) {
  const agent = useAgentStore()
  const canvas = useCanvasStore()
  const selection = useSelectionStore()
  const theme = useThemeStore()
  const history = useHistoryStore()

  agent.setError(null)
  agent.addUserMessage(userText)
  agent.setStreaming(true)
  agent.setThinkingPhase('Thinking')

  // Build context
  const selectedWidgets = selection.selectedWidgets
  const allNames = canvas.widgets.map((w) => w.name)
  const userContext = buildUserContext(selectedWidgets, selection.elementPath, allNames)
  const fullUserMessage = `${userContext}\n\n## User Request\n${userText}`
  const systemPrompt = buildSystemPrompt(theme.tokens, {
    activePreset: theme.activePreset,
    lightColors: theme.lightColors,
    darkColors: theme.darkColors,
  })

  try {
    history.beginBatch()

    let result: { textContent: string; toolCallsLog: { name: string; input: Record<string, unknown> }[] }

    if (agent.modelFamily === 'anthropic') {
      const apiMessages: Anthropic.MessageParam[] = agent.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      apiMessages[apiMessages.length - 1] = { role: 'user', content: fullUserMessage }
      result = await sendMessageAnthropic(agent, apiMessages, systemPrompt)
    } else {
      const userMessages = agent.messages.map((m) => ({
        role: m.role,
        content: m.role === 'user' && m === agent.messages[agent.messages.length - 1]
          ? fullUserMessage
          : m.content,
      }))
      // Replace last user message with full context version
      if (userMessages.length > 0) {
        userMessages[userMessages.length - 1] = { role: 'user', content: fullUserMessage }
      }
      result = await sendMessageOpenAI(agent, userMessages, systemPrompt)
    }

    history.endBatch()
    agent.addAssistantMessage(result.textContent, result.toolCallsLog.length > 0 ? result.toolCallsLog : undefined)
  } catch (err) {
    history.endBatch()
    const msg = err instanceof Error ? err.message : 'Unknown error'
    agent.setError(msg)
  } finally {
    agent.setStreaming(false)
  }
}
