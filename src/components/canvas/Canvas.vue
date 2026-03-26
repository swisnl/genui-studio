<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useSelectionStore } from '@/stores/selection'
import { useThemeStore } from '@/stores/theme'
import { parseWidgetFile } from '@/services/widgetImport'
import CanvasGrid from './CanvasGrid.vue'
import CanvasWidget from './CanvasWidget.vue'
import ThemeCard from './ThemeCard.vue'

const canvas = useCanvasStore()
const selection = useSelectionStore()
const theme = useThemeStore()

const containerEl = ref<HTMLElement | null>(null)
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const spaceHeld = ref(false)

// Drag state
const dragWidgetId = ref<string | null>(null)
const dragStart = ref({ x: 0, y: 0 })
const dragWidgetStart = ref({ x: 0, y: 0 })

// Theme card drag state
const draggingThemeCard = ref(false)
const themeCardDragStart = ref({ x: 0, y: 0 })

const transformStyle = computed(() => ({
  transform: `translate(${canvas.viewport.x}px, ${canvas.viewport.y}px) scale(${canvas.viewport.scale})`,
  transformOrigin: '0 0',
}))

function onCanvasPointerDown(e: PointerEvent) {
  if (e.button === 1 || spaceHeld.value) {
    isPanning.value = true
    panStart.value = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
    return
  }
  // Click on empty canvas deselects
  if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas-layer')) {
    selection.clearSelection()
  }
}

function onCanvasPointerMove(e: PointerEvent) {
  if (isPanning.value) {
    const dx = e.clientX - panStart.value.x
    const dy = e.clientY - panStart.value.y
    panStart.value = { x: e.clientX, y: e.clientY }
    canvas.pan(dx, dy)
    return
  }

  if (draggingThemeCard.value) {
    const dx = (e.clientX - dragStart.value.x) / canvas.viewport.scale
    const dy = (e.clientY - dragStart.value.y) / canvas.viewport.scale
    theme.setThemeCardPosition({
      x: themeCardDragStart.value.x + dx,
      y: themeCardDragStart.value.y + dy,
    })
    return
  }

  if (dragWidgetId.value) {
    const dx = (e.clientX - dragStart.value.x) / canvas.viewport.scale
    const dy = (e.clientY - dragStart.value.y) / canvas.viewport.scale
    canvas.updateWidgetPosition(dragWidgetId.value, {
      x: dragWidgetStart.value.x + dx,
      y: dragWidgetStart.value.y + dy,
    })
    return
  }
}

function onCanvasPointerUp() {
  if (dragWidgetId.value) {
    dragWidgetId.value = null
  }
  draggingThemeCard.value = false
  isPanning.value = false
}

function onThemeCardDragStart(e: PointerEvent) {
  draggingThemeCard.value = true
  dragStart.value = { x: e.clientX, y: e.clientY }
  themeCardDragStart.value = { ...theme.themeCardPosition }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    canvas.zoom(factor, e.clientX, e.clientY)
  } else {
    canvas.pan(-e.deltaX, -e.deltaY)
  }
}

function onWidgetSelect(id: string, e: PointerEvent) {
  selection.selectWidget(id, e.shiftKey)
}

function onWidgetDragStart(id: string, e: PointerEvent) {
  const w = canvas.getWidget(id)
  if (!w) return
  dragWidgetId.value = id
  dragStart.value = { x: e.clientX, y: e.clientY }
  dragWidgetStart.value = { ...w.position }
  canvas.bringToFront(id)
}

// File drop state
const isDroppingFile = ref(false)
const dropGhost = ref({ x: 0, y: 0 })
let dragCounter = 0

function hasWidgetFile(e: DragEvent): boolean {
  if (!e.dataTransfer) return false
  for (const item of Array.from(e.dataTransfer.items)) {
    if (item.kind === 'file') return true
  }
  return false
}

function screenToCanvas(clientX: number, clientY: number) {
  return {
    x: (clientX - canvas.viewport.x) / canvas.viewport.scale,
    y: (clientY - canvas.viewport.y) / canvas.viewport.scale,
  }
}

function onDragEnter(e: DragEvent) {
  if (!hasWidgetFile(e)) return
  dragCounter++
  isDroppingFile.value = true
  e.preventDefault()
}

function onDragOver(e: DragEvent) {
  if (!isDroppingFile.value) return
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'copy'
  dropGhost.value = { x: e.clientX, y: e.clientY }
}

function onDragLeave(e: DragEvent) {
  if (!hasWidgetFile(e)) return
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDroppingFile.value = false
  }
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  isDroppingFile.value = false
  dragCounter = 0

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  const basePos = screenToCanvas(e.clientX, e.clientY)
  const offset = 65 // Offset between dropped widgets to avoid stacking

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const text = await file.text()
    const data = parseWidgetFile(text)
    if (!data) continue

    // Offset each widget to create a cascading layout
    const pos = {
      x: basePos.x + i * offset,
      y: basePos.y + i * offset,
    }
    canvas.addWidget(data.name, data.template, pos, undefined, data.templateSource, data.schema, data.previewData)
  }
}

