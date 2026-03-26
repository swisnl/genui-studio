import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CanvasWidget, ViewportTransform, Position, Size } from '@/types/canvas'
import type { WidgetTemplate } from '@swis/genui-widgets'
import { resolveTemplate } from '@swis/genui-widgets'
import { compileJsx } from '@/services/jsx-compiler'
import { useHistoryStore } from './history'

let _widgetCounter = 0

function generateId(): string {
  return `w_${Date.now()}_${++_widgetCounter}`
}

export const useCanvasStore = defineStore('canvas', () => {
  const widgets = ref<CanvasWidget[]>([])
  const viewport = ref<ViewportTransform>({ x: 0, y: 0, scale: 1 })
  const snapToGrid = ref(false)
  const gridSize = 8
  const isAnimating = ref(false)

  const widgetMap = computed(() => {
    const map = new Map<string, CanvasWidget>()
    for (const w of widgets.value) map.set(w.id, w)
    return map
  })

  function getWidget(id: string): CanvasWidget | undefined {
    return widgetMap.value.get(id)
  }

  function addWidget(
    name: string,
    template: WidgetTemplate,
    position?: Position,
    size?: Size,
    templateSource?: string,
    schema?: Record<string, unknown>,
    previewData?: Record<string, unknown>,
  ): CanvasWidget {
    const history = useHistoryStore()
    history.commit()

    const widget: CanvasWidget = {
      id: generateId(),
      name,
      position: position ?? {
        x: -viewport.value.x / viewport.value.scale + 100,
        y: -viewport.value.y / viewport.value.scale + 100,
      },
      size: size ?? { width: 360, height: 240 },
      template,
      templateSource,
      schema,
      previewData,
      locked: false,
    }
    widgets.value.push(widget)
    return widget
  }

  function autoLayout(sizes: Map<string, { width: number; height: number }>, themeCardSize?: { width: number; height: number } | null) {
    if (widgets.value.length === 0) return
    const history = useHistoryStore()
    history.commit()

    const gap = 40
    const cols = 3
    const sorted = [...widgets.value].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)

    // First pass: compute layout positions and total bounds
    const positions: { x: number; y: number }[] = []
    let x = 0, y = 0, rowHeight = 0, col = 0
    let totalWidth = 0, totalHeight = 0

    // If ThemeCard is visible, reserve space on the left
    const themeCardWidth = themeCardSize?.width ?? 0
    const themeCardHeight = themeCardSize?.height ?? 0
    let themeCardReserveWidth = 0
    if (themeCardSize) {
      themeCardReserveWidth = themeCardWidth + gap
      x = themeCardReserveWidth
      totalWidth = themeCardReserveWidth
    }

    for (const w of sorted) {
      const size = sizes.get(w.id) ?? { width: 320, height: 200 }
      positions.push({ x, y })
      rowHeight = Math.max(rowHeight, size.height)
      x += size.width + gap
      totalWidth = Math.max(totalWidth, x - gap)
      col++
      if (col >= cols) {
        col = 0
        x = themeCardReserveWidth
        y += rowHeight + gap
        totalHeight = y - gap
        rowHeight = 0
      }
    }
    // Handle last incomplete row
    if (col > 0) {
      totalHeight = Math.max(totalHeight, y + rowHeight)
    }

    // If ThemeCard exists, ensure layout is tall enough to accommodate it
    if (themeCardSize) {
      totalHeight = Math.max(totalHeight, themeCardHeight)
    }

    // Center the layout around origin (offset upward)
    const offsetX = -(totalWidth - (themeCardSize ? themeCardReserveWidth : 0)) / 2 - (themeCardSize ? themeCardReserveWidth / 2 : 0)
    const offsetY = -totalHeight / 2 - 160

    // Apply with animation
    isAnimating.value = true
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].position = { x: positions[i].x + offsetX, y: positions[i].y + offsetY }
    }

    // Position ThemeCard on the left
    if (themeCardSize) {
      // ThemeCard position will be set separately via theme store
      // Here we just ensure it's positioned at the left side
    }

    setTimeout(() => {
      isAnimating.value = false
    }, 400)
  }

  function bringToFront(id: string) {
    const idx = widgets.value.findIndex((w) => w.id === id)
    if (idx !== -1 && idx !== widgets.value.length - 1) {
      const [widget] = widgets.value.splice(idx, 1)
      widgets.value.push(widget)
    }
  }

  function removeWidget(id: string) {
    const history = useHistoryStore()
    history.commit()
    widgets.value = widgets.value.filter((w) => w.id !== id)
  }

  function updateWidgetTemplate(id: string, template: WidgetTemplate) {
    const history = useHistoryStore()
    history.commit()
    const w = widgetMap.value.get(id)
    if (w) w.template = template
  }

  function updateWidgetSource(
    id: string,
    templateSource: string,
    schema?: Record<string, unknown>,
    previewData?: Record<string, unknown>,
  ) {
    const history = useHistoryStore()
    history.commit()
    const w = widgetMap.value.get(id)
    if (!w) return

    const nunjucksStr = compileJsx(templateSource)
    const resolved = resolveTemplate(nunjucksStr, previewData ?? {})

    w.template = resolved
    w.templateSource = templateSource
    if (schema !== undefined) w.schema = schema
    if (previewData !== undefined) w.previewData = previewData
  }

  function updateWidgetPosition(id: string, position: Position) {
    const w = widgetMap.value.get(id)
    if (!w || w.locked) return
    if (snapToGrid.value) {
      position = {
        x: Math.round(position.x / gridSize) * gridSize,
        y: Math.round(position.y / gridSize) * gridSize,
      }
    }
    w.position = position
  }

  function updateWidgetSize(id: string, size: Size) {
    const w = widgetMap.value.get(id)
    if (!w || w.locked) return
    w.size = { width: Math.max(100, size.width), height: Math.max(60, size.height) }
  }

  function updateWidgetName(id: string, name: string) {
    const w = widgetMap.value.get(id)
    if (w) w.name = name
  }

  function toggleLock(id: string) {
    const w = widgetMap.value.get(id)
    if (w) w.locked = !w.locked
  }

  function setViewport(transform: ViewportTransform) {
    viewport.value = transform
  }

  function pan(dx: number, dy: number) {
    viewport.value = {
      ...viewport.value,
      x: viewport.value.x + dx,
      y: viewport.value.y + dy,
    }
  }

  function zoom(factor: number, centerX: number, centerY: number) {
    const newScale = Math.min(4, Math.max(0.1, viewport.value.scale * factor))
    const ratio = newScale / viewport.value.scale
    viewport.value = {
      scale: newScale,
      x: centerX - (centerX - viewport.value.x) * ratio,
      y: centerY - (centerY - viewport.value.y) * ratio,
    }
  }

  function fitToScreen(containerWidth: number, containerHeight: number) {
    if (widgets.value.length === 0) {
      viewport.value = { x: 0, y: 0, scale: 1 }
      return
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const w of widgets.value) {
      minX = Math.min(minX, w.position.x)
      minY = Math.min(minY, w.position.y)
      // Use size if available, otherwise estimate based on typical widget dimensions
      const estWidth = w.size?.width ?? 400
      const estHeight = w.size?.height ?? 300
      maxX = Math.max(maxX, w.position.x + estWidth)
      maxY = Math.max(maxY, w.position.y + estHeight)
    }
    const contentW = maxX - minX + 100
    const contentH = maxY - minY + 100
    const scale = Math.min(1, containerWidth / contentW, containerHeight / contentH)
    viewport.value = {
      scale,
      x: (containerWidth - contentW * scale) / 2 - minX * scale + 50 * scale,
      y: (containerHeight - contentH * scale) / 2 - minY * scale + 50 * scale,
    }
  }

  return {
    widgets,
    viewport,
    snapToGrid,
    gridSize,
    isAnimating,
    widgetMap,
    getWidget,
    addWidget,
    autoLayout,
    bringToFront,
    removeWidget,
    updateWidgetTemplate,
    updateWidgetSource,
    updateWidgetPosition,
    updateWidgetSize,
    updateWidgetName,
    toggleLock,
    setViewport,
    pan,
    zoom,
    fitToScreen,
  }
})
