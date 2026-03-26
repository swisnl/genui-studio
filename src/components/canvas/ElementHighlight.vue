<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { WidgetTemplate } from '@swis/genui-widgets'

const props = defineProps<{
  template: WidgetTemplate
  selectedPaths: string[]
  hoveredPath: string | null
  containerEl: HTMLElement | null
  scale: number
}>()

interface HighlightRect {
  path: string
  top: number
  left: number
  width: number
  height: number
  isHover: boolean
}

const highlights = ref<HighlightRect[]>([])

/**
 * Build a map of template path → DOM element by walking the template tree
 * and the rendered DOM tree in parallel.
 *
 * Genui components render with a wrapper pattern:
 * - Card: .genui-card-wrapper > .genui-box.genui-card > [children]
 * - Box/Row/Col: .genui-box > [children]
 * - Text: .genui-text (leaf)
 * - Title: .genui-title (leaf)
 * etc.
 *
 * Strategy: for each template node, find its outermost DOM element.
 * For its template children, find the innermost container within that DOM element
 * and match children by index.
 */
function buildPathMap(template: WidgetTemplate, rootEl: Element): Map<string, Element> {
  const map = new Map<string, Element>()

  function walk(node: WidgetTemplate, el: Element, path: string) {
    map.set(path, el)

    if (!node.children || !Array.isArray(node.children) || node.children.length === 0) return

    // Find the innermost container that holds the actual child elements.
    // Genui containers wrap content in nested divs — we need to find
    // the element whose direct genui-* children correspond to template children.
    const childEls = findContentChildren(el, node.children.length)
    if (!childEls) return

    for (let i = 0; i < node.children.length; i++) {
      if (i >= childEls.length) break
      const childPath = path ? `${path}.children[${i}]` : `children[${i}]`
      walk(node.children[i], childEls[i], childPath)
    }
  }

  walk(template, rootEl, '')
  return map
}

/**
 * Find the N child elements that correspond to template children.
 * Walks down through wrapper divs to find the container whose
 * genui-* children match the expected count.
 */
function findContentChildren(el: Element, expectedCount: number): Element[] | null {
  // BFS: look for a descendant whose direct genui children match expected count
  const queue: Element[] = [el]

  while (queue.length > 0) {
    const current = queue.shift()!
    const genuiKids = Array.from(current.children).filter((child) => {
      const cls = child.className
      return typeof cls === 'string' && cls.includes('genui-')
    })

    // If this node's genui children count matches expected, this is our container
    if (genuiKids.length === expectedCount) {
      return genuiKids
    }

    // Continue searching in non-matching children (go deeper into wrappers)
    for (const child of current.children) {
      queue.push(child)
    }
  }

  return null
}

function updateHighlights() {
  if (!props.containerEl) {
    highlights.value = []
    return
  }

  // The root genui element
  const rootEl = props.containerEl.firstElementChild
  if (!rootEl) {
    highlights.value = []
    return
  }

  const allPaths = new Set([...props.selectedPaths])
  if (props.hoveredPath) allPaths.add(props.hoveredPath)

  if (allPaths.size === 0) {
    highlights.value = []
    return
  }

  const pathMap = buildPathMap(props.template, rootEl)
  const containerRect = props.containerEl.getBoundingClientRect()
  const scaleX = containerRect.width > 0 && props.containerEl.offsetWidth > 0
    ? containerRect.width / props.containerEl.offsetWidth
    : props.scale || 1
  const scaleY = containerRect.height > 0 && props.containerEl.offsetHeight > 0
    ? containerRect.height / props.containerEl.offsetHeight
    : props.scale || 1
  const rects: HighlightRect[] = []

  for (const path of allPaths) {
    const el = pathMap.get(path)
    if (!el) continue

    const elRect = el.getBoundingClientRect()
    if (elRect.width === 0 && elRect.height === 0) continue

    rects.push({
      path,
      top: (elRect.top - containerRect.top) / scaleY,
      left: (elRect.left - containerRect.left) / scaleX,
      width: elRect.width / scaleX,
      height: elRect.height / scaleY,
      isHover: path === props.hoveredPath && !props.selectedPaths.includes(path),
    })
  }

  highlights.value = rects
}

let rafId = 0

function scheduleUpdate() {
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    nextTick(updateHighlights)
  })
}

watch(
  () => [props.selectedPaths, props.hoveredPath, props.template, props.scale],
  scheduleUpdate,
  { deep: true },
)

let resizeObserver: ResizeObserver | null = null
let scrollEl: HTMLElement | null = null

onMounted(() => {
  scheduleUpdate()
  if (props.containerEl) {
    resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(props.containerEl)
    scrollEl = props.containerEl
    scrollEl.addEventListener('scroll', scheduleUpdate, { passive: true })
  }
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
  scrollEl?.removeEventListener('scroll', scheduleUpdate)
})
</script>

<template>
  <div class="element-highlight-layer">
    <div
      v-for="hl in highlights"
      :key="hl.path"
      class="element-highlight"
      :class="{ 'element-highlight--hover': hl.isHover }"
      :style="{
        top: hl.top + 'px',
        left: hl.left + 'px',
        width: hl.width + 'px',
        height: hl.height + 'px',
      }"
    />
  </div>
</template>

<style scoped lang="scss">
.element-highlight-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.element-highlight {
  position: absolute;
  border: 2px solid var(--studio-accent);
  border-radius: 3px;
  background: rgba(212, 168, 40, 0.08);
  pointer-events: none;
  transition: all 0.12s ease;

  &--hover {
    border-color: rgba(212, 168, 40, 0.5);
    border-style: dashed;
    background: rgba(212, 168, 40, 0.04);
  }
}
</style>