function autoLayout() {
  const sizes = new Map<string, { width: number; height: number }>()
  const els = containerEl.value?.querySelectorAll<HTMLElement>('[data-widget-id]')
  els?.forEach(el => {
    const id = el.dataset.widgetId!
    sizes.set(id, { width: el.offsetWidth, height: el.offsetHeight })
  })

  // Measure ThemeCard if visible
  let themeCardSize: { width: number; height: number } | null = null
  if (theme.themeCardVisible) {
    const themeEl = containerEl.value?.querySelector<HTMLElement>('.theme-card')
    if (themeEl) {
      themeCardSize = { width: themeEl.offsetWidth, height: themeEl.offsetHeight }
    }
  }

  canvas.autoLayout(sizes, themeCardSize)

  // Position ThemeCard after layout
  if (themeCardSize && canvas.widgets.length > 0) {
    // Get bounds of all widgets to calculate layout position
    let minX = Infinity, minY = Infinity
    for (const w of canvas.widgets) {
      minX = Math.min(minX, w.position.x)
      minY = Math.min(minY, w.position.y)
    }
    // Position ThemeCard to the left, vertically centered with layout
    const gap = 40
    const themeCardX = minX - themeCardSize.width - gap
    const layoutHeight = Math.max(...canvas.widgets.map(w => w.position.y + (w.size?.height ?? 200)))
    const minLayoutY = minY
    const themeCardY = minLayoutY + (layoutHeight - minLayoutY - themeCardSize.height) / 2
    theme.setThemeCardPosition({ x: themeCardX, y: themeCardY })
  }

  setTimeout(() => {
    canvas.fitToScreen(window.innerWidth, window.innerHeight)
  }, 350)
}

function fitToScreen() {
  canvas.fitToScreen(window.innerWidth, window.innerHeight)
}

defineExpose({ autoLayout, fitToScreen })

async function onPaste(e: ClipboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

  // Check if clipboard has files
  const items = e.clipboardData?.items
  if (!items) return

  const files: File[] = []

  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }

  if (files.length === 0) return

  e.preventDefault()

  // Get the center of the canvas for paste position
  const containerRect = containerEl.value?.getBoundingClientRect()
  if (!containerRect) return

  const centerX = containerRect.left + containerRect.width / 2
  const centerY = containerRect.top + containerRect.height / 2
  const basePos = screenToCanvas(centerX, centerY)
  const offset = 80

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const text = await file.text()
    const data = parseWidgetFile(text)
    if (!data) continue

    const pos = {
      x: basePos.x + i * offset,
      y: basePos.y + i * offset,
    }
    canvas.addWidget(data.name, data.template, pos, undefined, data.templateSource, data.schema, data.previewData)
  }
}

function onKeyDown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
  if (e.code === 'Space' && !e.repeat) {
    spaceHeld.value = true
    e.preventDefault()
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    spaceHeld.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('paste', onPaste)
  // Non-passive so we can preventDefault for zoom
  containerEl.value?.addEventListener('wheel', onWheel, { passive: false })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('paste', onPaste)
  containerEl.value?.removeEventListener('wheel', onWheel)
})
</script>

<template>
  <div
    ref="containerEl"
    class="canvas"
    :class="{
      'canvas--panning': isPanning || spaceHeld,
      'canvas--dropping': isDroppingFile,
    }"
    @pointerdown="onCanvasPointerDown"
    @pointermove="onCanvasPointerMove"
    @pointerup="onCanvasPointerUp"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <CanvasGrid
      :scale="canvas.viewport.scale"
      :offset-x="canvas.viewport.x"
      :offset-y="canvas.viewport.y"
    />
    <div class="canvas-layer" :style="transformStyle">
      <ThemeCard
        v-if="theme.themeCardVisible"
        :scale="canvas.viewport.scale"
        @pointerdown.left.stop="onThemeCardDragStart"
      />
      <CanvasWidget
        v-for="widget in canvas.widgets"
        :key="widget.id"
        :data-widget-id="widget.id"
        :widget="widget"
        :selected="selection.isSelected(widget.id)"
        :animating="canvas.isAnimating"
        :theme="theme.tokens"
        :scale="canvas.viewport.scale"
        @select="onWidgetSelect"
        @drag-start="onWidgetDragStart"
      />
    </div>

    <!-- Drop ghost preview -->
    <div
      v-if="isDroppingFile"
      class="canvas-drop-ghost"
      :style="{ left: dropGhost.x + 'px', top: dropGhost.y + 'px' }"
    >
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <path d="M8 3v7M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span>Drop to import</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background-color: var(--studio-canvas-bg);
  cursor: default;

  &--panning {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }

  &--dropping {
    outline: 2px dashed var(--studio-accent);
    outline-offset: -6px;
    border-radius: 0;
  }
}

.canvas-drop-ghost {
  position: fixed;
  transform: translate(-50%, -120%);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--studio-glass-bg);
  backdrop-filter: var(--studio-glass-blur);
  -webkit-backdrop-filter: var(--studio-glass-blur);
  border: 1px solid var(--studio-accent);
  border-radius: 12px;
  color: var(--studio-accent);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  z-index: 200;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.canvas-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
}
</style>
