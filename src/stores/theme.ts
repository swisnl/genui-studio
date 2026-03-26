import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { type ThemeConfig } from '@swis/genui-widgets'
import { useHistoryStore } from './history'
import { type BaseColors, deriveThemeTokens } from '@/utils/deriveTheme'
import { generatePaletteScale } from '@/utils/color'
import type { Position } from '@/types/canvas'

export type ThemePreset = 'light' | 'dark'
export type ThemeColorTarget = ThemePreset | 'active'

const DEFAULT_LIGHT_COLORS: BaseColors = {
  primary: '#181818',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  discovery: '#8b5cf6',
  caution: '#f97316',
  surface: '#FFFFFF',
  border: '#E4E4E7',
}

const DEFAULT_DARK_COLORS: BaseColors = {
  primary: '#a1a1aa',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  discovery: '#8b5cf6',
  caution: '#f97316',
  surface: '#18211F',
  border: '#44514D',
}

const STUDIO_CSS_VARS_DARK = {
  '--studio-bg': '#131416',
  '--studio-surface': '#17181b',
  '--studio-surface-raised': '#1e1f23',
  '--studio-surface-accent': 'rgba(23, 24, 27, 0.15)',
  '--studio-canvas-bg': '#202124',
  '--studio-border': '#2c2d32',
  '--studio-border-subtle': '#1e1f23',
  '--studio-hover': 'rgba(212, 168, 40, 0.08)',
  '--studio-selected': 'rgba(212, 168, 40, 0.14)',
  '--studio-accent': '#d4a828',
  '--studio-accent-soft': 'rgba(212, 168, 40, 0.2)',
  '--studio-accent-hover': '#e0b83a',
  '--studio-text-primary': '#e8e4dc',
  '--studio-text-secondary': '#9a9691',
  '--studio-text-tertiary': '#6a6662',
  '--studio-grid-dot': '#44454b',
  '--studio-glass-bg': 'rgba(15, 16, 18, 0.72)',
  '--studio-glass-border': 'rgba(255, 255, 255, 0.07)',
  '--studio-glass-blur': 'blur(20px) saturate(180%)',
  '--studio-success': '#4ade80',
  '--studio-danger': '#ef4444',
  '--studio-danger-soft': 'rgba(239, 68, 68, 0.12)',
}

const STUDIO_CSS_VARS_LIGHT = {
  '--studio-bg': '#faf9f7',
  '--studio-surface': '#ffffff',
  '--studio-surface-raised': '#f0ede8',
  '--studio-surface-accent': 'rgba(255, 255, 255, 0.2)',
  '--studio-canvas-bg': '#ebe8e3',
  '--studio-border': '#d5d0ca',
  '--studio-border-subtle': '#e8e4dc',
  '--studio-hover': 'rgba(212, 168, 40, 0.06)',
  '--studio-selected': 'rgba(212, 168, 40, 0.2)',
  '--studio-accent': '#de9907',
  '--studio-accent-soft': 'rgba(212, 168, 40, 0.2)',
  '--studio-accent-hover': '#fdca43',
  '--studio-text-primary': '#1a1410',
  '--studio-text-secondary': '#5f5854',
  '--studio-text-tertiary': '#8d8680',
  '--studio-grid-dot': '#c8c2bc',
  '--studio-glass-bg': 'rgba(255, 255, 255, 0.72)',
  '--studio-glass-border': 'rgba(0, 0, 0, 0.08)',
  '--studio-glass-blur': 'blur(14px) saturate(200%)',
  '--studio-success': '#10b981',
  '--studio-danger': '#ef4444',
  '--studio-danger-soft': 'rgba(239, 68, 68, 0.12)',
}

