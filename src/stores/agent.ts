import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { isEmbedded } from '@/embed/mode'
import type { ModelFamily, ModelOption, ProviderConfig } from '@/embed/protocol'

export type { ModelFamily, ModelOption, ProviderConfig }

export interface AgentImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  /** Base64-encoded image bytes (no data URL prefix) */
  data: string
  name?: string
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  images?: AgentImage[]
  toolCalls?: { name: string; input: Record<string, unknown> }[]
  timestamp: number
  model?: string
}

/** Progress of an agent run; shown translated in the agent log. */
export type ThinkingPhase = 'thinking' | 'generating' | 'validating' | 'applying' | 'retrying'

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', family: 'anthropic' },
  { id: 'claude-opus-5', label: 'Claude Opus 5', family: 'anthropic' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', family: 'anthropic' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', family: 'anthropic' },
  { id: 'gpt-6-sol', label: 'ChatGPT 6 - Sol', family: 'openai' },
  { id: 'gpt-6-luna', label: 'ChatGPT 6 - Luna', family: 'openai' },
  { id: 'gpt-5.6-sol', label: 'ChatGPT 5.6 - Sol', family: 'openai' },
  { id: 'gpt-5.6-terra', label: 'ChatGPT 5.6 - Terra', family: 'openai' },
  { id: 'gpt-5.6-luna', label: 'ChatGPT 5.6 - Luna', family: 'openai' },
]

// An embedded studio gets its keys and model from the host, never from this browser's storage.
const storage = {
  get: (key: string) => (isEmbedded ? null : localStorage.getItem(key)),
  set: (key: string, value: string) => { if (!isEmbedded) localStorage.setItem(key, value) },
  remove: (key: string) => { if (!isEmbedded) localStorage.removeItem(key) },
}

export const useAgentStore = defineStore('agent', () => {
  const messages = ref<AgentMessage[]>([])
  const isStreaming = ref(false)
  const streamingContent = ref('')
  const thinkingPhase = ref<ThinkingPhase | null>(null)
  const apiKey = ref(storage.get('genui-studio-api-key') ?? '')
  const openaiApiKey = ref(storage.get('genui-studio-openai-api-key') ?? '')
  const selectedModel = ref(storage.get('genui-studio-selected-model') ?? 'gpt-5.6-luna')
  const models = ref<ModelOption[]>(MODEL_OPTIONS)
  const providers = ref<{ openai?: ProviderConfig; anthropic?: ProviderConfig }>({})
  const error = ref<string | null>(null)
  /** HTTP status of the last failed LLM request, if any */
  const errorStatus = ref<number | null>(null)

  const hasApiKey = computed(() => apiKey.value.length > 0)
  const hasOpenaiApiKey = computed(() => openaiApiKey.value.length > 0)

  const modelOption = computed(() => models.value.find((m) => m.id === selectedModel.value)
    ?? models.value.find((m) => m.id === 'claude-sonnet-5')
    ?? models.value[0]
    ?? MODEL_OPTIONS[0])
  const modelFamily = computed<ModelFamily>(() => modelOption.value.family)
  const modelDisplayName = computed(() => modelOption.value.label)
  // A host-configured provider (e.g. a proxy) authenticates on its own, so no key is needed.
  const hasActiveApiKey = computed(() => {
    const provider = providers.value[modelFamily.value]
    if (provider?.baseURL || provider?.apiKey) return true
    return modelFamily.value === 'anthropic' ? hasApiKey.value : hasOpenaiApiKey.value
  })

  function setApiKey(key: string) {
    apiKey.value = key
    if (key) {
      storage.set('genui-studio-api-key', key)
    } else {
      storage.remove('genui-studio-api-key')
    }
  }

  function setOpenaiApiKey(key: string) {
    openaiApiKey.value = key
    if (key) {
      storage.set('genui-studio-openai-api-key', key)
    } else {
      storage.remove('genui-studio-openai-api-key')
    }
  }

  function setSelectedModel(modelId: string) {
    selectedModel.value = modelId
    storage.set('genui-studio-selected-model', modelId)
  }

  function configure(config: {
    providers?: { openai?: ProviderConfig; anthropic?: ProviderConfig }
    models?: ModelOption[]
    defaultModel?: string
  }) {
    if (config.providers) {
      const next = { ...providers.value }
      for (const family of ['openai', 'anthropic'] as const) {
        const provider = config.providers[family]
        if (!provider) continue
        // The SDKs need absolute URLs; allow hosts to pass e.g. `/llm/v1`.
        next[family] = {
          ...provider,
          baseURL: provider.baseURL ? new URL(provider.baseURL, window.location.href).href : undefined,
        }
      }
      providers.value = next
    }
    if (config.models?.length) models.value = config.models
    if (config.defaultModel) {
      selectedModel.value = config.defaultModel
    } else if (!models.value.some((m) => m.id === selectedModel.value)) {
      selectedModel.value = models.value[0].id
    }
  }

  function addUserMessage(content: string, images?: AgentImage[]): AgentMessage {
    const msg: AgentMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      images: images?.length ? images : undefined,
      timestamp: Date.now(),
    }
    messages.value.push(msg)
    return msg
  }

  function addAssistantMessage(content: string, toolCalls?: AgentMessage['toolCalls']): AgentMessage {
    const msg: AgentMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content,
      toolCalls,
      timestamp: Date.now(),
      model: modelDisplayName.value,
    }
    messages.value.push(msg)
    return msg
  }

  function clearMessages() {
    messages.value = []
  }

  function setStreaming(value: boolean) {
    isStreaming.value = value
    if (!value) {
      streamingContent.value = ''
      thinkingPhase.value = null
    }
  }

  function setThinkingPhase(phase: ThinkingPhase | null) {
    thinkingPhase.value = phase
  }

  function appendStreamContent(chunk: string) {
    streamingContent.value += chunk
  }

  function setError(msg: string | null, status: number | null = null) {
    error.value = msg
    errorStatus.value = msg ? status : null
  }

  return {
    messages,
    isStreaming,
    streamingContent,
    thinkingPhase,
    apiKey,
    openaiApiKey,
    selectedModel,
    models,
    providers,
    error,
    errorStatus,
    hasApiKey,
    hasOpenaiApiKey,
    hasActiveApiKey,
    modelOption,
    modelFamily,
    modelDisplayName,
    setApiKey,
    setOpenaiApiKey,
    setSelectedModel,
    configure,
    addUserMessage,
    addAssistantMessage,
    clearMessages,
    setStreaming,
    setThinkingPhase,
    appendStreamContent,
    setError,
  }
})
