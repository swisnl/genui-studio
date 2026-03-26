import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { defaultTheme, type ThemeConfig } from '@swis/genui-widgets'
import { useCanvasStore } from './canvas'
import { useThemeStore, type ThemePreset } from './theme'
import { useHistoryStore } from './history'
import { decompileToJsx } from '@/services/jsx-decompiler'
import { extractBaseColors } from '@/utils/deriveTheme'
import type { Project, ProjectLibrary, ProjectSummary, StoredProject } from '@/types/project'

const STORAGE_KEY = 'genui-studio-projects'
const LEGACY_STORAGE_KEY = 'genui-studio-project'
const DEFAULT_PROJECT_NAME = 'Untitled Project'
const DEFAULT_PROJECT_VERSION = '1.0.0'

let _projectCounter = 0

function createProjectId(): string {
  return `p_${Date.now()}_${++_projectCounter}`
}

function cloneProject(project: Project): Project {
  return {
    version: project.version,
    name: project.name,
    theme: JSON.parse(JSON.stringify(project.theme || null)) as ThemeConfig,
    widgets: JSON.parse(JSON.stringify(project.widgets)),
  }
}

function normalizeProjectName(value: string) {
  const trimmed = value.trim()
  return trimmed || DEFAULT_PROJECT_NAME
}

function matchesTheme(theme: ThemeConfig, reference: ThemeConfig) {
  const keys = Object.keys(reference) as (keyof ThemeConfig)[]
  return keys.every((key) => theme[key] === reference[key])
}

function detectThemePreset(theme: ThemeConfig): ThemePreset {
  if (matchesTheme(theme, defaultTheme)) return 'light'
  return 'dark'
}

function createEmptyProject(name = DEFAULT_PROJECT_NAME): Project {
  return {
    version: DEFAULT_PROJECT_VERSION,
    name: normalizeProjectName(name),
    activePreset: 'dark',
    widgets: [],
  }
}

function createStoredProject(name = DEFAULT_PROJECT_NAME, timestamp = Date.now()): StoredProject {
  return {
    id: createProjectId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    data: createEmptyProject(name),
  }
}

function sanitizeProject(value: unknown): Project {
  const candidate = value && typeof value === 'object' ? (value as Partial<Project>) : {}
  return {
    version: typeof candidate.version === 'string' ? candidate.version : DEFAULT_PROJECT_VERSION,
    name: normalizeProjectName(typeof candidate.name === 'string' ? candidate.name : DEFAULT_PROJECT_NAME),
    theme: candidate.theme && typeof candidate.theme === 'object' ? candidate.theme as ThemeConfig : undefined,
    lightColors: candidate.lightColors && typeof candidate.lightColors === 'object' ? candidate.lightColors : undefined,
    darkColors: candidate.darkColors && typeof candidate.darkColors === 'object' ? candidate.darkColors : undefined,
    activePreset: candidate.activePreset === 'light' ? 'light' : 'dark',
    widgets: Array.isArray(candidate.widgets) ? JSON.parse(JSON.stringify(candidate.widgets)) : [],
  }
}

function sanitizeStoredProject(value: unknown): StoredProject | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<StoredProject>
  if (typeof candidate.id !== 'string' || !candidate.id) return null

  const createdAt = typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now()
  const updatedAt = typeof candidate.updatedAt === 'number' ? candidate.updatedAt : createdAt

  return {
    id: candidate.id,
    createdAt,
    updatedAt,
    data: sanitizeProject(candidate.data),
  }
}

function sanitizeProjectLibrary(value: unknown): ProjectLibrary | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ProjectLibrary>
  if (!Array.isArray(candidate.projects)) return null

  const projects = candidate.projects
    .map((project) => sanitizeStoredProject(project))
    .filter((project): project is StoredProject => project !== null)

  if (projects.length === 0) return null

  const requestedProjectId = typeof candidate.activeProjectId === 'string' ? candidate.activeProjectId : null
  const activeProjectId = projects.some((project) => project.id === requestedProjectId)
    ? requestedProjectId
    : projects[0].id

  return {
    activeProjectId,
    projects,
  }
}