export const useThemeStore = defineStore('theme', () => {
  // Two separate base color sets — one for each mode
  const lightColors = ref<BaseColors>({ ...DEFAULT_LIGHT_COLORS })
  const darkColors = ref<BaseColors>({ ...DEFAULT_DARK_COLORS })
  const activePreset = ref<ThemePreset>('dark')

  // Derived
  const isDark = computed(() => activePreset.value === 'dark')
  const baseColors = computed(() => isDark.value ? darkColors.value : lightColors.value)
  const tokens = computed(() => deriveThemeTokens(baseColors.value, isDark.value))

  // Theme card canvas state
  const themeCardPosition = ref<Position>({ x: 40, y: 40 })
  const themeCardVisible = ref(true)

  const tokenEntries = computed(() => Object.entries(tokens.value) as [keyof ThemeConfig, string | number | object][])

  // Palettes for display in ThemeCard (10-step scales)
  const palettes = computed(() => {
    const dark = isDark.value
    return {
      primary: generatePaletteScale(baseColors.value.primary, dark),
      success: generatePaletteScale(baseColors.value.success, dark),
      danger: generatePaletteScale(baseColors.value.danger, dark),
      warning: generatePaletteScale(baseColors.value.warning, dark),
      info: generatePaletteScale(baseColors.value.info, dark),
      discovery: generatePaletteScale(baseColors.value.discovery, dark),
      caution: generatePaletteScale(baseColors.value.caution, dark),
      surface: generatePaletteScale(baseColors.value.surface, dark),
      border: generatePaletteScale(baseColors.value.border, dark),
    }
  })

  // Surface and border derived colors for display
  const surfaceColors = computed(() => {
    const t = tokens.value
    return {
      background: t.background ?? '',
      surface: t.surface ?? '',
      surfaceSecondary: t.surfaceSecondary ?? '',
      surfaceTertiary: t.surfaceTertiary ?? '',
    }
  })

  const borderColors = computed(() => {
    const t = tokens.value
    return {
      borderDefault: t.borderDefault ?? '',
    }
  })

  const colorTokenGroups = computed(() => {
    const t = tokens.value
    const groups: Record<string, { key: string; value: string }[]> = {
      Palettes: [],
      Surface: [],
      Text: [],
      Border: [],
      Other: [],
    }

    // Surface tokens
    if (t.surface) groups.Surface.push({ key: 'surface', value: t.surface })
    if (t.surfaceSecondary) groups.Surface.push({ key: 'surfaceSecondary', value: t.surfaceSecondary })
    if (t.surfaceTertiary) groups.Surface.push({ key: 'surfaceTertiary', value: t.surfaceTertiary })
    if (t.background) groups.Surface.push({ key: 'background', value: t.background })

    // Text tokens
    if (t.textPrimary) groups.Text.push({ key: 'textPrimary', value: t.textPrimary })
    if (t.textSecondary) groups.Text.push({ key: 'textSecondary', value: t.textSecondary })
    if (t.textTertiary) groups.Text.push({ key: 'textTertiary', value: t.textTertiary })

    // Border tokens
    if (t.borderDefault) groups.Border.push({ key: 'borderDefault', value: t.borderDefault })

    // Disabled
    if (t.disabledBg) groups.Other.push({ key: 'disabledBg', value: t.disabledBg })
    if (t.disabledText) groups.Other.push({ key: 'disabledText', value: t.disabledText })

    return groups
  })

  // Coalesce rapid color changes (e.g. dragging a color picker) into a single undo entry.
  // The first call commits history; subsequent calls within the debounce window skip the commit.
  let _colorChangeTimer: ReturnType<typeof setTimeout> | null = null
  let _colorChangePending = false

  function _commitColorChange() {
    if (!_colorChangePending) {
      const history = useHistoryStore()
      history.commit()
      _colorChangePending = true
    }
    if (_colorChangeTimer) clearTimeout(_colorChangeTimer)
    _colorChangeTimer = setTimeout(() => {
      _colorChangePending = false
      _colorChangeTimer = null
    }, 500)
  }

  function resolveColorTarget(target: ThemeColorTarget): ThemePreset {
    return target === 'active' ? activePreset.value : target
  }

  function setBaseColor(key: keyof BaseColors, value: string, target: ThemeColorTarget = 'active') {
    _commitColorChange()
    if (resolveColorTarget(target) === 'dark') {
      darkColors.value = { ...darkColors.value, [key]: value }
    } else {
      lightColors.value = { ...lightColors.value, [key]: value }
    }
  }

  function setBaseColors(partial: Partial<BaseColors>, target: ThemeColorTarget = 'active') {
    _commitColorChange()
    if (resolveColorTarget(target) === 'dark') {
      darkColors.value = { ...darkColors.value, ...partial }
    } else {
      lightColors.value = { ...lightColors.value, ...partial }
    }
  }

  function updateStudioCssVariables() {
    const vars = activePreset.value === 'dark' ? STUDIO_CSS_VARS_DARK : STUDIO_CSS_VARS_LIGHT
    const root = document.documentElement
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value)
    }
  }

  function applyPreset(preset: ThemePreset) {
    // Switching is not undoable — it just picks which theme is active
    activePreset.value = preset
    updateStudioCssVariables()
  }

  function setThemeCardPosition(pos: Position) {
    themeCardPosition.value = pos
  }

  function exportAsJSON(): string {
    return JSON.stringify(tokens.value, null, 2)
  }

  function exportAsCSSVariables(): string {
    const lines: string[] = [':root {']
    for (const [key, value] of tokenEntries.value) {
      if (typeof value !== 'string') continue
      const cssName = '--genui-' + (key as string).replace(/([A-Z])/g, '-$1').toLowerCase()
      lines.push(`  ${cssName}: ${value};`)
    }
    lines.push('}')
    return lines.join('\n')
  }

  return {
    tokens,
    activePreset,
    baseColors,
    isDark,
    lightColors,
    darkColors,
    palettes,
    surfaceColors,
    borderColors,
    themeCardPosition,
    themeCardVisible,
    tokenEntries,
    colorTokenGroups,
    setBaseColor,
    setBaseColors,
    applyPreset,
    updateStudioCssVariables,
    setThemeCardPosition,
    exportAsJSON,
    exportAsCSSVariables,
  }
})
