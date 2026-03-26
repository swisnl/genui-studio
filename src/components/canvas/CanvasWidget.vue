<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { DynamicWidget, applyTheme, type ThemeConfig } from '@swis/genui-widgets'
import { useSelectionStore } from '@/stores/selection'
import type { CanvasWidget } from '@/types/canvas'
import { compileJsx } from '@/services/jsx-compiler'
import ElementHighlight from './ElementHighlight.vue'
import WidgetEditor from './WidgetEditor.vue'

const props = defineProps<{
  widget: CanvasWidget
  selected: boolean
  animating: boolean
  theme: ThemeConfig
  scale: number
}>()

const emit = defineEmits<{
  select: [id: string, event: PointerEvent]
  dragStart: [id: string, event: PointerEvent]
}>()

const selection = useSelectionStore()
const widgetEl = ref<HTMLElement | null>(null)
const showTemplateViewer = ref(false)

const style = computed(() => ({
  left: props.widget.position.x + 'px',
  top: props.widget.position.y + 'px',
}))

onMounted(() => {
  if (widgetEl.value) {
    applyTheme(widgetEl.value, props.theme)
  }
})

watch(() => props.theme, (t) => {
  if (widgetEl.value) applyTheme(widgetEl.value, t)
}, { deep: true })

function onPointerDown(e: PointerEvent) {
  emit('select', props.widget.id, e)
  if (!props.widget.locked) {
    emit('dragStart', props.widget.id, e)
  }
}

function openTemplateViewer(e: MouseEvent) {
  e.stopPropagation()
  showTemplateViewer.value = true
}

function downloadWidget(e: MouseEvent) {
  e.stopPropagation()

  // Encode the view + defaultState into URL-safe base64
  const payload = JSON.stringify({
    id: props.widget.id,
    name: props.widget.name,
    view: props.widget.templateSource ?? '',
    defaultState: props.widget.previewData ?? {},
    states: [],
  })
  const b64 = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  // Compile JSX → nunjucks template
  let nunjucksTemplate = ''
  try {
    nunjucksTemplate = compileJsx(props.widget.templateSource ?? '')
  } catch {
    // If compilation fails, leave empty
  }

  const widgetFile = {
    version: '1.0',
    name: props.widget.name,
    encodedWidget: b64,
    template: nunjucksTemplate,
    outputJsonPreview: props.widget.template,
    jsonSchema: props.widget.schema ?? {},
  }

  const blob = new Blob([JSON.stringify(widgetFile, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.widget.name.replace(/\s+/g, '-').toLowerCase()}.widget`
  a.click()
  URL.revokeObjectURL(url)
}

</script>

<template>
  <div
    class="canvas-widget"
    :class="{
      'canvas-widget--selected': selected,
      'canvas-widget--locked': widget.locked,
      'canvas-widget--animating': animating,
    }"
    :style="style"
    @pointerdown.left="onPointerDown"
  >
    <!-- Widget name label -->
    <div v-if="selected" class="canvas-widget__label">
      <span>{{ widget.name }}</span>
      <button
        class="canvas-widget__label-btn"
        @click="openTemplateViewer"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4 2L1 6l3 4M8 2l3 4-3 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="canvas-widget__tooltip">Edit</span>
      </button>
      <button
        class="canvas-widget__label-btn"
        @click="downloadWidget"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2v6M3.5 6L6 8.5 8.5 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 9.5h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <span class="canvas-widget__tooltip">Download .widget</span>
      </button>
    </div>

    <!-- Widget render -->
    <div class="canvas-widget__inner" @dragstart.prevent>
      <div ref="widgetEl" class="canvas-widget__content genui-widget-root">
        <DynamicWidget :template="widget.template" />
      </div>
      <ElementHighlight
        v-if="selected && (selection.elementPaths.length > 0 || selection.hoveredElementPath)"
        :template="widget.template"
        :selected-paths="selection.elementPaths"
        :hovered-path="selection.hoveredElementPath"
        :container-el="widgetEl"
        :scale="scale"
      />
    </div>

    <!-- Selection border -->
    <div v-if="selected" class="canvas-widget__selection-ring" />

    <!-- Template viewer popup -->
    <Teleport to="body">
      <WidgetEditor
        v-if="showTemplateViewer"
        :widget="widget"
        :theme="theme"
        @close="showTemplateViewer = false"
      />
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.canvas-widget {
  position: absolute;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  background: var(--studio-surface);
  border: 1px solid var(--studio-border);
  transition: box-shadow 0.15s, border-color 0.15s;
  padding: 12px;
  user-select: none;

  &--animating {
    transition: left 0.35s cubic-bezier(0.4, 0, 0.2, 1), top 0.35s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s, border-color 0.15s;
  }

  &--selected {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    border-color: var(--studio-accent);
  }

  &--locked {
    opacity: 0.7;
  }

  &__label {
    position: absolute;
    bottom: 100%;
    left: 20px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: var(--studio-accent);
    color: var(--studio-surface);
    font-size: 11px;
    font-weight: 600;
    border-radius: 6px 6px 0 0;
    white-space: nowrap;
    z-index: 2;
  }

  &__label-btn {
    position: relative;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 4px;
    background: var(--studio-surface-accent);
    color: var(--studio-surface);
    cursor: pointer;
    padding: 0;

    &:hover {
      background: rgba(0, 0, 0, 0.25);
    }

    &:hover .canvas-widget__tooltip {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      pointer-events: auto;
    }
  }

  &__tooltip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%) translateY(4px);
    background: var(--studio-surface-raised, #1c2128);
    color: var(--studio-text-primary, #c9d1d9);
    font-size: 11px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s, transform 0.15s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  &__inner {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
  }

  &__content {
    overflow: auto;
    pointer-events: none;

    .canvas-widget--selected & {
      pointer-events: auto;
    }
  }

  &__selection-ring {
    position: absolute;
    inset: -1px;
    border: 2px solid var(--studio-accent);
    border-radius: 20px;
    pointer-events: none;
  }
}
</style>
