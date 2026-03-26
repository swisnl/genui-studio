<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { sendMessage } from '@/services/agent'
import AgentMessage from './AgentMessage.vue'
import ContextChip from './ContextChip.vue'

const agent = useAgentStore()
const streamingLabel = computed(() => agent.modelDisplayName)
const prompt = ref('')
const messagesEl = ref<HTMLElement | null>(null)
const showApiKeyInput = ref(false)
const apiKeyInput = ref('')

watch(() => agent.messages.length, async () => {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
})

async function onSubmit() {
  const text = prompt.value.trim()
  if (!text || agent.isStreaming) return

  if (!agent.hasActiveApiKey) {
    showApiKeyInput.value = true
    return
  }

  prompt.value = ''
  await sendMessage(text)
}

function saveApiKey() {
  const key = apiKeyInput.value.trim()
  if (key) {
    if (agent.modelFamily === 'anthropic') {
      agent.setApiKey(key)
    } else {
      agent.setOpenaiApiKey(key)
    }
    apiKeyInput.value = ''
    showApiKeyInput.value = false
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    onSubmit()
  }
}
</script>

<template>
  <div class="agent-panel">
    <div class="agent-panel__header">
      <span class="agent-panel__title">Agent</span>
      <button
        class="agent-panel__settings"
        :title="agent.hasApiKey ? 'API key set' : 'Set API key'"
        @click="showApiKeyInput = !showApiKeyInput"
      >
        {{ agent.hasApiKey ? '●' : '○' }}
      </button>
    </div>

    <div v-if="showApiKeyInput" class="agent-panel__api-key">
      <input
        v-model="apiKeyInput"
        type="password"
        :placeholder="agent.modelFamily === 'anthropic' ? 'sk-ant-...' : 'sk-...'"
        class="agent-panel__api-key-input"
        @keydown.enter="saveApiKey"
      />
      <button class="agent-panel__api-key-save" @click="saveApiKey">Save</button>
    </div>

    <ContextChip />

    <div ref="messagesEl" class="agent-panel__messages">
      <AgentMessage
        v-for="msg in agent.messages"
        :key="msg.id"
        :message="msg"
      />
      <div v-if="agent.isStreaming" class="agent-panel__streaming">
        <div class="agent-panel__streaming-role">{{ streamingLabel }}</div>
        <div class="agent-panel__streaming-content">{{ agent.streamingContent || '...' }}</div>
      </div>
      <div v-if="agent.error" class="agent-panel__error">
        {{ agent.error }}
      </div>
      <div v-if="agent.messages.length === 0 && !agent.isStreaming" class="agent-panel__empty">
        Ask Claude to create or edit widgets
      </div>
    </div>

    <div class="agent-panel__input">
      <textarea
        v-model="prompt"
        class="agent-panel__textarea"
        placeholder="Ask Claude..."
        rows="2"
        :disabled="agent.isStreaming"
        @keydown="onKeyDown"
      />
      <button
        class="agent-panel__send"
        :disabled="!prompt.trim() || agent.isStreaming"
        @click="onSubmit"
      >
        ▶
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px 8px;
  }

  &__title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--studio-text-secondary);
  }

  &__settings {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--studio-accent);
    padding: 0;
  }

  &__api-key {
    display: flex;
    gap: 4px;
    padding: 4px 12px 8px;
  }

  &__api-key-input {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid var(--studio-border);
    border-radius: 4px;
    font-size: 12px;
    background: var(--studio-bg);
    color: var(--studio-text-primary);
  }

  &__api-key-save {
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: var(--studio-accent);
    color: #111;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  &__messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__streaming {
    padding: 8px 12px;
    background: var(--studio-hover);
    border-radius: 6px;
    font-size: 13px;
  }

  &__streaming-role {
    font-size: 11px;
    font-weight: 600;
    color: var(--studio-accent);
    margin-bottom: 2px;
  }

  &__streaming-content {
    color: var(--studio-text-primary);
    white-space: pre-wrap;
  }

  &__error {
    padding: 8px 12px;
    background: var(--studio-danger-soft);
    border-radius: 6px;
    color: var(--studio-danger);
    font-size: 12px;
  }

  &__empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--studio-text-tertiary);
    font-size: 13px;
  }

  &__input {
    display: flex;
    gap: 6px;
    padding: 8px 12px 12px;
    border-top: 1px solid var(--studio-border);
  }

  &__textarea {
    flex: 1;
    padding: 8px;
    border: 1px solid var(--studio-border);
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    resize: none;
    background: var(--studio-bg);
    color: var(--studio-text-primary);

    &:focus {
      outline: none;
      border-color: var(--studio-accent);
    }
  }

  &__send {
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: var(--studio-accent);
    color: #111;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    align-self: flex-end;
    transition: background 0.15s;

    &:hover:not(:disabled) {
      background: var(--studio-accent-hover);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  }
}
</style>
