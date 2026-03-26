<script setup lang="ts">
defineProps<{
  visible: boolean
  title: string
  position?: 'right-toolbar' | 'left'
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Transition name="panel">
    <div
      v-if="visible"
      class="floating-panel"
      :class="`floating-panel--${position ?? 'right-toolbar'}`"
    >
      <div class="floating-panel__header">
        <span class="floating-panel__title">{{ title }}</span>
        <button class="floating-panel__close" @click="emit('close')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="floating-panel__body">
        <slot />
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.floating-panel {
  position: fixed;
  top: 60px;
  width: 280px;
  max-height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  background: var(--studio-glass-bg);
  backdrop-filter: var(--studio-glass-blur);
  -webkit-backdrop-filter: var(--studio-glass-blur);
  border: 1px solid var(--studio-glass-border);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 80;
  overflow: hidden;

  &--right-toolbar {
    right: 76px;
  }

  &--left {
    left: 16px;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--studio-border);
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--studio-text-primary);
  }

  &__close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--studio-text-tertiary);
    cursor: pointer;

    &:hover {
      color: var(--studio-text-primary);
      background: var(--studio-hover);
    }
  }

  &__body {
    flex: 1;
    overflow-y: auto;
  }
}

.panel-enter-active,
.panel-leave-active {
  transition: all 0.15s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateX(8px);
}
</style>
