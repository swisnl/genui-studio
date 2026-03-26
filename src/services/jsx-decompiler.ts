/**
 * Converts a WidgetTemplate JSON tree back to JSX-like markup.
 * Used for backward compatibility when opening old widgets without templateSource.
 */

import type { WidgetTemplate } from '@swis/genui-widgets'

const CONTAINER_TYPES = new Set([
  'Box', 'Row', 'Col', 'Card', 'Form', 'ListView', 'ListViewItem',
])

function indent(depth: number): string {
  return '  '.repeat(depth)
}

function formatAttrValue(key: string, value: unknown): string {
  if (value === true) {
    return key
  }
  if (value === false) {
    return `${key}={false}`
  }
  if (typeof value === 'number') {
    return `${key}={${value}}`
  }
  if (typeof value === 'string') {
    // Escape double quotes inside strings
    return `${key}="${value.replace(/"/g, '\\"')}"`
  }
  if (typeof value === 'object' && value !== null) {
    return `${key}={${JSON.stringify(value)}}`
  }
  return `${key}={${JSON.stringify(value)}}`
}

function nodeToJsx(node: WidgetTemplate, depth: number): string {
  const tag = node.type
  const pad = indent(depth)
  const attrs: string[] = []

  // Collect attributes (everything except type and children)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'type' || key === 'children') continue
    if (value === undefined || value === null) continue
    attrs.push(formatAttrValue(key, value))
  }

  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : ''
  const children = (node.children ?? []) as WidgetTemplate[]

  // Self-closing if no children
  if (children.length === 0) {
    return `${pad}<${tag}${attrStr} />`
  }

  // With children
  const lines: string[] = []
  lines.push(`${pad}<${tag}${attrStr}>`)

  for (const child of children) {
    lines.push(nodeToJsx(child, depth + 1))
  }

  lines.push(`${pad}</${tag}>`)
  return lines.join('\n')
}

export function decompileToJsx(template: WidgetTemplate): string {
  return nodeToJsx(template, 0)
}
