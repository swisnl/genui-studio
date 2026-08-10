import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: { name: string; input: Record<string, unknown> }[]
  timestamp: number
  model?: string
}

export type ModelFamily = 'anthropic' | 'openai'

export interface ModelOption {
  id: string
  label: string
  family: ModelFamily
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', family: 'anthropic' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', family: 'anthropic' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', family: 'anthropic' },
  { id: 'gpt-5.6-sol', label: 'ChatGPT 5.6 - Sol', family: 'openai' },
  { id: 'gpt-5.6-terra', label: 'ChatGPT 5.6 - Terra', family: 'openai' },
  { id: 'gpt-5.6-luna', label: 'ChatGPT 5.6 - Luna', family: 'openai' },
]

export const useAgentStore = defineStore('agent', () => {
  const messages = ref<AgentMessage[]>([])
  const isStreaming = ref(false)
  const streamingContent = ref('')
  const thinkingPhase = ref<string | null>(null)
  const apiKey = ref(localStorage.getItem('genui-studio-api-key') ?? '')
  const openaiApiKey = ref(localStorage.getItem('genui-studio-openai-api-key') ?? '')
  const selectedModel = ref(localStorage.getItem('genui-studio-selected-model') ?? 'gpt-5.6-luna')
  const error = ref<string | null>(null)

  const hasApiKey = computed(() => apiKey.value.length > 0)
  const hasOpenaiApiKey = computed(() => openaiApiKey.value.length > 0)

  const modelOption = computed(() => MODEL_OPTIONS.find((m) => m.id === selectedModel.value) ?? MODEL_OPTIONS[1])
  const modelFamily = computed<ModelFamily>(() => modelOption.value.family)
  const modelDisplayName = computed(() => modelOption.value.label)
  const hasActiveApiKey = computed(() =>
    modelFamily.value === 'anthropic' ? hasApiKey.value : hasOpenaiApiKey.value,
  )

  function setApiKey(key: string) {
    apiKey.value = key
    if (key) {
      localStorage.setItem('genui-studio-api-key', key)
    } else {
      localStorage.removeItem('genui-studio-api-key')
    }
  }

  function setOpenaiApiKey(key: string) {
    openaiApiKey.value = key
    if (key) {
      localStorage.setItem('genui-studio-openai-api-key', key)
    } else {
      localStorage.removeItem('genui-studio-openai-api-key')
    }
  }

  function setSelectedModel(modelId: string) {
    selectedModel.value = modelId
    localStorage.setItem('genui-studio-selected-model', modelId)
  }

  function addUserMessage(content: string): AgentMessage {
    const msg: AgentMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
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

  function setThinkingPhase(phase: string | null) {
    thinkingPhase.value = phase
  }

  function appendStreamContent(chunk: string) {
    streamingContent.value += chunk
  }

  function setError(msg: string | null) {
    error.value = msg
  }

  return {
    messages,
    isStreaming,
    streamingContent,
    thinkingPhase,
    apiKey,
    openaiApiKey,
    selectedModel,
    error,
    hasApiKey,
    hasOpenaiApiKey,
    hasActiveApiKey,
    modelOption,
    modelFamily,
    modelDisplayName,
    setApiKey,
    setOpenaiApiKey,
    setSelectedModel,
    addUserMessage,
    addAssistantMessage,
    clearMessages,
    setStreaming,
    setThinkingPhase,
    appendStreamContent,
    setError,
  }
})
