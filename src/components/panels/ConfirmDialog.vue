<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  visible: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  tone: 'default',
})

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const cancelButtonRef = ref<HTMLButtonElement | null>(null)

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}

function onWindowKeyDown(event: KeyboardEvent) {
  if (!props.visible) return
  if (event.key === 'Escape') {
    emit('close')
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    nextTick(() => {
      cancelButtonRef.value?.focus()
    })
  },
)

onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeyDown)
})
</script>

<template>
  <Transition name="confirm-dialog">
    <div v-if="visible" class="confirm-dialog-backdrop" @click="onBackdropClick">
      <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div class="confirm-dialog__eyebrow" :class="`confirm-dialog__eyebrow--${tone}`">Please confirm</div>
        <h2 id="confirm-dialog-title" class="confirm-dialog__title">{{ title }}</h2>
        <p class="confirm-dialog__description">{{ description }}</p>

        <div class="confirm-dialog__actions">
          <button ref="cancelButtonRef" class="confirm-dialog__btn confirm-dialog__btn--secondary" @click="emit('close')">
            {{ cancelLabel }}
          </button>
          <button class="confirm-dialog__btn" :class="`confirm-dialog__btn--${tone}`" @click="emit('confirm')">
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.confirm-dialog-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: var(--studio-glass-blur);
  -webkit-backdrop-filter: var(--studio-glass-blur);
  z-index: 700;
}

.confirm-dialog {
  width: min(420px, calc(100vw - 32px));
  padding: 22px;
  background: var(--studio-glass-bg);
  backdrop-filter: var(--studio-glass-blur);
  -webkit-backdrop-filter: var(--studio-glass-blur);
  border: 1px solid var(--studio-glass-border);
  border-radius: 20px;
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
}

.confirm-dialog__eyebrow {
  display: inline-flex;
  align-items: center;
  margin-bottom: 12px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--studio-hover);
  color: var(--studio-text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.confirm-dialog__eyebrow--danger {
  background: var(--studio-danger-soft);
  color: var(--studio-danger);
}

.confirm-dialog__title {
  margin: 0;
  color: var(--studio-text-primary);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.confirm-dialog__description {
  margin: 10px 0 0;
  color: var(--studio-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.confirm-dialog__btn {
  min-width: 120px;
  padding: 10px 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.confirm-dialog__btn--secondary {
  background: transparent;
  border-color: var(--studio-border);
  color: var(--studio-text-secondary);

  &:hover {
    background: var(--studio-hover);
    color: var(--studio-text-primary);
  }
}

.confirm-dialog__btn--default {
  background: var(--studio-accent);
  color: #111;

  &:hover {
    background: var(--studio-accent-hover);
  }
}

.confirm-dialog__btn--danger {
  background: var(--studio-danger);
  color: #fff;

  &:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }
}

.confirm-dialog-enter-active,
.confirm-dialog-leave-active {
  transition: opacity 0.16s ease;
}

.confirm-dialog-enter-active .confirm-dialog,
.confirm-dialog-leave-active .confirm-dialog {
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.confirm-dialog-enter-from,
.confirm-dialog-leave-to {
  opacity: 0;
}

.confirm-dialog-enter-from .confirm-dialog,
.confirm-dialog-leave-to .confirm-dialog {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
