<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useAgentStore } from '@/stores/agent'
import AgentMessage from './AgentMessage.vue'

defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const agent = useAgentStore()
const streamingLabel = computed(() => agent.modelDisplayName)
const messagesEl = ref<HTMLElement | null>(null)

watch(() => agent.messages.length, async () => {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
})
</script>

<template>
  <Transition name="chat-card">
    <div v-if="visible" class="chat-card">
      <div class="chat-card__header">
        <div class="chat-card__header-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.3"/>
            <circle cx="8" cy="8" r="2" fill="currentColor"/>
          </svg>
        </div>
        <div class="chat-card__header-text">
          <span class="chat-card__title">Agent Log</span>
        </div>
        <button class="chat-card__close" @click="emit('close')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div ref="messagesEl" class="chat-card__messages">
        <AgentMessage
          v-for="msg in agent.messages"
          :key="msg.id"
          :message="msg"
        />
        <div v-if="agent.isStreaming" class="chat-card__streaming">
          <div class="chat-card__thinking" v-if="!agent.streamingContent">
            <div class="chat-card__thinking-dots">
              <span /><span /><span />
            </div>
            <span class="chat-card__thinking-label">{{ agent.thinkingPhase || 'Thinking' }}</span>
          </div>
          <template v-else>
            <div class="chat-card__streaming-label">{{ streamingLabel }}</div>
            <div class="chat-card__streaming-text">{{ agent.streamingContent }}</div>
          </template>
        </div>
        <div v-if="agent.error" class="chat-card__error">
          {{ agent.error }}
        </div>
        <div v-if="agent.messages.length === 0 && !agent.isStreaming" class="chat-card__empty">
          Conversation history will appear here
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.chat-card {
  position: fixed;
  left: 16px;
  bottom: 72px;
  width: 320px;
  max-height: 480px;
  display: flex;
  flex-direction: column;
  background: var(--studio-glass-bg);
  backdrop-filter: var(--studio-glass-blur);
  -webkit-backdrop-filter: var(--studio-glass-blur);
  border: 1px solid var(--studio-glass-border);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 90;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--studio-border);
  }

  &__header-icon {
    color: var(--studio-accent);
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--studio-text-primary);
  }

  &__close {
    margin-left: auto;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--studio-text-tertiary);
    cursor: pointer;

    &:hover {
      color: var(--studio-text-primary);
      background: var(--studio-hover);
    }
  }

  &__messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__streaming {
    padding: 10px 12px;
    background: var(--studio-hover);
    border-radius: 10px;
    font-size: 13px;
  }

  &__thinking {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__thinking-dots {
    display: flex;
    gap: 4px;

    span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--studio-accent);
      animation: thinking-pulse 1.4s ease-in-out infinite;

      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }
  }

  &__thinking-label {
    font-size: 12px;
    color: var(--studio-text-secondary);
    font-weight: 500;
  }

  &__streaming-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--studio-accent);
    margin-bottom: 2px;
  }

  &__streaming-text {
    color: var(--studio-text-primary);
    white-space: pre-wrap;
  }

  &__error {
    padding: 8px 10px;
    background: var(--studio-danger-soft);
    border-radius: 10px;
    color: var(--studio-danger);
    font-size: 12px;
  }

  &__empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: var(--studio-text-tertiary);
    font-size: 13px;
    text-align: center;
  }
}

@keyframes thinking-pulse {
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

.chat-card-enter-active,
.chat-card-leave-active {
  transition: all 0.2s ease;
}

.chat-card-enter-from,
.chat-card-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
