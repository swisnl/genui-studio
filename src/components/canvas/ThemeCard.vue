<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { applyTheme } from '@swis/genui-widgets'
import type { PaletteScale, PaletteStep } from '@swis/genui-widgets'
import {
  WidgetButton,
  WidgetBox,
  WidgetRow,
  WidgetCol,
  WidgetText,
  WidgetTitle,
  WidgetInput,
  WidgetIcon,
  WidgetBadge,
  WidgetLabel,
  WidgetDivider,
  WidgetCaption,
} from '@swis/genui-widgets'
import type { BaseColors } from '@/utils/deriveTheme'
import { deriveThemeTokens } from '@/utils/deriveTheme'
import { generatePaletteScale } from '@/utils/color'
import SemanticAccentsPopover from './SemanticAccentsPopover.vue'

const props = defineProps<{
  scale: number
}>()

const theme = useThemeStore()
const previewEl = ref<HTMLElement | null>(null)
const colorInputRefs = ref<Record<string, HTMLInputElement | null>>({})
const showAccentsPopover = ref(false)
const localPreset = ref<'light' | 'dark'>('dark')

const PALETTE_STEPS: PaletteStep[] = ['5', '10', '20', '30', '40', '50', '60', '70', '80', '90']

type CorePaletteKey = 'primary' | 'surface' | 'border'

const corePaletteGroups: { key: CorePaletteKey; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'surface', label: 'Surfaces' },
  { key: 'border', label: 'Borders' },
]

const semanticDotKeys = ['info', 'success', 'warning', 'caution', 'danger', 'discovery'] as const

function getPaletteSteps(key: CorePaletteKey): string[] {
  const color = localBaseColors.value[key]
  const isDark = localPreset.value === 'dark'
  const scale = generatePaletteScale(color, isDark)
  return PALETTE_STEPS.map((step) => (scale as PaletteScale)[step])
}

const style = computed(() => ({
  left: theme.themeCardPosition.x + 'px',
  top: theme.themeCardPosition.y + 'px',
}))

const localBaseColors = computed(() =>
  localPreset.value === 'dark' ? theme.darkColors : theme.lightColors
)

const localTokens = computed(() =>
  deriveThemeTokens(localBaseColors.value, localPreset.value === 'dark')
)

onMounted(() => {
  if (previewEl.value) {
    applyTheme(previewEl.value, localTokens.value)
  }
})

watch(() => localTokens.value, (t) => {
  if (previewEl.value) applyTheme(previewEl.value, t)
}, { deep: true })

watch(() => theme.activePreset, (preset) => {
  localPreset.value = preset
})

