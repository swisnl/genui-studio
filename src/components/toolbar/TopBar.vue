<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import { useThemeStore } from '@/stores/theme'
import { useCanvasStore } from '@/stores/canvas'
import { pickWidgetFile } from '@/services/widgetImport'
import ConfirmDialog from '@/components/panels/ConfirmDialog.vue'

const project = useProjectStore()
const history = useHistoryStore()
const theme = useThemeStore()
const canvas = useCanvasStore()

const emit = defineEmits<{ autoLayout: [] }>()
const isProjectMenuOpen = ref(false)
const isEditingProjectName = ref(false)
const projectNameDraft = ref(project.name)
const menuButtonRef = ref<HTMLButtonElement | null>(null)
const menuPanelRef = ref<HTMLElement | null>(null)
const projectNameInputRef = ref<HTMLInputElement | null>(null)
const pendingDeleteProject = ref<{ id: string; name: string; isLast: boolean } | null>(null)

const deleteProjectDescription = computed(() => {
  if (!pendingDeleteProject.value) return ''
  if (pendingDeleteProject.value.isLast) {
    return `"${pendingDeleteProject.value.name}" will be deleted and immediately replaced with a new empty project.`
  }

  return `"${pendingDeleteProject.value.name}" will be removed from this browser. This action cannot be undone.`
})

watch(
  () => project.name,
  (value) => {
    if (!isEditingProjectName.value) {
      projectNameDraft.value = value
    }
  },
)

async function onImport() {
  const data = await pickWidgetFile()
  if (data) {
    canvas.addWidget(data.name, data.template, undefined, undefined, data.templateSource, data.schema, data.previewData)
  }
}

function toggleTheme() {
  theme.applyPreset(theme.activePreset === 'dark' ? 'light' : 'dark')
}

