<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentMessage } from '@/stores/agent'
import { useAgentStore } from '@/stores/agent'

const props = defineProps<{
  message: AgentMessage
}>()

const agent = useAgentStore()

const roleLabel = computed(() => {
  if (props.message.role === 'user') return 'You'
  return props.message.model ?? agent.modelDisplayName
})

const expandedTool = ref<number | null>(null)

function toggleTool(i: number) {
  expandedTool.value = expandedTool.value === i ? null : i
}
</script>

<template>
  <div class="agent-message" :class="`agent-message--${message.role}`">
    <div class="agent-message__role">{{ roleLabel }}</div>
    <div class="agent-message__content">{{ message.content }}</div>
    <div v-if="message.toolCalls?.length" class="agent-message__tools">
      <div v-for="(call, i) in message.toolCalls" :key="i" class="agent-message__tool">
        <span class="agent-message__tool-name" @click="toggleTool(i)">{{ call.name }}</span>
        <pre v-if="expandedTool === i" class="agent-message__tool-payload">{{ JSON.stringify(call.input, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.agent-message {
  padding: 8px 12px;
  font-size: 13px;

  &--user {
    .agent-message__role {
      color: var(--studio-text-primary);
    }
  }

  &--assistant {
    background: var(--studio-hover);
    border-radius: 6px;

    .agent-message__role {
      color: var(--studio-accent);
    }
  }

  &__role {
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 2px;
  }

  &__content {
    color: var(--studio-text-primary);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  &__tools {
    margin-top: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  &__tool {
    padding: 2px 8px;
    background: var(--studio-selected);
    border-radius: 4px;
    font-size: 11px;
  }

  &__tool-name {
    color: var(--studio-accent);
    font-family: monospace;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  &__tool-payload {
    margin-top: 4px;
    padding: 6px 8px;
    background: var(--studio-bg);
    border: 1px solid var(--studio-border);
    border-radius: 4px;
    font-size: 11px;
    font-family: monospace;
    color: var(--studio-text-primary);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
  }
}
</style>
