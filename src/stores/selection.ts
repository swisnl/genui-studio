import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCanvasStore } from './canvas'

export const useSelectionStore = defineStore('selection', () => {
  const widgetIds = ref<string[]>([])
  const elementPaths = ref<string[]>([])
  const hoveredElementPath = ref<string | null>(null)

  const hasSelection = computed(() => widgetIds.value.length > 0)
  const isSingleSelection = computed(() => widgetIds.value.length === 1)

  // Keep backward compat: single elementPath for the agent context
  const elementPath = computed(() => elementPaths.value.length === 1 ? elementPaths.value[0] : null)

  const selectedWidgets = computed(() => {
    const canvas = useCanvasStore()
    return widgetIds.value
      .map((id) => canvas.getWidget(id))
      .filter((w) => w !== undefined)
  })

  const primaryWidget = computed(() => {
    if (!isSingleSelection.value) return null
    const canvas = useCanvasStore()
    return canvas.getWidget(widgetIds.value[0]) ?? null
  })

  function selectWidget(id: string, additive = false) {
    elementPaths.value = []
    hoveredElementPath.value = null
    if (additive) {
      const idx = widgetIds.value.indexOf(id)
      if (idx >= 0) {
        widgetIds.value.splice(idx, 1)
      } else {
        widgetIds.value.push(id)
      }
    } else {
      widgetIds.value = [id]
    }
  }

  function selectElement(widgetId: string, path: string, additive = false) {
    widgetIds.value = [widgetId]
    if (additive) {
      const idx = elementPaths.value.indexOf(path)
      if (idx >= 0) {
        elementPaths.value.splice(idx, 1)
      } else {
        elementPaths.value.push(path)
      }
    } else {
      elementPaths.value = [path]
    }
  }

  function isElementSelected(path: string): boolean {
    return elementPaths.value.includes(path)
  }

  function setHoveredElement(path: string | null) {
    hoveredElementPath.value = path
  }

  function clearSelection() {
    widgetIds.value = []
    elementPaths.value = []
    hoveredElementPath.value = null
  }

  function isSelected(id: string): boolean {
    return widgetIds.value.includes(id)
  }

  return {
    widgetIds,
    elementPaths,
    elementPath,
    hoveredElementPath,
    hasSelection,
    isSingleSelection,
    selectedWidgets,
    primaryWidget,
    selectWidget,
    selectElement,
    isElementSelected,
    setHoveredElement,
    clearSelection,
    isSelected,
  }
})
