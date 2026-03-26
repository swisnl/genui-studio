import type { WidgetTemplate } from '@swis/genui-widgets'
import type { BaseColors } from '@/utils/deriveTheme'
import type { ThemePreset } from '@/stores/theme'

export interface Position {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface CanvasWidget {
  id: string
  name: string
  position: Position
  size: Size
  template: WidgetTemplate
  templateSource?: string
  schema?: Record<string, unknown>
  previewData?: Record<string, unknown>
  locked: boolean
}

export interface SelectionState {
  widgetIds: string[]
  elementPath: string | null
}

export interface ViewportTransform {
  x: number
  y: number
  scale: number
}

export interface ProjectSnapshot {
  widgets: CanvasWidget[]
  lightColors: BaseColors
  darkColors: BaseColors
  activePreset: ThemePreset
  timestamp: number
}
