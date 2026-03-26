<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  scale: number
  offsetX: number
  offsetY: number
}>()

const dotSpacing = 24

const patternSize = computed(() => dotSpacing * props.scale)
const dotSize = computed(() => Math.max(1, 1.5 * props.scale))
const patternX = computed(() => props.offsetX % patternSize.value)
const patternY = computed(() => props.offsetY % patternSize.value)
</script>

<template>
  <svg class="canvas-grid" width="100%" height="100%">
    <defs>
      <pattern
        id="grid-dots"
        :width="patternSize"
        :height="patternSize"
        :x="patternX"
        :y="patternY"
        patternUnits="userSpaceOnUse"
      >
        <circle
          :cx="patternSize / 2"
          :cy="patternSize / 2"
          :r="dotSize"
          fill="var(--studio-grid-dot)"
        />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid-dots)" />
  </svg>
</template>

<style scoped lang="scss">
.canvas-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