function openColorPicker(key: keyof BaseColors) {
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
</script>

<template>
  <div class="theme-card" :style="style">
    <!-- Header -->
    <div class="theme-card__header">
      <svg class="theme-card__icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2" />
        <circle cx="11" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2" />
        <circle cx="8" cy="10.5" r="3.5" stroke="currentColor" stroke-width="1.2" />
      </svg>
      <span class="theme-card__title">Theme</span>

      <div class="theme-card__presets">
        <button
          class="theme-card__preset"
          :class="{ 'theme-card__preset--active': localPreset === 'light' }"
          @click.stop="localPreset = 'light'"
        >Light</button>
        <button
          class="theme-card__preset"
          :class="{ 'theme-card__preset--active': localPreset === 'dark' }"
          @click.stop="localPreset = 'dark'"
        >Dark</button>
      </div>
    </div>

    <div class="theme-card__body">
      <!-- Left: Color palette column -->
      <div class="theme-card__colors">
        <div class="theme-card__palette-section">
          <div
            v-for="group in corePaletteGroups"
            :key="group.key"
            class="theme-card__color-group"
          >
            <div class="theme-card__color-header">
              <span class="theme-card__color-label">{{ group.label }}</span>
              <input
                class="theme-card__hex-input"
                :value="formatHex(localBaseColors[group.key])"
                @change="onHexInput(group.key, $event)"
                @click.stop
                spellcheck="false"
              />
            </div>
            <div class="theme-card__swatches">
              <div
                class="theme-card__swatch theme-card__swatch--main"
                :style="{ background: localBaseColors[group.key] }"
                @click.stop="openColorPicker(group.key)"
              />
              <div
                v-for="(color, i) in getPaletteSteps(group.key)"
                :key="i"
                class="theme-card__swatch"
                :style="{ background: color }"
              />
            </div>
            <input
              type="color"
              :ref="(el) => { colorInputRefs[group.key] = el as HTMLInputElement }"
              :value="localBaseColors[group.key]"
              class="theme-card__color-input"
              @input="onColorInput(group.key, $event)"
            />
          </div>
        </div>

        <button
          class="theme-card__accents-trigger"
          @click.stop="showAccentsPopover = !showAccentsPopover"
          @mousedown.stop
        >
          <span class="theme-card__accents-dots">
            <span
              v-for="key in semanticDotKeys"
              :key="key"
              class="theme-card__accents-dot"
              :style="{ background: localBaseColors[key] }"
            />
          </span>
          <span>Semantic accents</span>
          <svg
            class="theme-card__accents-chevron"
            :class="{ 'theme-card__accents-chevron--open': showAccentsPopover }"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

      </div>

      <!-- Right: Widget preview grid -->
      <div ref="previewEl" class="theme-card__previews genui-widget-root">
        <!-- Row 1: Headline -->
        <div class="theme-card__preview-cell theme-card__preview-cell--font">
          <WidgetCaption value="Title" size="sm" color="#FFF" />
          <WidgetTitle value="Aa" size="xl" />
        </div>
        <div class="theme-card__preview-cell">
          <WidgetCol width="100%" :gap="1">
            <WidgetDivider />
            <WidgetBox :height="8" radius="full" background="alpha-20">
              <WidgetBox width="42%" height="100%" radius="full" background="primary" />
            </WidgetBox>
          </WidgetCol>
        </div>
        <div class="theme-card__preview-cell">
          <WidgetCol :gap="1">
            <WidgetLabel value="Label" fieldName="search" />
            <WidgetInput placeholder="Search" size="sm" />
          </WidgetCol>
        </div>

        <!-- Row 2: Body -->
        <div class="theme-card__preview-cell theme-card__preview-cell--font">
          <WidgetCaption value="Text" size="sm" color="#FFF" />
          <WidgetText value="Aa" size="xl" />
        </div>
        <div class="theme-card__preview-cell theme-card__preview-cell--stack">
          <div class="theme-card__button-grid">
            <WidgetButton label="Primary" color="primary" size="sm" />
            <WidgetButton label="Secondary" color="secondary" size="sm" />
            <WidgetButton label="Outlined" color="primary" variant="outline" size="sm" />
            <WidgetButton label="Ghost" color="secondary" variant="ghost" size="sm" />
          </div>
        </div>
        <div class="theme-card__preview-cell theme-card__preview-cell--row">
          <WidgetIcon name="bolt" size="xl" />
          <WidgetIcon name="search" size="xl" />
          <WidgetIcon name="user" size="xl" />
        </div>

        <!-- Row 3: Label -->
        <div class="theme-card__preview-cell theme-card__preview-cell--font">
          <WidgetCaption value="Label" size="sm" color="#FFF" />
          <WidgetLabel value="Aa" fieldName="field" size="xl" />
        </div>
        <div class="theme-card__preview-cell theme-card__preview-cell--row">
          <WidgetRow :gap="1">
            <WidgetIcon name="sparkle" color="tertiary" />
            <WidgetText value="Tertiary" color="tertiary" />
          </WidgetRow>
          <WidgetRow :gap="1">
            <WidgetIcon name="info" color="info" />
            <WidgetText value="Info" color="info" />
          </WidgetRow>
          <WidgetRow :gap="1">
            <WidgetIcon name="check-circle" color="success" />
            <WidgetText value="Success" color="success" />
          </WidgetRow>
          <WidgetRow :gap="1">
            <WidgetIcon name="circle-question" color="warning" />
            <WidgetText value="Warning" color="warning" />
          </WidgetRow>
        </div>
        <div class="theme-card__preview-cell theme-card__preview-cell--row">
          <WidgetBadge label="Info" color="info" />
          <WidgetBadge label="Success" color="success" />
          <WidgetBadge label="Danger" color="danger" />
          <WidgetBadge label="Discovery" color="discovery" />
        </div>
      </div>
    </div>

    <SemanticAccentsPopover
      :visible="showAccentsPopover"
      @close="showAccentsPopover = false"
    />
  </div>
</template>

<style scoped lang="scss">
.theme-card {
  position: absolute;
  background: var(--studio-surface);
  border: 1px solid var(--studio-border);
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  user-select: none;
  width: 780px;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--studio-border);
    border-radius: 20px 20px 0 0;
  }

  &__icon {
    color: var(--studio-text-secondary);
    flex-shrink: 0;
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--studio-text-primary);
  }

  &__presets {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }

  &__preset {
    padding: 3px 10px;
    border: 1px solid var(--studio-border);
    border-radius: 4px;
    background: none;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    color: var(--studio-text-primary);

    &--active {
      background: var(--studio-accent);
      border-color: var(--studio-accent);
      color: var(--studio-surface);
      font-weight: 600;
    }
  }

  &__body {
    display: flex;
    padding: 16px;
    gap: 16px;
  }

  &__colors {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    width: 260px;
  }

  &__palette-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__color-group {
    position: relative;
    padding: 8px;
    border: 1px solid color-mix(in srgb, var(--studio-border) 80%, transparent);
    border-radius: 12px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--studio-surface) 94%, white 6%) 0%, var(--studio-surface) 100%);
  }

  &__color-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 5px;
  }

  &__color-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--studio-text-primary);
  }

  &__hex-input {
    width: 78px;
    font-size: 11px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    text-align: right;
    color: var(--studio-text-secondary);
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 2px 6px;
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
    height: 40px;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--studio-border) 70%, transparent);
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

  &__color-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  &__accents-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--studio-border) 60%, transparent);
    border-radius: 10px;
    background: none;
    font-size: 11px;
    font-family: inherit;
    color: var(--studio-text-secondary);
    cursor: pointer;
    transition: all 0.12s ease;

    &:hover {
      border-color: var(--studio-border);
      color: var(--studio-text-primary);
      background: var(--studio-hover);
    }
  }

  &__accents-dots {
    display: flex;
    gap: 3px;
  }

  &__accents-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  &__accents-chevron {
    margin-left: auto;
    transition: transform 0.15s ease;

    &--open {
      transform: rotate(180deg);
    }
  }

  &__previews {
    flex: 1;
    display: grid;
    grid-template-columns: 2fr 3fr 3fr;
    gap: 4px;
    align-items: stretch;
    min-width: 0;
  }

  &__preview-label {
    display: flex;
    align-items: center;
    padding: 8px 12px 8px 4px;
  }

  &__preview-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 12px;
    background: var(--genui-surface, rgba(255, 255, 255, 0.03));
    box-shadow: 0 .25rem .5rem 0 #0000001a;;
    border-radius: 8px;
    min-height: 56px;
    overflow: hidden;

    &--stack {
      flex-direction: column;
      gap: 8px;

      :deep(.genui-divider) {
        width: 100%;
      }
    }

    &--row {
      gap: 6px;
      flex-wrap: wrap;
    }
  }

  &__preview-cell--font {
    flex-direction: column;
    justify-content: space-between;
  }

  &__preview-cell--font .genui-caption {
    align-self: flex-start;
  }

  &__preview-cell--font .genui-title,
  &__preview-cell--font .genui-text,
  &__preview-cell--font .genui-label {
    font-size: 42px;
    align-self: flex-end;
  }

  &__button-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }
}
</style>
