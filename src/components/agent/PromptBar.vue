<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useAgentStore, MODEL_OPTIONS } from '@/stores/agent'
import { useCanvasStore } from '@/stores/canvas'
import { useSelectionStore } from '@/stores/selection'
import { getElementAtPath } from '@/services/prompts'
import { sendMessage } from '@/services/agent'

const props = defineProps<{ chatOpen: boolean }>()
const emit = defineEmits<{ toggleChat: [] }>()

const agent = useAgentStore()
const canvas = useCanvasStore()
const selection = useSelectionStore()
const prompt = ref('')
const showApiKey = ref(false)
const apiKeyInput = ref('')
const showModelSelect = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const context = computed(() => {
  const widgets = selection.selectedWidgets
  if (widgets.length === 0) return null

  const widgetNames = widgets.map((w) => w.name)
  const elements: string[] = []

  if (widgets.length === 1 && selection.elementPaths.length > 0) {
    for (const path of selection.elementPaths) {
      const el = getElementAtPath(widgets[0].template, path)
      if (el) {
        const label = (el as Record<string, unknown>).value as string
          ?? (el as Record<string, unknown>).label as string
          ?? (el as Record<string, unknown>).name as string
          ?? ''
        elements.push(label ? `${el.type}: ${String(label).slice(0, 20)}` : el.type)
      }
    }
  }

  return { widgetNames, elements }
})

const apiKeyPlaceholder = computed(() =>
  agent.modelFamily === 'anthropic'
    ? 'Enter your Anthropic API key (sk-ant-...)'
    : 'Enter your OpenAI API key (sk-...)',
)

const modelShortName = computed(() => {
  const opt = agent.modelOption
  // Show a shorter name for the button
  if (opt.family === 'anthropic') {
    return opt.label.replace('Claude ', '')
  }
  return opt.label.replace('ChatGPT ', '')
})

const anthropicModels = MODEL_OPTIONS.filter((m) => m.family === 'anthropic')
const openaiModels = MODEL_OPTIONS.filter((m) => m.family === 'openai')

function resizeTextarea() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  // 3 lines at font-size 14px, line-height 1.5 = 63px, plus 8px padding
  const maxHeight = 63 + 8
  el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
}

watch(prompt, () => {
  nextTick(resizeTextarea)
})

function selectModel(modelId: string) {
  agent.setSelectedModel(modelId)
  showModelSelect.value = false
  // If no API key for the new family, prompt for it
  if (!agent.hasActiveApiKey) {
    showApiKey.value = true
  }
}

