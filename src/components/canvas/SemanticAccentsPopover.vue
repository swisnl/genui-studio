<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useThemeStore } from '@/stores/theme'
import type { PaletteScale, PaletteStep } from '@swis/genui-widgets'
import type { BaseColors } from '@/utils/deriveTheme'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const theme = useThemeStore()
const popoverEl = ref<HTMLElement | null>(null)
const colorInputRefs = ref<Record<string, HTMLInputElement | null>>({})

const PALETTE_STEPS: PaletteStep[] = ['5', '10', '20', '30', '40', '50', '60', '70', '80', '90']

type SemanticKey = 'info' | 'success' | 'warning' | 'caution' | 'danger' | 'discovery'

const semanticOrder: SemanticKey[] = ['info', 'success', 'warning', 'caution', 'danger', 'discovery']

const semanticLabels: Record<SemanticKey, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  caution: 'Caution',
  danger: 'Danger',
  discovery: 'Discovery',
}

const activeKey = ref<SemanticKey>('info')

const activeLabel = computed(() => semanticLabels[activeKey.value])

function getPaletteSteps(key: SemanticKey): string[] {
  const scale = theme.palettes[key]
  if (!scale) return []
  return PALETTE_STEPS.map((step) => (scale as PaletteScale)[step])
}

function openColorPicker(key: SemanticKey) {
  const input = colorInputRefs.value[key]
  if (input) input.click()
}

function onColorInput(key: keyof BaseColors, e: Event) {
  const value = (e.target as HTMLInputElement).value
  theme.setBaseColor(key, value)
}

function onHexInput(key: keyof BaseColors, e: Event) {
  const value = (e.target as HTMLInputElement).value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    theme.setBaseColor(key, value.toUpperCase())
  }
}

function formatHex(hex: string): string {
  return hex.toUpperCase()
}

function onMouseDown(e: MouseEvent) {
  if (popoverEl.value && !popoverEl.value.contains(e.target as Node)) {
    emit('close')
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onMouseDown)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <Transition name="accents-popover">
    <div v-if="visible" ref="popoverEl" class="semantic-popover" @mousedown.stop>
      <div class="semantic-popover__header">
        <span class="semantic-popover__title">Semantic accents</span>
        <span class="semantic-popover__caption">Status and supporting palettes</span>
      </div>

      <div class="semantic-popover__chips">
        <div
          v-for="key in semanticOrder"
          :key="key"
          class="semantic-popover__chip"
          :class="{ 'semantic-popover__chip--active': activeKey === key }"
          @click.stop="activeKey = key"
        >
          <span
            class="semantic-popover__chip-dot"
            :style="{ background: theme.baseColors[key] }"
          />
          <input
            type="color"
            :ref="(el) => { colorInputRefs[key] = el as HTMLInputElement }"
            :value="theme.baseColors[key]"
            class="semantic-popover__color-input"
            @input="onColorInput(key, $event)"
          />
        </div>
      </div>

      <div class="semantic-popover__detail">
        <div class="semantic-popover__detail-header">
          <span class="semantic-popover__detail-label">{{ activeLabel }}</span>
          <input
            class="semantic-popover__hex-input"
            :value="formatHex(theme.baseColors[activeKey])"
            @change="onHexInput(activeKey, $event)"
            @click.stop
            spellcheck="false"
          />
        </div>
        <div class="semantic-popover__swatches">
          <div
            class="semantic-popover__swatch semantic-popover__swatch--main"
            :style="{ background: theme.baseColors[activeKey] }"
            @click.stop="openColorPicker(activeKey)"
          />
          <div
            v-for="(color, i) in getPaletteSteps(activeKey)"
            :key="i"
            class="semantic-popover__swatch"
            :style="{ background: color }"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.semantic-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 16px;
  width: 260px;
  background: var(--studio-glass-bg);
  backdrop-filter: var(--studio-glass-blur);
  -webkit-backdrop-filter: var(--studio-glass-blur);
  border: 1px solid var(--studio-glass-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 10;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  &__header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--studio-text-primary);
  }

  &__caption {
    font-size: 10px;
    line-height: 1.3;
    color: var(--studio-text-secondary);
  }

  &__chips {
    display: flex;
    gap: 1px;
    border-radius: 10px;
    overflow: hidden;
  }

  &__chip {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    cursor: pointer;
    transition: filter 0.12s ease;

    &--active {
      z-index: 2;
    }
  }

  &__chip-dot {
    display: block;
    width: 100%;
    height: 16px;
    transition: height 0.12s ease;
  }

  &__chip--active &__chip-dot {
    height: 20px;
  }

  &__color-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  &__detail {
    padding: 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--studio-surface) 95%, white 5%);
    border: 1px solid color-mix(in srgb, var(--studio-border) 75%, transparent);
  }

  &__detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 5px;
  }

  &__detail-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--studio-text-primary);
  }

  &__hex-input {
    width: 70px;
    font-size: 10px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    text-align: right;
    color: var(--studio-text-secondary);
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 1px 4px;
    outline: none;

    &:hover {
      border-color: var(--studio-border);
    }

    &:focus {
      border-color: var(--studio-accent);
      color: var(--studio-text-primary);
    }
  }

  &__swatches {
    display: flex;
    gap: 1px;
    height: 28px;
    border-radius: 5px;
    overflow: hidden;
  }

  &__swatch {
    flex: 1;
    cursor: default;
    transition: opacity 0.1s;

    &--main {
      flex: 1.5;
      cursor: pointer;

      &:hover {
        opacity: 0.85;
      }
    }
  }
}

.accents-popover-enter-active,
.accents-popover-leave-active {
  transition: all 0.15s ease;
}

.accents-popover-enter-from,
.accents-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
