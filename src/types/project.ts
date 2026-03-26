import type { ThemeConfig } from '@swis/genui-widgets'
import type { CanvasWidget, Position } from './canvas'
import type { BaseColors } from '@/utils/deriveTheme'
import type { ThemePreset } from '@/stores/theme'

export interface Project {
  version: string
  name: string
  theme?: ThemeConfig // legacy, kept for backwards compat on load
  lightColors?: BaseColors
  darkColors?: BaseColors
  activePreset?: ThemePreset
  themeCardPosition?: Position
  themeCardVisible?: boolean
  widgets: CanvasWidget[]
}

export interface ProjectMetadata {
  name: string
  createdAt: number
  updatedAt: number
}

export interface ProjectSummary extends ProjectMetadata {
  id: string
}

export interface StoredProject {
  id: string
  createdAt: number
  updatedAt: number
  data: Project
}

export interface ProjectLibrary {
  activeProjectId: string | null
  projects: StoredProject[]
}
