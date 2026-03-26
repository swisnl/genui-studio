<script setup lang="ts">
import { computed } from 'vue'
import type { Position, Size } from '@/types/canvas'

const props = defineProps<{
  position: Position
  size: Size
  scale: number
  locked: boolean
}>()

const emit = defineEmits<{
  resizeStart: [handle: string, event: PointerEvent]
}>()

const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

const handlePositions = computed(() => {
  const w = props.size.width
  const h = props.size.height
  return {
    nw: { x: 0, y: 0 },
    n: { x: w / 2, y: 0 },
    ne: { x: w, y: 0 },
    e: { x: w, y: h / 2 },
    se: { x: w, y: h },
    s: { x: w / 2, y: h },
    sw: { x: 0, y: h },
    w: { x: 0, y: h / 2 },
  }
})

const cursors: Record<string, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

function onHandlePointerDown(handle: string, e: PointerEvent) {
  if (props.locked) return
  e.stopPropagation()
  emit('resizeStart', handle, e)
}
</script>

<template>
  <div class="selection-overlay">
    <div class="selection-ring" />
    <template v-if="!locked">
      <div
        v-for="handle in handles"
        :key="handle"
        class="resize-handle"
        :class="`resize-handle--${handle}`"
        :style="{
          left: handlePositions[handle].x + 'px',
          top: handlePositions[handle].y + 'px',
          cursor: cursors[handle],
        }"
        @pointerdown="onHandlePointerDown(handle, $event)"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.selection-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.selection-ring {
  position: absolute;
  inset: -1px;
  border: 2px solid var(--studio-accent);
  border-radius: 4px;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: var(--studio-surface);
  border: 2px solid var(--studio-accent);
  border-radius: 2px;
  transform: translate(-50%, -50%);
  pointer-events: all;
  z-index: 1;

  &:hover {
    background: var(--studio-accent);
  }
}
</style>
