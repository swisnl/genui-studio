<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { DynamicWidget, applyTheme, resolveTemplate, type ThemeConfig, type WidgetTemplate } from '@swis/genui-widgets'
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'
import { json as jsonLang } from '@codemirror/lang-json'
import {
  jsxLanguage,
  jsxHighlightStyle,
  jsxAutocomplete,
  jsxLinter,
} from '@/services/jsx-codemirror'
import { compileJsx } from '@/services/jsx-compiler'
import { decompileToJsx } from '@/services/jsx-decompiler'
import { useCanvasStore } from '@/stores/canvas'
import type { CanvasWidget } from '@/types/canvas'

const props = defineProps<{
  widget: CanvasWidget
  theme: ThemeConfig
}>()

const emit = defineEmits<{ close: [] }>()

const canvas = useCanvasStore()
const previewEl = ref<HTMLElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)
const jsxEditorEl = ref<HTMLElement | null>(null)
const schemaEditorEl = ref<HTMLElement | null>(null)
const previewDataEditorEl = ref<HTMLElement | null>(null)

const leftPercent = ref(50)
const isDragging = ref(false)
const drawerOpen = ref(false)
const drawerHeight = ref(240)
const isDraggingDrawer = ref(false)
const activeTab = ref<'schema' | 'previewData'>('previewData')
const copied = ref(false)

const compilationError = ref<string | null>(null)
const lastValidTemplate = ref<WidgetTemplate | null>(null)

// The live template for preview
const previewTemplate = computed(() => lastValidTemplate.value ?? props.widget.template)

// Nunjucks template context for preview
const previewContext = ref<Record<string, unknown>>(props.widget.previewData ?? {})

const leftStyle = computed(() => ({ width: `${leftPercent.value}%` }))
const rightStyle = computed(() => ({ width: `${100 - leftPercent.value}%` }))

// Editor instances
let jsxEditor: EditorView | null = null
let schemaEditor: EditorView | null = null
let previewDataEditor: EditorView | null = null

// Debounce timer for compilation
let compileTimeout: ReturnType<typeof setTimeout> | null = null

function getInitialJsx(): string {
  if (props.widget.templateSource) return props.widget.templateSource
  try {
    return decompileToJsx(props.widget.template)
  } catch {
    return ''
  }
}

function compileAndUpdate(source: string) {
  try {
    const nunjucksStr = compileJsx(source)
    const resolved = resolveTemplate(nunjucksStr, previewContext.value)
    lastValidTemplate.value = resolved
    compilationError.value = null

    // Persist to widget
    canvas.updateWidgetSource(
      props.widget.id,
      source,
      props.widget.schema,
      previewContext.value,
    )
  } catch (err) {
    compilationError.value = err instanceof Error ? err.message : String(err)
  }
}

function onJsxChange(doc: string) {
  if (compileTimeout) clearTimeout(compileTimeout)
  compileTimeout = setTimeout(() => compileAndUpdate(doc), 300)
}

function onPreviewDataChange(doc: string) {
  try {
    const parsed = JSON.parse(doc)
    previewContext.value = parsed

    // Re-resolve with new data
    const jsxSource = jsxEditor?.state.doc.toString() ?? ''
    if (jsxSource.trim()) {
      compileAndUpdate(jsxSource)
    }

    // Persist previewData
    const w = canvas.getWidget(props.widget.id)
    if (w) w.previewData = parsed
  } catch {
    // Invalid JSON, ignore
  }
}

function onSchemaChange(doc: string) {
  try {
    const parsed = JSON.parse(doc)
    const w = canvas.getWidget(props.widget.id)
    if (w) w.schema = parsed
  } catch {
    // Invalid JSON, ignore
  }
}

function createJsxEditor(parent: HTMLElement, doc: string): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      jsxLanguage,
      jsxHighlightStyle,
      jsxAutocomplete,
      jsxLinter,
      oneDark,
      keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onJsxChange(update.state.doc.toString())
        }
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '13px' },
        '.cm-scroller': { overflow: 'auto', fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace" },
        '.cm-content': { caretColor: 'var(--studio-accent, #7ee787)' },
        '.cm-gutters': { background: '#0d1117', borderRight: '1px solid #21262d' },
      }),
    ],
  })
  const view = new EditorView({ state, parent })
  // Expose for testing
  ;(parent as any).__cmView = view
  return view
}

