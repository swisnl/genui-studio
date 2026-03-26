<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { DynamicWidget, applyTheme, type ThemeConfig } from '@swis/genui-widgets'
import type { CanvasWidget } from '@/types/canvas'

const props = defineProps<{
  widget: CanvasWidget
  theme: ThemeConfig
}>()

const emit = defineEmits<{ close: [] }>()

const previewEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)
const copied = ref(false)
const leftPercent = ref(50)
const isDragging = ref(false)

const templateJSON = computed(() => JSON.stringify(props.widget.template, null, 2))
const leftStyle = computed(() => ({ width: `${leftPercent.value}%` }))
const rightStyle = computed(() => ({ width: `${100 - leftPercent.value}%` }))

onMounted(() => {
  if (previewEl.value) {
    applyTheme(previewEl.value, props.theme)
  }
})

function copyTemplate() {
  navigator.clipboard.writeText(templateJSON.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

function onResizerPointerDown(e: PointerEvent) {
  isDragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onResizerPointerMove(e: PointerEvent) {
  if (!isDragging.value || !bodyEl.value) return
  const rect = bodyEl.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  leftPercent.value = Math.min(80, Math.max(20, (x / rect.width) * 100))
}

function onResizerPointerUp() {
  isDragging.value = false
}
</script>

<template>
  <div class="tv-backdrop" @click="onBackdropClick">
    <div class="tv">
      <div class="tv__header">
        <span class="tv__title">{{ widget.name }}</span>
        <div class="tv__actions">
          <button class="tv__btn" :title="copied ? 'Copied!' : 'Copy JSON'" @click="copyTemplate">
            <svg v-if="!copied" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/>
              <path d="M10 4V3.5A1.5 1.5 0 0 0 8.5 2h-5A1.5 1.5 0 0 0 2 3.5v5A1.5 1.5 0 0 0 3.5 10H4" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7.5l3 3 5-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
          <button class="tv__close" title="Close" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div
        ref="bodyEl"
        class="tv__body"
        :class="{ 'tv__body--dragging': isDragging }"
      >
        <div class="tv__code" :style="leftStyle">
          <div class="tv__code-label">Template</div>
          <pre class="tv__pre">{{ templateJSON }}</pre>
        </div>

        <div
          class="tv__resizer"
          @pointerdown="onResizerPointerDown"
          @pointermove="onResizerPointerMove"
          @pointerup="onResizerPointerUp"
        >
          <div class="tv__resizer-handle">
            <span /><span /><span />
          </div>
        </div>

        <div class="tv__preview" :style="rightStyle">
          <div class="tv__preview-label">Preview</div>
          <div ref="previewEl" class="tv__preview-content genui-widget-root">
            <DynamicWidget :template="widget.template" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tv-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  backdrop-filter: blur(4px);
}

.tv {
  width: 90vw;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: var(--studio-surface-raised);
  border: 1px solid var(--studio-border);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--studio-border);
    flex-shrink: 0;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--studio-text-primary);
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border: 1px solid var(--studio-border);
    border-radius: 8px;
    background: none;
    color: var(--studio-text-secondary);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;

    &:hover {
      color: var(--studio-text-primary);
      background: var(--studio-hover);
    }
  }

  &__close {
    width: 32px;
    height: 32px;
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

  &__body {
    display: flex;
    flex: 1;
    min-height: 0;

    &--dragging {
      cursor: col-resize;
      user-select: none;

      .tv__pre,
      .tv__preview-content {
        pointer-events: none;
      }
    }
  }

  &__code {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    flex-shrink: 0;
  }

  &__code-label,
  &__preview-label {
    padding: 8px 16px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--studio-text-tertiary);
    border-bottom: 1px solid var(--studio-border-subtle);
    flex-shrink: 0;
  }

  &__pre {
    flex: 1;
    overflow: auto;
    padding: 16px;
    margin: 0;
    background: #0a0a0a;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--studio-accent);
    white-space: pre;
    tab-size: 2;
  }

  &__resizer {
    width: 8px;
    flex-shrink: 0;
    background: var(--studio-border);
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    position: relative;

    &:hover,
    .tv__body--dragging & {
      background: var(--studio-accent);
    }
  }

  &__resizer-handle {
    display: flex;
    flex-direction: column;
    gap: 3px;
    pointer-events: none;

    span {
      display: block;
      width: 2px;
      height: 2px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.4);

      .tv__resizer:hover &,
      .tv__body--dragging .tv__resizer & {
        background: rgba(0, 0, 0, 0.5);
      }
    }
  }

  &__preview {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    flex-shrink: 0;
  }

  &__preview-content {
    flex: 1;
    overflow: auto;
    padding: 16px;
    display: flex;

    .genui-card-wrapper {
      margin-inline: auto;
    }
  }
}
</style>
