<script setup lang="ts">
import { useCanvasStore } from '@/stores/canvas'
import { useSelectionStore } from '@/stores/selection'

const canvas = useCanvasStore()
const selection = useSelectionStore()

function onSelect(id: string, e: MouseEvent) {
  selection.selectWidget(id, e.shiftKey)
}

function addNewWidget() {
  canvas.addWidget('New Widget', {
    type: 'Card',
    children: [
      { type: 'Title', value: 'New Widget' },
      { type: 'Text', value: 'Click to edit or ask Claude to modify this widget.' },
    ],
  })
}
</script>

<template>
  <div class="widget-list">
    <div class="widget-list__header">
      <span class="widget-list__title">Widgets</span>
    </div>
    <div class="widget-list__items">
      <div
        v-for="widget in canvas.widgets"
        :key="widget.id"
        class="widget-list__item"
        :class="{ 'widget-list__item--selected': selection.isSelected(widget.id) }"
        @click="onSelect(widget.id, $event)"
      >
        <span class="widget-list__item-icon">{{ widget.locked ? '🔒' : '◻' }}</span>
        <span class="widget-list__item-name">{{ widget.name }}</span>
      </div>
      <div v-if="canvas.widgets.length === 0" class="widget-list__empty">
        No widgets yet
      </div>
    </div>
    <button class="widget-list__add" @click="addNewWidget">+ New Widget</button>
  </div>
</template>

<style scoped lang="scss">
.widget-list {
  display: flex;
  flex-direction: column;

  &__header {
    padding: 12px 16px 8px;
  }

  &__title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--studio-text-secondary);
  }

  &__items {
    flex: 1;
    overflow-y: auto;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    cursor: pointer;
    font-size: 13px;
    color: var(--studio-text-primary);

    &:hover {
      background: var(--studio-hover);
    }

    &--selected {
      background: var(--studio-selected);
      color: var(--studio-accent);
    }
  }

  &__item-icon {
    font-size: 12px;
    width: 16px;
    text-align: center;
  }

  &__item-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__empty {
    padding: 16px;
    text-align: center;
    font-size: 12px;
    color: var(--studio-text-tertiary);
  }

  &__add {
    margin: 8px 12px;
    padding: 8px 12px;
    border: 1px solid var(--studio-accent);
    border-radius: 8px;
    background: var(--studio-accent-soft);
    color: var(--studio-accent);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: var(--studio-accent);
      color: #111;
    }
  }
}
</style>
