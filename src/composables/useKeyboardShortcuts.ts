import { onMounted, onUnmounted } from 'vue'
import { useHistoryStore } from '@/stores/history'
import { useSelectionStore } from '@/stores/selection'
import { useCanvasStore } from '@/stores/canvas'

export function useKeyboardShortcuts() {
  const history = useHistoryStore()
  const selection = useSelectionStore()
  const canvas = useCanvasStore()

  function onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    if (isInput) return

    const mod = e.metaKey || e.ctrlKey

    // Undo
    if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      history.undo()
      return
    }

    // Redo
    if (mod && e.key === 'z' && e.shiftKey) {
      e.preventDefault()
      history.redo()
      return
    }

    // Delete selected widgets
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.hasSelection) {
      e.preventDefault()
      for (const id of [...selection.widgetIds]) {
        canvas.removeWidget(id)
      }
      selection.clearSelection()
      return
    }

    // Escape — deselect
    if (e.key === 'Escape') {
      e.preventDefault()
      selection.clearSelection()
      return
    }

    // Zoom
    if (e.key === '=' || e.key === '+') {
      if (mod) {
        e.preventDefault()
        canvas.zoom(1.2, window.innerWidth / 2, window.innerHeight / 2)
      }
      return
    }
    if (e.key === '-') {
      if (mod) {
        e.preventDefault()
        canvas.zoom(0.8, window.innerWidth / 2, window.innerHeight / 2)
      }
      return
    }
    if (e.key === '0' && mod) {
      e.preventDefault()
      canvas.setViewport({ x: 0, y: 0, scale: 1 })
      return
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
}