async function onSubmit() {
  const text = prompt.value.trim()
  if (!text || agent.isStreaming) return

  if (!agent.hasActiveApiKey) {
    showApiKey.value = true
    return
  }

  prompt.value = ''
  nextTick(resizeTextarea)
  if (!props.chatOpen) emit('toggleChat')
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
    showApiKey.value = false
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
  <div class="prompt-bar-wrap">
    <!-- Model selector dropdown -->
    <Transition name="dropdown">
      <div v-if="showModelSelect" class="prompt-bar__model-dropdown">
        <div class="prompt-bar__model-group">
          <div class="prompt-bar__model-group-label">Anthropic</div>
          <button
            v-for="m in anthropicModels"
            :key="m.id"
            class="prompt-bar__model-option"
            :class="{ 'prompt-bar__model-option--active': m.id === agent.selectedModel }"
            @click="selectModel(m.id)"
          >
            {{ m.label }}
          </button>
        </div>
        <div class="prompt-bar__model-group">
          <div class="prompt-bar__model-group-label">OpenAI</div>
          <button
            v-for="m in openaiModels"
            :key="m.id"
            class="prompt-bar__model-option"
            :class="{ 'prompt-bar__model-option--active': m.id === agent.selectedModel }"
            @click="selectModel(m.id)"
          >
            {{ m.label }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- API key input -->
    <div v-if="showApiKey" class="prompt-bar__apikey">
      <input
        v-model="apiKeyInput"
        type="password"
        :placeholder="apiKeyPlaceholder"
        class="prompt-bar__apikey-input"
        @keydown.enter="saveApiKey"
      />
      <button class="prompt-bar__apikey-save" @click="saveApiKey">Save</button>
      <button class="prompt-bar__apikey-cancel" @click="showApiKey = false">Cancel</button>
    </div>

    <!-- Main prompt bar -->
    <div class="prompt-bar">
      <!-- Context indicator -->
      <div v-if="context" class="prompt-bar__context">
        <span
          v-for="name in context.widgetNames"
          :key="'w-' + name"
          class="prompt-bar__chip"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1" y="1" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          {{ name }}
        </span>
        <template v-if="context.elements.length > 0">
          <span class="prompt-bar__chip-sep">/</span>
          <span
            v-for="(el, i) in context.elements"
            :key="'e-' + i"
            class="prompt-bar__chip prompt-bar__chip--element"
          >
            {{ el }}
          </span>
        </template>
      </div>
      <textarea
        ref="textareaRef"
        v-model="prompt"
        class="prompt-bar__input"
        :placeholder="context ? `Edit ${context.widgetNames[0]}...` : 'What would you like to change or create?'"
        rows="1"
        :disabled="agent.isStreaming"
        @keydown="onKeyDown"
        @input="resizeTextarea"
      />
      <div class="prompt-bar__actions">
        <button
          class="prompt-bar__model-btn"
          data-tooltip="Select model"
          @click="showModelSelect = !showModelSelect"
        >
          {{ modelShortName }}
        </button>
        <div class="prompt-bar__divider" />
        <button class="prompt-bar__action-btn" data-tooltip="API key" @click="showApiKey = !showApiKey">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 6a2 2 0 1 0-4 0 2 2 0 0 0 2 2v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M7 10h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="prompt-bar__divider" />
        <button
          class="prompt-bar__send"
          :disabled="!prompt.trim() || agent.isStreaming"
          @click="onSubmit"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 12V4M4 7l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.prompt-bar-wrap {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 100;
  width: 560px;
  max-width: calc(100vw - 200px);
}

.prompt-bar {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 4px 8px;
  padding: 10px 12px 10px 16px;
  background: var(--studio-glass-bg);
  backdrop-filter: var(--studio-glass-blur);
  -webkit-backdrop-filter: var(--studio-glass-blur);
  border: 1px solid var(--studio-glass-border);
  border-radius: 24px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);

  &__context {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-basis: 100%;
    flex-wrap: wrap;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--studio-border);
    margin-bottom: 2px;
  }

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--studio-accent-soft);
    color: var(--studio-accent);
    font-size: 11px;
    font-weight: 500;
    border-radius: 6px;
    white-space: nowrap;

    &--element {
      background: var(--studio-hover);
      color: var(--studio-text-secondary);
    }
  }

  &__chip-sep {
    color: var(--studio-text-tertiary);
    font-size: 11px;
  }

  &__input {
    flex: 1;
    border: none;
    background: none;
    color: var(--studio-text-primary);
    font-size: 14px;
    font-family: inherit;
    line-height: 1.5;
    resize: none;
    padding: 4px 0;
    min-height: 24px;
    max-height: 71px; // 3 lines (14px * 1.5 * 3) + 8px padding
    overflow-y: auto;

    &::placeholder {
      color: var(--studio-text-tertiary);
    }

    &:focus {
      outline: none;
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  &__model-btn {
    height: 32px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--studio-text-secondary);
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;

    &:hover {
      color: var(--studio-text-primary);
      background: var(--studio-hover);
    }
  }

  &__action-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--studio-text-tertiary);
    cursor: pointer;
    transition: all 0.12s;

    &:hover {
      color: var(--studio-text-primary);
      background: var(--studio-hover);
    }
  }

  &__divider {
    width: 1px;
    height: 20px;
    background: var(--studio-border);
    margin: 0 2px;
  }

  &__send {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 10px;
    background: var(--studio-accent);
    color: #111;
    cursor: pointer;
    transition: all 0.12s;

    &:hover:not(:disabled) {
      background: var(--studio-accent-hover);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  }
}

.prompt-bar__model-dropdown {
  width: 100%;
  padding: 8px;
  background: var(--studio-glass-bg);
  backdrop-filter: var(--studio-glass-blur);
  -webkit-backdrop-filter: var(--studio-glass-blur);
  border: 1px solid var(--studio-glass-border);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prompt-bar__model-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.prompt-bar__model-group-label {
  padding: 4px 10px 2px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--studio-text-tertiary);
}

.prompt-bar__model-option {
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--studio-text-secondary);
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: all 0.12s;

  &:hover {
    background: var(--studio-hover);
    color: var(--studio-text-primary);
  }

  &--active {
    background: var(--studio-accent-soft);
    color: var(--studio-accent);
  }
}

.prompt-bar__apikey {
  width: 100%;
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  background: var(--studio-glass-bg);
  backdrop-filter: var(--studio-glass-blur);
  -webkit-backdrop-filter: var(--studio-glass-blur);
  border: 1px solid var(--studio-glass-border);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}

.prompt-bar__apikey-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--studio-border);
  border-radius: 8px;
  background: var(--studio-bg);
  color: var(--studio-text-primary);
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: var(--studio-accent);
  }
}

.prompt-bar__apikey-save {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: var(--studio-accent);
  color: var(--studio-surface);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.prompt-bar__apikey-cancel {
  padding: 6px 10px;
  border: 1px solid var(--studio-border);
  border-radius: 8px;
  background: none;
  color: var(--studio-text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
