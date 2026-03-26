<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import { useThemeStore } from '@/stores/theme'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import Canvas from '@/components/canvas/Canvas.vue'
import TopBar from '@/components/toolbar/TopBar.vue'
import CanvasTools from '@/components/toolbar/CanvasTools.vue'
import PromptBar from '@/components/agent/PromptBar.vue'
import ChatCard from '@/components/agent/ChatCard.vue'
import FloatingPanel from '@/components/panels/FloatingPanel.vue'
import WidgetList from '@/components/sidebar/WidgetList.vue'
import ElementTree from '@/components/sidebar/ElementTree.vue'

const project = useProjectStore()
const history = useHistoryStore()
const theme = useThemeStore()

const canvasRef = ref<{ autoLayout: () => void; fitToScreen: () => void } | null>(null)
const showChat = ref(false)
const activePanel = ref<string | null>(null)

function togglePanel(name: string) {
  activePanel.value = activePanel.value === name ? null : name
}

useKeyboardShortcuts()

watch(
  () => project.activeProjectId,
  async () => {
    await nextTick()
    canvasRef.value?.fitToScreen()
  },
)

onMounted(async () => {
  await history.init()
  project.loadFromLocalStorage()
  theme.updateStudioCssVariables()
  setInterval(() => project.saveToLocalStorage(), 30_000)
})
</script>

<template>
  <div class="studio">
    <!-- Full-screen canvas -->
    <Canvas ref="canvasRef" />

    <!-- Floating top bar -->
    <TopBar @auto-layout="canvasRef?.autoLayout()" />

    <!-- Floating right-side icon toolbar -->
    <CanvasTools
      :active-panel="activePanel"
      @toggle-panel="togglePanel"
    />

    <!-- Floating panels (left side, triggered by canvas tools) -->
    <FloatingPanel
      :visible="activePanel === 'widgets'"
      title="Widgets"
      position="right-toolbar"
      @close="activePanel = null"
    >
      <WidgetList />
    </FloatingPanel>

    <FloatingPanel
      :visible="activePanel === 'elements'"
      title="Elements"
      position="right-toolbar"
      @close="activePanel = null"
    >
      <ElementTree />
    </FloatingPanel>

    <!-- Floating chat card (left side) -->
    <ChatCard :visible="showChat" @close="showChat = false" />

    <!-- Floating bottom prompt bar -->
    <PromptBar @toggle-chat="showChat = !showChat" :chat-open="showChat" />

    <!-- Bottom-left agent log toggle -->
    <button
      class="studio__agent-log"
      :class="{ 'studio__agent-log--active': showChat }"
      @click="showChat = !showChat"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 5h8M4 8h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      Agent log
    </button>
  </div>
</template>

<style scoped lang="scss">
.studio {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--studio-canvas-bg);
  color: var(--studio-text-primary);
}

.studio__agent-log {
  position: fixed;
  bottom: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--studio-glass-bg);
  backdrop-filter: var(--studio-glass-blur);
  -webkit-backdrop-filter: var(--studio-glass-blur);
  border: 1px solid var(--studio-glass-border);
  border-radius: 20px;
  color: var(--studio-text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  z-index: 50;

  &:hover,
  &--active {
    color: var(--studio-text-primary);
    border-color: var(--studio-accent);
  }

  svg {
    flex-shrink: 0;
  }
}
</style>
