import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ProjectSnapshot, CanvasWidget } from '@/types/canvas'

const MAX_HISTORY = 100

function cloneWidgets(widgets: CanvasWidget[]): CanvasWidget[] {
  return JSON.parse(JSON.stringify(widgets))
}

// These are resolved lazily to break the circular dependency.
// By the time commit/undo/redo run, Pinia is fully set up.
let _canvasStore: ReturnType<typeof import('./canvas')['useCanvasStore']> | null = null
let _themeStore: ReturnType<typeof import('./theme')['useThemeStore']> | null = null

async function getStores() {
  if (!_canvasStore || !_themeStore) {
    const [{ useCanvasStore }, { useThemeStore }] = await Promise.all([
      import('./canvas'),
      import('./theme'),
    ])
    _canvasStore = useCanvasStore()
    _themeStore = useThemeStore()
  }
  return { canvas: _canvasStore, theme: _themeStore }
}

function getStoresSync() {
  // After first async resolution, stores are cached
  if (!_canvasStore || !_themeStore) {
    throw new Error('History stores not initialized. Call initHistory() first.')
  }
  return { canvas: _canvasStore, theme: _themeStore }
}

export const useHistoryStore = defineStore('history', () => {
  const past = ref<ProjectSnapshot[]>([])
  const future = ref<ProjectSnapshot[]>([])
  let _batchMode = false
  let _initialized = false

  async function init() {
    if (_initialized) return
    await getStores()
    _initialized = true
  }

  function _getState(): ProjectSnapshot {
    const { canvas, theme } = getStoresSync()
    return {
      widgets: cloneWidgets(canvas.widgets),
      lightColors: { ...theme.lightColors },
      darkColors: { ...theme.darkColors },
      activePreset: theme.activePreset,
      timestamp: Date.now(),
    }
  }

  function _applySnapshot(snapshot: ProjectSnapshot) {
    const { canvas, theme } = getStoresSync()
    canvas.widgets = cloneWidgets(snapshot.widgets)
    theme.lightColors = { ...snapshot.lightColors }
    theme.darkColors = { ...snapshot.darkColors }
    theme.activePreset = snapshot.activePreset
  }

  function commit() {
    if (_batchMode || !_initialized) return
    const snapshot = _getState()
    past.value.push(snapshot)
    if (past.value.length > MAX_HISTORY) past.value.shift()
    future.value = []
  }

  function undo() {
    if (past.value.length === 0 || !_initialized) return
    const currentState = _getState()
    future.value.push(currentState)
    const snapshot = past.value.pop()!
    _applySnapshot(snapshot)
  }

  function redo() {
    if (future.value.length === 0 || !_initialized) return
    const currentState = _getState()
    past.value.push(currentState)
    const snapshot = future.value.pop()!
    _applySnapshot(snapshot)
  }

  function beginBatch() {
    if (!_batchMode) {
      commit()
      _batchMode = true
    }
  }

  function endBatch() {
    _batchMode = false
  }

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  function clear() {
    past.value = []
    future.value = []
  }

  return {
    past,
    future,
    canUndo,
    canRedo,
    init,
    commit,
    undo,
    redo,
    beginBatch,
    endBatch,
    clear,
  }
})
