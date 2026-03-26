<script setup lang="ts">
import { computed } from 'vue'
import { useSelectionStore } from '@/stores/selection'

const selection = useSelectionStore()

const label = computed(() => {
  const widget = selection.primaryWidget
  if (!widget) return null

  let text = widget.name
  if (selection.elementPaths.length === 1) {
    const path = selection.elementPaths[0]
    const parts = path.split('.')
    const lastPart = parts[parts.length - 1]
    text += ` › ${lastPart}`
  } else if (selection.elementPaths.length > 1) {
    text += ` › ${selection.elementPaths.length} elements`
  }
  return text
})
</script>

<template>
  <div v-if="label" class="context-chip">
    <span class="context-chip__label">Editing:</span>
    <span class="context-chip__value">{{ label }}</span>
  </div>
</template>

<style scoped lang="scss">
.context-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--studio-selected);
  border-radius: 6px;
  font-size: 12px;

  &__label {
    color: var(--studio-text-secondary);
  }

  &__value {
    color: var(--studio-accent);
    font-weight: 500;
  }
}
</style>
