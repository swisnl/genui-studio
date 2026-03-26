import type { ThemeConfig, PaletteScale } from '@swis/genui-widgets'
import { hexToHsl, hslToHex, generatePaletteScale } from './color'

export interface BaseColors {
  primary: string
  success: string
  danger: string
  warning: string
  info: string
  discovery: string
  caution: string
  surface: string
  border: string
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function deriveThemeTokens(base: BaseColors, isDark: boolean): ThemeConfig {
  const primaryScale = generatePaletteScale(base.primary, isDark)
  const [sh, ss, sl] = hexToHsl(base.surface)
  const [bh, bs] = hexToHsl(base.border)

  // Surface tokens derived from the surface base color
  const surface = isDark ? hslToHex(sh, ss * 0.5, 0.11) : base.surface
  const surfaceSecondary = isDark
    ? hslToHex(sh, ss * 0.45, 0.13)
    : hslToHex(sh, ss * 0.35, clamp01(sl - 0.025))
  const surfaceTertiary = isDark
    ? hslToHex(sh, ss * 0.4, 0.17)
    : hslToHex(sh, ss * 0.4, clamp01(sl - 0.05))
  const background = isDark
    ? hslToHex(sh, ss * 0.5, 0.08)
    : hslToHex(sh, ss * 0.2, clamp01(sl + 0.015))

  // Text tokens derived from primary palette
  const textPrimary = isDark ? primaryScale['90'] : primaryScale['90']
  const textSecondary = isDark ? primaryScale['50'] : primaryScale['50']
  const textTertiary = isDark ? primaryScale['40'] : primaryScale['40']

  // Border derived from border base color
  const borderDefault = isDark ? hslToHex(bh, bs * 0.4, 0.20) : hslToHex(bh, bs * 0.3, 0.85)

  // Disabled states
  const disabledBg = isDark ? hslToHex(sh, ss * 0.3, 0.22) : hslToHex(sh, ss * 0.1, 0.89)
  const disabledText = isDark ? primaryScale['40'] : primaryScale['40']

  return {
    baseSize: '1rem',
    palettes: {
      primary: primaryScale,
      secondary: primaryScale, // primary and secondary are the same
      success: generatePaletteScale(base.success, isDark),
      danger: generatePaletteScale(base.danger, isDark),
      warning: generatePaletteScale(base.warning, isDark),
      info: generatePaletteScale(base.info, isDark),
      discovery: generatePaletteScale(base.discovery, isDark),
      caution: generatePaletteScale(base.caution, isDark),
    },
    surface,
    surfaceSecondary,
    surfaceTertiary,
    background,
    textPrimary,
    textSecondary,
    textTertiary,
    borderDefault,
    disabledBg,
    disabledText,
  }
}

export function extractBaseColors(tokens: ThemeConfig): BaseColors {
  // Extract representative colors from palette step 60 (or fallback)
  const palette = tokens.palettes ?? {}
  const getBase = (color: keyof typeof palette, fallback: string): string => {
    const scale = palette[color]
    return scale?.['60'] ?? scale?.['50'] ?? fallback
  }

  return {
    primary: getBase('primary', '#52525b'),
    success: getBase('success', '#059669'),
    danger: getBase('danger', '#dc2626'),
    warning: getBase('warning', '#d97706'),
    info: getBase('info', '#2563eb'),
    discovery: getBase('discovery', '#7c3aed'),
    caution: getBase('caution', '#ea580c'),
    surface: tokens.surface ?? tokens.background ?? '#FFFFFF',
    border: tokens.borderDefault ?? '#e4e4e7',
  }
}

export function isDarkTheme(tokens: ThemeConfig): boolean {
  if (!tokens.background) return false
  const [, , l] = hexToHsl(tokens.background)
  return l < 0.5
}