function createJsonEditor(parent: HTMLElement, doc: string, onChange: (doc: string) => void): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      jsonLang(),
      oneDark,
      keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString())
        }
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '12px' },
        '.cm-scroller': { overflow: 'auto', fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace" },
        '.cm-gutters': { background: '#0d1117', borderRight: '1px solid #21262d' },
      }),
    ],
  })
  return new EditorView({ state, parent })
}

function copyTemplate() {
  const source = jsxEditor?.state.doc.toString() ?? ''
  navigator.clipboard.writeText(source)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

// Horizontal resizer
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

// Drawer resizer
function onDrawerResizerPointerDown(e: PointerEvent) {
  isDraggingDrawer.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onDrawerResizerPointerMove(e: PointerEvent) {
  if (!isDraggingDrawer.value || !bodyEl.value) return
  const containerRect = bodyEl.value.parentElement!.getBoundingClientRect()
  const fromBottom = containerRect.bottom - e.clientY
  drawerHeight.value = Math.min(500, Math.max(120, fromBottom))
}

function onDrawerResizerPointerUp() {
  isDraggingDrawer.value = false
}

onMounted(async () => {
  if (previewEl.value) {
    applyTheme(previewEl.value, props.theme)
  }

  await nextTick()

  // Initialize JSX editor
  if (jsxEditorEl.value) {
    jsxEditor = createJsxEditor(jsxEditorEl.value, getInitialJsx())
  }

  // Initialize JSON editors for drawer
  initDrawerEditors()

  // Compile initial source
  const initialSource = getInitialJsx()
  if (initialSource.trim()) {
    compileAndUpdate(initialSource)
  }
})

function initDrawerEditors() {
  if (schemaEditorEl.value && !schemaEditor) {
    schemaEditor = createJsonEditor(
      schemaEditorEl.value,
      JSON.stringify(props.widget.schema ?? { type: 'object', properties: {} }, null, 2),
      onSchemaChange,
    )
  }
  if (previewDataEditorEl.value && !previewDataEditor) {
    previewDataEditor = createJsonEditor(
      previewDataEditorEl.value,
      JSON.stringify(props.widget.previewData ?? {}, null, 2),
      onPreviewDataChange,
    )
  }
}

watch(drawerOpen, async (open) => {
  if (open) {
    await nextTick()
    initDrawerEditors()
  }
})

watch(() => props.theme, (t) => {
  if (previewEl.value) applyTheme(previewEl.value, t)
}, { deep: true })

onUnmounted(() => {
  jsxEditor?.destroy()
  schemaEditor?.destroy()
  previewDataEditor?.destroy()
  if (compileTimeout) clearTimeout(compileTimeout)
})
</script>

<template>
  <div class="we-backdrop" @click="onBackdropClick">
    <div class="we" :class="{ 'we--dragging': isDragging || isDraggingDrawer }">
      <div class="we__header">
        <span class="we__title">{{ widget.name }}</span>
        <div class="we__actions">
          <button class="we__btn" :title="copied ? 'Copied!' : 'Copy JSX'" @click="copyTemplate">
            <svg v-if="!copied" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/>
              <path d="M10 4V3.5A1.5 1.5 0 0 0 8.5 2h-5A1.5 1.5 0 0 0 2 3.5v5A1.5 1.5 0 0 0 3.5 10H4" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7.5l3 3 5-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
          <button
            class="we__btn"
            :class="{ 'we__btn--active': drawerOpen }"
            @click="drawerOpen = !drawerOpen"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.2"/>
              <line x1="1" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            Data
          </button>
          <button class="we__close" title="Close" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div
        ref="bodyEl"
        class="we__body"
      >
        <!-- Left: JSX Editor -->
        <div class="we__code" :style="leftStyle">
          <div class="we__code-label">Template (JSX)</div>
          <div ref="jsxEditorEl" class="we__editor" />
        </div>

        <!-- Horizontal resizer -->
        <div
          class="we__resizer"
          @pointerdown="onResizerPointerDown"
          @pointermove="onResizerPointerMove"
          @pointerup="onResizerPointerUp"
        >
          <div class="we__resizer-handle"><span /><span /><span /></div>
        </div>

        <!-- Right: Live Preview -->
        <div class="we__preview" :style="rightStyle">
          <div class="we__preview-label">
            Preview
            <span v-if="compilationError" class="we__error-badge">Error</span>
          </div>
          <div ref="previewEl" class="we__preview-content genui-widget-root">
            <div v-if="compilationError" class="we__error-banner">
              {{ compilationError }}
            </div>
            <DynamicWidget
              :template="previewTemplate"
              :template-context="previewContext"
            />
          </div>
        </div>
      </div>

      <!-- Bottom drawer -->
      <div
        v-if="drawerOpen"
        class="we__drawer"
        :style="{ height: drawerHeight + 'px' }"
      >
        <!-- Drawer resizer -->
        <div
          class="we__drawer-resizer"
          @pointerdown="onDrawerResizerPointerDown"
          @pointermove="onDrawerResizerPointerMove"
          @pointerup="onDrawerResizerPointerUp"
        >
          <div class="we__drawer-resizer-handle" />
        </div>

        <!-- Tabs -->
        <div class="we__drawer-tabs">
          <button
            class="we__drawer-tab"
            :class="{ 'we__drawer-tab--active': activeTab === 'previewData' }"
            @click="activeTab = 'previewData'"
          >
            Preview Data
          </button>
          <button
            class="we__drawer-tab"
            :class="{ 'we__drawer-tab--active': activeTab === 'schema' }"
            @click="activeTab = 'schema'"
          >
            Schema
          </button>
        </div>

        <!-- Editor panels -->
        <div class="we__drawer-content">
          <div v-show="activeTab === 'schema'" ref="schemaEditorEl" class="we__editor" />
          <div v-show="activeTab === 'previewData'" ref="previewDataEditorEl" class="we__editor" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.we-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  backdrop-filter: blur(4px);
}

.we {
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

  &--dragging {
    user-select: none;

    .we__editor,
    .we__preview-content {
      pointer-events: none;
    }
  }

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

    &--active {
      color: var(--studio-accent);
      border-color: var(--studio-accent);
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
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__editor {
    flex: 1;
    overflow: hidden;
    background: #0d1117;

    :deep(.cm-editor) {
      height: 100%;
    }
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
    .we--dragging & {
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

      .we__resizer:hover &,
      .we--dragging .we__resizer & {
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

  &__error-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(248, 81, 73, 0.2);
    color: #f85149;
  }

  &__error-banner {
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid rgba(248, 81, 73, 0.3);
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 12px;
    font-size: 12px;
    line-height: 1.5;
    color: #f85149;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    white-space: pre-wrap;
    width: 100%;
  }

  // Bottom drawer
  &__drawer {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--studio-border);
    background: var(--studio-surface-raised);
    overflow: hidden;
  }

  &__drawer-resizer {
    height: 6px;
    flex-shrink: 0;
    cursor: row-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--studio-border);
    transition: background 0.15s;

    &:hover {
      background: var(--studio-accent);
    }
  }

  &__drawer-resizer-handle {
    width: 40px;
    height: 2px;
    border-radius: 1px;
    background: rgba(255, 255, 255, 0.3);
    pointer-events: none;
  }

  &__drawer-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--studio-border-subtle);
    flex-shrink: 0;
  }

  &__drawer-tab {
    padding: 8px 16px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--studio-text-tertiary);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: inherit;

    &:hover {
      color: var(--studio-text-secondary);
    }

    &--active {
      color: var(--studio-accent);
      border-bottom-color: var(--studio-accent);
    }
  }

  &__drawer-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;

    > div {
      position: absolute;
      inset: 0;
    }
  }
}
</style>
