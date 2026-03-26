<script setup lang="ts">
import { computed } from 'vue'
import { useSelectionStore } from '@/stores/selection'
import type { WidgetTemplate } from '@swis/genui-widgets'

interface TreeNode {
  type: string
  path: string
  label: string
  children: TreeNode[]
}

const selection = useSelectionStore()

function buildTree(node: WidgetTemplate, path = ''): TreeNode {
  const children: TreeNode[] = []
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child: WidgetTemplate, i: number) => {
      const childPath = path ? `${path}.children[${i}]` : `children[${i}]`
      children.push(buildTree(child, childPath))
    })
  }
  const label = (node as Record<string, unknown>).label as string
    ?? (node as Record<string, unknown>).value as string
    ?? (node as Record<string, unknown>).name as string
    ?? ''
  return {
    type: node.type,
    path,
    label: label ? `${node.type} — ${String(label).slice(0, 30)}` : node.type,
    children,
  }
}

const tree = computed(() => {
  const widget = selection.primaryWidget
  if (!widget) return null
  return buildTree(widget.template)
})

function onSelectNode(path: string, additive: boolean) {
  if (!selection.primaryWidget) return
  selection.selectElement(selection.primaryWidget.id, path, additive)
}

function onHoverNode(path: string | null) {
  selection.setHoveredElement(path)
}
</script>

<template>
  <div class="element-tree">
    <div class="element-tree__header">
      <span class="element-tree__title">Elements</span>
    </div>
    <div v-if="!tree" class="element-tree__empty">
      Select a widget to inspect
    </div>
    <template v-else>
      <div class="element-tree__nodes" @mouseleave="onHoverNode(null)">
        <ElementTreeNode
          :node="tree"
          :depth="0"
          :selected-paths="selection.elementPaths"
          :hovered-path="selection.hoveredElementPath"
          @select="onSelectNode"
          @hover="onHoverNode"
        />
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, h, type PropType, type VNode } from 'vue'

interface ElementTreeNodeData {
  type: string
  path: string
  label: string
  children: ElementTreeNodeData[]
}

const ElementTreeNode: ReturnType<typeof defineComponent> = defineComponent({
  name: 'ElementTreeNode',
  props: {
    node: { type: Object as PropType<ElementTreeNodeData>, required: true },
    depth: { type: Number, default: 0 },
    selectedPaths: { type: Array as PropType<string[]>, default: () => [] },
    hoveredPath: { type: String as PropType<string | null>, default: null },
  },
  emits: ['select', 'hover'],
  setup(props, { emit }) {
    return (): VNode => {
      const node = props.node
      const isSelected = props.selectedPaths.includes(node.path)
      const isHovered = props.hoveredPath === node.path
      const children: VNode[] = node.children.map((child) =>
        h(ElementTreeNode, {
          node: child,
          depth: props.depth + 1,
          selectedPaths: props.selectedPaths,
          hoveredPath: props.hoveredPath,
          onSelect: (path: string, additive: boolean) => emit('select', path, additive),
          onHover: (path: string | null) => emit('hover', path),
        }),
      )

      return h('div', { class: 'tree-node' }, [
        h(
          'div',
          {
            class: [
              'tree-node__label',
              { 'tree-node__label--selected': isSelected },
              { 'tree-node__label--hovered': isHovered && !isSelected },
            ],
            style: { paddingLeft: `${16 + props.depth * 16}px` },
            onClick: (e: MouseEvent) => emit('select', node.path, e.metaKey || e.ctrlKey || e.shiftKey),
            onMouseenter: () => emit('hover', node.path),
          },
          [
            node.children.length > 0 ? h('span', { class: 'tree-node__arrow' }, '▾') : h('span', { class: 'tree-node__dot' }, '·'),
            h('span', { class: 'tree-node__type' }, node.type),
            node.label !== node.type ? h('span', { class: 'tree-node__text' }, node.label.replace(`${node.type} — `, '')) : null,
          ],
        ),
        ...children,
      ])
    }
  },
})
</script>

<style scoped lang="scss">
.element-tree {
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

  &__empty {
    padding: 16px;
    text-align: center;
    font-size: 12px;
    color: var(--studio-text-tertiary);
  }
}

:deep(.tree-node__label) {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
  color: var(--studio-text-primary);
}

:deep(.tree-node__label:hover) {
  background: var(--studio-hover);
}

:deep(.tree-node__label--selected) {
  background: var(--studio-selected);
  color: var(--studio-accent);
}

:deep(.tree-node__label--hovered) {
  background: var(--studio-hover);
}

:deep(.tree-node__arrow),
:deep(.tree-node__dot) {
  width: 12px;
  text-align: center;
  font-size: 10px;
  color: var(--studio-text-tertiary);
}

:deep(.tree-node__type) {
  font-weight: 500;
}

:deep(.tree-node__text) {
  color: var(--studio-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
