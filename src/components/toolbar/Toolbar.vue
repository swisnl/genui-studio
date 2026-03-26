<script setup lang="ts">
import { useCanvasStore } from '@/stores/canvas'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import ZoomControls from './ZoomControls.vue'

const canvas = useCanvasStore()
const project = useProjectStore()
const history = useHistoryStore()

function toggleSnap() {
  canvas.snapToGrid = !canvas.snapToGrid
}

function onExport() {
  const json = project.exportAsJSON()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.name}.genui.json`
  a.click()
  URL.revokeObjectURL(url)
}

function onImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.genui.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    project.importFromJSON(text)
  }
  input.click()
}
</script>

<template>
  <div class="toolbar">
    <div class="toolbar__left">
      <span class="toolbar__brand">GenUI Studio</span>
      <span class="toolbar__sep">·</span>
      <span class="toolbar__project">{{ project.name }}</span>
    </div>
    <div class="toolbar__center">
      <button class="toolbar__btn" :disabled="!history.canUndo" title="Undo (Cmd+Z)" @click="history.undo()">↩</button>
      <button class="toolbar__btn" :disabled="!history.canRedo" title="Redo (Cmd+Shift+Z)" @click="history.redo()">↪</button>
    </div>
    <div class="toolbar__right">
      <button
        class="toolbar__btn"
        :class="{ 'toolbar__btn--active': canvas.snapToGrid }"
        title="Snap to grid"
        @click="toggleSnap"
      >
        ⊞
      </button>
      <button class="toolbar__btn" title="Import project" @click="onImport">↓</button>
      <button class="toolbar__btn" title="Export project" @click="onExport">↑</button>
      <ZoomControls />
    </div>
  </div>
</template>

<style scoped lang="scss">
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid var(--studio-border);
  background: var(--studio-surface);
  flex-shrink: 0;

  &__left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__brand {
    font-weight: 700;
    font-size: 14px;
    color: var(--studio-accent);
    letter-spacing: -0.02em;
  }

  &__sep {
    color: var(--studio-text-tertiary);
  }

  &__project {
    font-size: 13px;
    color: var(--studio-text-secondary);
  }

  &__center {
    display: flex;
    gap: 4px;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__btn {
    width: 32px;
    height: 32px;
    border: 1px solid var(--studio-border);
    border-radius: 6px;
    background: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--studio-text-primary);

    &:hover:not(:disabled) {
      background: var(--studio-hover);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    &--active {
      background: var(--studio-accent);
      color: #111;
      border-color: var(--studio-accent);
    }
  }
}
</style>