export const useProjectStore = defineStore('project', () => {
  const name = ref(DEFAULT_PROJECT_NAME)
  const version = ref(DEFAULT_PROJECT_VERSION)
  const projects = ref<StoredProject[]>([])
  const activeProjectId = ref<string | null>(null)

  const projectList = computed<ProjectSummary[]>(() =>
    [...projects.value]
      .sort((a, b) => {
        if (a.id === activeProjectId.value) return -1
        if (b.id === activeProjectId.value) return 1
        return b.updatedAt - a.updatedAt
      })
      .map((project) => ({
        id: project.id,
        name: project.data.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
  )

  function toJSON(): Project {
    const canvas = useCanvasStore()
    const theme = useThemeStore()
    return {
      version: version.value,
      name: name.value,
      lightColors: { ...theme.lightColors },
      darkColors: { ...theme.darkColors },
      activePreset: theme.activePreset,
      themeCardPosition: { ...theme.themeCardPosition },
      themeCardVisible: theme.themeCardVisible,
      widgets: JSON.parse(JSON.stringify(canvas.widgets)),
    }
  }

  function loadProject(project: Project) {
    const canvas = useCanvasStore()
    const theme = useThemeStore()
    const history = useHistoryStore()
    const nextProject = sanitizeProject(project)

    name.value = nextProject.name
    version.value = nextProject.version

    // Migrate old widgets: generate templateSource from template JSON
    for (const w of nextProject.widgets) {
      if (!w.templateSource && w.template) {
        try {
          w.templateSource = decompileToJsx(w.template)
        } catch {
          // If decompilation fails, leave templateSource undefined
        }
      }
    }

    canvas.widgets = nextProject.widgets

    // Load theme colors — only override store defaults if the project has explicit data
    if (nextProject.lightColors) {
      theme.lightColors = { ...nextProject.lightColors }
    }
    if (nextProject.darkColors) {
      theme.darkColors = { ...nextProject.darkColors }
    }
    if (nextProject.activePreset) {
      theme.activePreset = nextProject.activePreset
    }

    if (nextProject.themeCardPosition) {
      theme.themeCardPosition = nextProject.themeCardPosition
    }
    if (nextProject.themeCardVisible !== undefined) {
      theme.themeCardVisible = nextProject.themeCardVisible
    }
    history.clear()
  }

  function persistLibrary() {
    const payload: ProjectLibrary = {
      activeProjectId: activeProjectId.value,
      projects: projects.value,
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  function syncActiveProjectRecord() {
    const projectId = activeProjectId.value
    if (!projectId) return false

    const index = projects.value.findIndex((project) => project.id === projectId)
    if (index === -1) return false

    const current = projects.value[index]
    projects.value[index] = {
      ...current,
      updatedAt: Date.now(),
      data: cloneProject(toJSON()),
    }

    return true
  }

  function saveToLocalStorage() {
    syncActiveProjectRecord()
    persistLibrary()
  }

  function applyProjectLibrary(library: ProjectLibrary) {
    projects.value = library.projects.map((project) => ({
      ...project,
      data: cloneProject(project.data),
    }))

    const activeProject = projects.value.find((project) => project.id === library.activeProjectId) ?? projects.value[0]
    activeProjectId.value = activeProject.id
    loadProject(activeProject.data)
  }

  function loadFromLocalStorage(): boolean {
    const rawLibrary = localStorage.getItem(STORAGE_KEY)
    if (rawLibrary) {
      try {
        const library = sanitizeProjectLibrary(JSON.parse(rawLibrary))
        if (library) {
          applyProjectLibrary(library)
          saveToLocalStorage()
          return true
        }
      } catch {
        // Fall through to legacy/default handling
      }
    }

    const rawLegacyProject = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (rawLegacyProject) {
      try {
        const legacyProject = sanitizeProject(JSON.parse(rawLegacyProject))
        const migratedProject = createStoredProject(legacyProject.name)
        migratedProject.data = legacyProject
        applyProjectLibrary({
          activeProjectId: migratedProject.id,
          projects: [migratedProject],
        })
        saveToLocalStorage()
        return true
      } catch {
        // Fall through to default project handling
      }
    }

    const defaultProject = createStoredProject()
    applyProjectLibrary({
      activeProjectId: defaultProject.id,
      projects: [defaultProject],
    })
    saveToLocalStorage()
    return false
  }

  function exportAsJSON(): string {
    return JSON.stringify(toJSON(), null, 2)
  }

  function importFromJSON(json: string) {
    const importedProject = sanitizeProject(JSON.parse(json))

    if (!activeProjectId.value || !projects.value.some((project) => project.id === activeProjectId.value)) {
      const fallbackProject = createStoredProject(importedProject.name)
      projects.value = [fallbackProject, ...projects.value]
      activeProjectId.value = fallbackProject.id
    }

    loadProject(importedProject)
    saveToLocalStorage()
  }

  function buildUniqueProjectName(baseName = DEFAULT_PROJECT_NAME) {
    const normalizedBase = normalizeProjectName(baseName)
    const existingNames = new Set(projects.value.map((project) => project.data.name.toLowerCase()))
    if (!existingNames.has(normalizedBase.toLowerCase())) return normalizedBase

    let suffix = 2
    while (existingNames.has(`${normalizedBase} ${suffix}`.toLowerCase())) {
      suffix += 1
    }

    return `${normalizedBase} ${suffix}`
  }

  function renameProject(nextName: string) {
    name.value = normalizeProjectName(nextName)
    saveToLocalStorage()
  }

  function switchProject(projectId: string) {
    if (projectId === activeProjectId.value) return true

    const nextProject = projects.value.find((project) => project.id === projectId)
    if (!nextProject) return false

    saveToLocalStorage()
    activeProjectId.value = nextProject.id
    loadProject(nextProject.data)
    persistLibrary()
    return true
  }

  function createProject(projectName?: string) {
    saveToLocalStorage()

    const nextProject = createStoredProject(buildUniqueProjectName(projectName))
    projects.value = [nextProject, ...projects.value]
    activeProjectId.value = nextProject.id
    loadProject(nextProject.data)
    persistLibrary()

    return nextProject.id
  }

  function deleteProject(projectId: string) {
    const index = projects.value.findIndex((project) => project.id === projectId)
    if (index === -1) return false

    if (activeProjectId.value && activeProjectId.value !== projectId) {
      syncActiveProjectRecord()
    }

    const remainingProjects = projects.value.filter((project) => project.id !== projectId)

    if (remainingProjects.length === 0) {
      const replacementProject = createStoredProject()
      projects.value = [replacementProject]
      activeProjectId.value = replacementProject.id
      loadProject(replacementProject.data)
      persistLibrary()
      return true
    }

    projects.value = remainingProjects

    if (activeProjectId.value === projectId) {
      const nextProject = [...remainingProjects].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      activeProjectId.value = nextProject.id
      loadProject(nextProject.data)
    }

    persistLibrary()
    return true
  }

  function exportWidgetJSON(): string {
    const canvas = useCanvasStore()
    const templates = canvas.widgets.map((w) => ({
      name: w.name,
      template: w.template,
    }))
    return JSON.stringify(templates, null, 2)
  }

  return {
    name,
    version,
    projects,
    activeProjectId,
    projectList,
    toJSON,
    loadProject,
    saveToLocalStorage,
    loadFromLocalStorage,
    exportAsJSON,
    importFromJSON,
    renameProject,
    switchProject,
    createProject,
    deleteProject,
    exportWidgetJSON,
  }
})
