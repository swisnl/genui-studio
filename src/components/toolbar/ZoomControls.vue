<script setup lang="ts">
import { computed } from 'vue'
import { useCanvasStore } from '@/stores/canvas'

const canvas = useCanvasStore()

const zoomPercent = computed(() => Math.round(canvas.viewport.scale * 100))

function zoomIn() {
  canvas.zoom(1.2, window.innerWidth / 2, window.innerHeight / 2)
}

function zoomOut() {
  canvas.zoom(0.8, window.innerWidth / 2, window.innerHeight / 2)
}

function resetZoom() {
  canvas.setViewport({ x: 0, y: 0, scale: 1 })
}
</script>

<template>
  <div class="zoom-controls">
    <button class="zoom-controls__btn" title="Zoom out" @click="zoomOut">−</button>
    <button class="zoom-controls__pct" title="Reset zoom" @click="resetZoom">{{ zoomPercent }}%</button>
    <button class="zoom-controls__btn" title="Zoom in" @click="zoomIn">+</button>
  </div>
</template>

<style scoped lang="scss">
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--studio-surface);
  border: 1px solid var(--studio-border);
  border-radius: 6px;
  padding: 2px;

  &__btn {
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    color: var(--studio-text-primary);

    &:hover {
      background: var(--studio-hover);
    }
  }

  &__pct {
    min-width: 44px;
    height: 28px;
    border: none;
    background: none;
    font-size: 11px;
    color: var(--studio-text-secondary);
    cursor: pointer;
    text-align: center;

    &:hover {
      color: var(--studio-text-primary);
    }
  }
}
</style>
