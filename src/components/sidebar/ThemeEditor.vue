<script setup lang="ts">
import { useThemeStore, type ThemePreset } from '@/stores/theme'
import type { BaseColors } from '@/utils/deriveTheme'

const theme = useThemeStore()

function onBaseColorChange(key: keyof BaseColors, value: string) {
  theme.setBaseColor(key, value)
}

const presets: { label: string; value: ThemePreset }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

const baseColorLabels: { key: keyof BaseColors; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'success', label: 'Success' },
  { key: 'danger', label: 'Danger' },
  { key: 'warning', label: 'Warning' },
  { key: 'info', label: 'Info' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'caution', label: 'Caution' },
  { key: 'surface', label: 'Surface' },
  { key: 'border', label: 'Border' },
]
</script>

<template>
  <div class="theme-editor">
    <div class="theme-editor__header">
      <span class="theme-editor__title">Theme</span>
    </div>
    <div class="theme-editor__presets">
      <button
        v-for="preset in presets"
        :key="preset.value"
        class="theme-editor__preset"
        :class="{ 'theme-editor__preset--active': theme.activePreset === preset.value }"
        @click="theme.applyPreset(preset.value)"
      >
        {{ preset.label }}
      </button>
    </div>
    <div class="theme-editor__base-colors">
      <div v-for="bc in baseColorLabels" :key="bc.key" class="theme-editor__token">
        <input
          type="color"
          :value="theme.baseColors[bc.key]"
          class="theme-editor__swatch"
          @input="onBaseColorChange(bc.key, ($event.target as HTMLInputElement).value)"
        />
        <span class="theme-editor__token-name">{{ bc.label }}</span>
        <span class="theme-editor__token-hex">{{ theme.baseColors[bc.key] }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.theme-editor {
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

  &__presets {
    display: flex;
    gap: 4px;
    padding: 4px 16px 8px;
  }

  &__preset {
    padding: 3px 10px;
    border: 1px solid var(--studio-border);
    border-radius: 4px;
    background: none;
    font-size: 11px;
    cursor: pointer;
    color: var(--studio-text-primary);

    &--active {
      background: var(--studio-accent);
      border-color: var(--studio-accent);
      color: #111;
      font-weight: 600;
    }
  }

  &__base-colors {
    padding: 4px 16px 8px;
  }

  &__token {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }

  &__swatch {
    width: 20px;
    height: 20px;
    border: 1px solid var(--studio-border);
    border-radius: 4px;
    padding: 0;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;

    &::-webkit-color-swatch-wrapper {
      padding: 1px;
    }

    &::-webkit-color-swatch {
      border: none;
      border-radius: 3px;
    }
  }

  &__token-name {
    font-size: 11px;
    color: var(--studio-text-secondary);
  }

  &__token-hex {
    font-size: 10px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: var(--studio-text-tertiary);
    margin-left: auto;
  }
}
</style>
