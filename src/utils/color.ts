import type { PaletteScale, PaletteStep } from '@swis/genui-widgets'

export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return [h * 360, s, l]
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }

  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

export function lighten(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.min(1, l + amount))
}

export function darken(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.max(0, l - amount))
}

export function setLightness(hex: string, lightness: number): string {
  const [h, s] = hexToHsl(hex)
  return hslToHex(h, s, lightness)
}

export function luminance(hex: string): number {
  const [, , l] = hexToHsl(hex)
  return l
}

export function generatePalette(hex: string, steps = 7): string[] {
  const [h, s] = hexToHsl(hex)
  const palette: string[] = []
  for (let i = 0; i < steps; i++) {
    const l = 0.95 - (i / (steps - 1)) * 0.85
    palette.push(hslToHex(h, s, l))
  }
  return palette
}

const PALETTE_STEPS: readonly PaletteStep[] = ['5', '10', '20', '30', '40', '50', '60', '70', '80', '90']

// Lightness ramp for light mode (step 5 = lightest, step 90 = darkest)
const LIGHT_LIGHTNESS: Record<PaletteStep, number> = {
  '5': 0.97, '10': 0.93, '20': 0.85, '30': 0.75, '40': 0.62,
  '50': 0.50, '60': 0.40, '70': 0.32, '80': 0.24, '90': 0.18,
}

// Dark mode reverses the ramp
const DARK_LIGHTNESS: Record<PaletteStep, number> = {
  '5': 0.18, '10': 0.24, '20': 0.32, '30': 0.40, '40': 0.50,
  '50': 0.62, '60': 0.75, '70': 0.85, '80': 0.93, '90': 0.97,
}

export function generatePaletteScale(hex: string, isDark: boolean): PaletteScale {
  const [h, s] = hexToHsl(hex)
  const ramp = isDark ? DARK_LIGHTNESS : LIGHT_LIGHTNESS
  const scale: Partial<PaletteScale> = {}
  for (const step of PALETTE_STEPS) {
    scale[step] = hslToHex(h, s, ramp[step])
  }
  return scale as PaletteScale
}