function onExport() {
  const json = project.exportAsJSON()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.name}.genui.json`
  a.click()
  URL.revokeObjectURL(url)
}

function commitProjectNameEdit() {
  project.renameProject(projectNameDraft.value)
  isEditingProjectName.value = false
  projectNameDraft.value = project.name
}

function cancelProjectNameEdit() {
  isEditingProjectName.value = false
  projectNameDraft.value = project.name
}

function startProjectNameEdit() {
  isProjectMenuOpen.value = false
  isEditingProjectName.value = true
  projectNameDraft.value = project.name
  nextTick(() => {
    projectNameInputRef.value?.focus()
    projectNameInputRef.value?.select()
  })
}

function toggleProjectMenu() {
  if (isEditingProjectName.value) {
    commitProjectNameEdit()
  }

  isProjectMenuOpen.value = !isProjectMenuOpen.value
}

function onSelectProject(projectId: string) {
  project.switchProject(projectId)
  isProjectMenuOpen.value = false
  isEditingProjectName.value = false
}

function onDeleteProject(projectId: string, projectName: string) {
  isProjectMenuOpen.value = false
  pendingDeleteProject.value = {
    id: projectId,
    name: projectName,
    isLast: project.projectList.length === 1,
  }
}

function closeDeleteProjectDialog() {
  pendingDeleteProject.value = null
}

function confirmDeleteProject() {
  if (!pendingDeleteProject.value) return

  project.deleteProject(pendingDeleteProject.value.id)
  pendingDeleteProject.value = null
}

async function onCreateProject() {
  project.createProject()
  isProjectMenuOpen.value = false
  await nextTick()
  startProjectNameEdit()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!isProjectMenuOpen.value) return

  const target = event.target as Node | null
  if (!target) return
  if (menuButtonRef.value?.contains(target)) return
  if (menuPanelRef.value?.contains(target)) return

  isProjectMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <div class="top-bar">
    <div class="top-bar__left">
      <div class="top-bar__projects">
        <button ref="menuButtonRef" class="top-bar__menu" title="Projects" @click="toggleProjectMenu">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        <div v-if="isProjectMenuOpen" ref="menuPanelRef" class="top-bar__menu-panel">
          <div class="top-bar__menu-header">
            <span class="top-bar__menu-title">Projects</span>
            <button class="top-bar__menu-create" @click="onCreateProject">New project</button>
          </div>

          <div class="top-bar__menu-list">
            <div
              v-for="item in project.projectList"
              :key="item.id"
              class="top-bar__project-row"
            >
              <button
                class="top-bar__project-item"
                :class="{ 'top-bar__project-item--active': item.id === project.activeProjectId }"
                @click="onSelectProject(item.id)"
              >
                <span class="top-bar__project-item-name">{{ item.name }}</span>
                <span v-if="item.id === project.activeProjectId" class="top-bar__project-item-badge">Current</span>
              </button>
              <button
                class="top-bar__project-delete"
                :title="`Delete ${item.name}`"
                @click.stop="onDeleteProject(item.id, item.name)"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2.5 3.5h9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                  <path d="M5.5 1.75h3a.75.75 0 0 1 .75.75v1h-4.5v-1a.75.75 0 0 1 .75-.75Z" stroke="currentColor" stroke-width="1.2"/>
                  <path d="M4 5.25v5.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                  <path d="M5.75 6.25v4M8.25 6.25v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <input
        v-if="isEditingProjectName"
        ref="projectNameInputRef"
        v-model="projectNameDraft"
        class="top-bar__name"
        type="text"
        maxlength="80"
        @blur="commitProjectNameEdit"
        @keydown.enter.prevent="commitProjectNameEdit"
        @keydown.escape.prevent="cancelProjectNameEdit"
      >
      <button v-else class="top-bar__name" title="Rename project" @click="startProjectNameEdit">{{ project.name }}</button>
    </div>
    <div class="top-bar__right">
      <button class="top-bar__btn" :disabled="!history.canUndo" data-tooltip="Undo (Cmd+Z)" data-tooltip-pos="bottom" @click="history.undo()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h8a3 3 0 0 1 0 6H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 5L3 8l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="top-bar__btn" :disabled="!history.canRedo" data-tooltip="Redo (Cmd+Shift+Z)" data-tooltip-pos="bottom" @click="history.redo()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M13 8H5a3 3 0 0 0 0 6h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button
        class="top-bar__btn"
        :disabled="canvas.widgets.length === 0"
        data-tooltip="Auto layout"
        data-tooltip-pos="bottom"
        @click="emit('autoLayout')"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
        </svg>
      </button>
      <button
        class="top-bar__btn"
        :data-tooltip="theme.activePreset === 'dark' ? 'Light mode' : 'Dark mode'"
        data-tooltip-pos="bottom"
        @click="toggleTheme"
      >
        <svg v-if="theme.activePreset === 'dark'" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4"/>
          <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M3.75 12.25l1.06-1.06M11.19 4.81l1.06-1.06" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="top-bar__btn" data-tooltip="Import widget" data-tooltip-pos="bottom" @click="onImport">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v7M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="top-bar__export" @click="onExport">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
          <path d="M4 7h6M7 4v6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        Exporteren
      </button>
    </div>
  </div>
  <ConfirmDialog
    :visible="!!pendingDeleteProject"
    title="Delete project?"
    :description="deleteProjectDescription"
    confirm-label="Delete project"
    cancel-label="Keep project"
    tone="danger"
    @close="closeDeleteProjectDialog"
    @confirm="confirmDeleteProject"
  />
</template>

<style scoped lang="scss">
.top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  z-index: 100;
  pointer-events: none;

  > * {
    pointer-events: auto;
  }

  &__left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__projects {
    position: relative;
  }

  &__menu {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--studio-glass-bg);
    backdrop-filter: var(--studio-glass-blur);
    -webkit-backdrop-filter: var(--studio-glass-blur);
    border: 1px solid var(--studio-glass-border);
    color: var(--studio-text-primary);
    cursor: pointer;

    &:hover {
      background: var(--studio-glass-border)
    }
  }

  &__name {
    min-width: 160px;
    max-width: min(320px, 42vw);
    padding: 8px 14px;
    border: 1px solid transparent;
    border-radius: 999px;
    font-weight: 600;
    color: var(--studio-text-primary);
    background: transparent;
    font-size: 14px;
    font-family: inherit;
    line-height: 1.2;
  }

  button.top-bar__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    cursor: pointer;
  }

  input.top-bar__name {
    outline: none;
    cursor: text;
    border-color: var(--studio-accent);
    box-shadow: 0 0 0 3px rgba(212, 168, 40, 0.14);
    background: var(--studio-glass-bg);
    backdrop-filter: var(--studio-glass-blur);
    -webkit-backdrop-filter: var(--studio-glass-blur);
  }

  &__menu-panel {
    position: absolute;
    top: calc(100% + 10px);
    left: 0;
    width: 290px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--studio-glass-bg);
    backdrop-filter: var(--studio-glass-blur);
    -webkit-backdrop-filter: var(--studio-glass-blur);
    border: 1px solid var(--studio-glass-border);
    border-radius: 18px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  }

  &__menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 4px 0;
  }

  &__menu-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--studio-text-tertiary);
  }

  &__menu-create {
    padding: 7px 12px;
    border: 1px solid var(--studio-accent);
    border-radius: 999px;
    background: var(--studio-accent-soft);
    color: var(--studio-accent);
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;

    &:hover {
      background: rgba(212, 168, 40, 0.18);
    }
  }

  &__menu-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: min(320px, calc(100vh - 120px));
    overflow-y: auto;
  }

  &__project-row {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  &__project-item {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: 14px;
    background: transparent;
    color: var(--studio-text-secondary);
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    text-align: left;

    &:hover {
      background: var(--studio-hover);
      color: var(--studio-text-primary);
    }

    &--active {
      background: var(--studio-selected);
      border-color: rgba(212, 168, 40, 0.28);
      color: var(--studio-text-primary);
    }
  }

  &__project-delete {
    width: 38px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 14px;
    background: transparent;
    color: var(--studio-text-tertiary);
    cursor: pointer;

    &:hover {
      background: rgba(191, 64, 64, 0.12);
      border-color: rgba(191, 64, 64, 0.22);
      color: #ff8f8f;
    }
  }

  &__project-item-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__project-item-badge {
    flex-shrink: 0;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(212, 168, 40, 0.16);
    color: var(--studio-accent);
    font-size: 11px;
    font-weight: 600;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--studio-glass-border);
    border-radius: 50%;
    background: var(--studio-glass-bg);
    backdrop-filter: var(--studio-glass-blur);
    -webkit-backdrop-filter: var(--studio-glass-blur);
    color: var(--studio-text-secondary);
    cursor: pointer;

    &:hover:not(:disabled) {
      color: var(--studio-text-primary);
      background: var(--studio-glass-border);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  }

  &__export {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: 1px solid var(--studio-glass-border);
    border-radius: 20px;
    background: var(--studio-glass-bg);
    backdrop-filter: var(--studio-glass-blur);
    -webkit-backdrop-filter: var(--studio-glass-blur);
    color: var(--studio-text-primary);
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;

    &:hover {
      background: var(--studio-glass-border)
    }
  }
}
</style>
