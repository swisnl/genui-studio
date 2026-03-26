<script setup lang="ts">
import { computed } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useThemeStore } from '@/stores/theme'

const props = defineProps<{
  activePanel: string | null
}>()

const emit = defineEmits<{
  togglePanel: [name: string]
}>()

const canvas = useCanvasStore()
const themeStore = useThemeStore()
const zoomPercent = computed(() => Math.round(canvas.viewport.scale * 100))

function toggleThemeCard() {
  themeStore.themeCardVisible = !themeStore.themeCardVisible
}

const tools = [
  { id: 'select', icon: 'cursor', title: 'Select' },
  { id: 'widgets', icon: 'grid', title: 'Widgets' },
  { id: 'elements', icon: 'layers', title: 'Elements' },
] as const

function zoomIn() {
  canvas.zoom(1.2, window.innerWidth / 2, window.innerHeight / 2)
}

function zoomOut() {
  canvas.zoom(0.8, window.innerWidth / 2, window.innerHeight / 2)
}

function resetZoom() {
  canvas.setViewport({ x: canvas.viewport.x, y: canvas.viewport.y, scale: 1 })
}
</script>

<template>
  <div class="canvas-tools">
    <div class="canvas-tools__group">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="canvas-tools__btn"
        :class="{ 'canvas-tools__btn--active': activePanel === tool.id }"
        :data-tooltip="tool.title"
        data-tooltip-pos="left"
        @click="emit('togglePanel', tool.id)"
      >
        <!-- Cursor/Select -->
        <svg v-if="tool.icon === 'cursor'" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M4 3l9 5.5-4 1.5-2 4L4 3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        </svg>
        <!-- Grid/Widgets -->
        <svg v-else-if="tool.icon === 'grid'" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="3" y="3" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/>
          <rect x="10" y="3" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/>
          <rect x="3" y="10" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/>
          <rect x="10" y="10" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.3"/>
        </svg>
        <!-- Layers/Elements -->
        <svg v-else-if="tool.icon === 'layers'" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 3L2 7l7 4 7-4-7-4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M2 11l7 4 7-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button
        class="canvas-tools__btn"
        :class="{ 'canvas-tools__btn--active': themeStore.themeCardVisible }"
        data-tooltip="Theme Card"
        data-tooltip-pos="left"
        @click="toggleThemeCard"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2" />
          <circle cx="11" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2" />
          <circle cx="8" cy="10.5" r="3.5" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
    </div>

    <div class="canvas-tools__zoom">
      <button class="canvas-tools__zoom-btn" data-tooltip="Zoom out" data-tooltip-pos="left" @click="zoomOut">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <span class="canvas-tools__zoom-pct" title="Reset zoom to 100%" @click="resetZoom">{{ zoomPercent }}%</span>
      <button class="canvas-tools__zoom-btn" data-tooltip="Zoom in" data-tooltip-pos="left" @click="zoomIn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7h8M7 3v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.canvas-tools {
  position: fixed;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  z-index: 50;

  &__group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    background: var(--studio-glass-bg);
    backdrop-filter: var(--studio-glass-blur);
    -webkit-backdrop-filter: var(--studio-glass-blur);
    border: 1px solid var(--studio-glass-border);
    border-radius: 16px;
  }

  &__btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 12px;
    background: none;
    color: var(--studio-text-secondary);
    cursor: pointer;
    transition: all 0.12s;

    &:hover {
      color: var(--studio-text-primary);
      background: var(--studio-hover);
    }

    &--active {
      color: var(--studio-accent);
      background: var(--studio-selected);
    }
  }

  &__zoom {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px;
    background: var(--studio-glass-bg);
    backdrop-filter: var(--studio-glass-blur);
    -webkit-backdrop-filter: var(--studio-glass-blur);
    border: 1px solid var(--studio-glass-border);
    border-radius: 16px;
  }

  &__zoom-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--studio-text-secondary);
    cursor: pointer;

    &:hover {
      color: var(--studio-text-primary);
      background: var(--studio-hover);
    }
  }

  &__zoom-pct {
    font-size: 10px;
    color: var(--studio-text-tertiary);
    padding: 2px 0;
    user-select: none;
    cursor: pointer;

    &:hover {
      color: var(--studio-text-primary);
    }
  }
}
</style>
