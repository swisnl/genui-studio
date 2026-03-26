import type { WidgetTemplate } from '@swis/genui-widgets'

export const VALID_TYPES = new Set([
  'Box', 'Row', 'Col', 'Card',
  'Text', 'Title', 'Label', 'Caption', 'Markdown',
  'Input', 'Textarea', 'Select', 'Checkbox', 'RadioGroup', 'DatePicker',
  'Button', 'Form',
  'Image', 'Icon', 'Badge', 'Divider', 'Spacer',
  'ListView', 'ListViewItem',
])

const CONTAINER_TYPES = new Set([
  'Box', 'Row', 'Col', 'Card', 'Form', 'ListView', 'ListViewItem',
])

/**
 * Normalizes a template by unwrapping any "props" objects.
 * The AI sometimes generates { type: "X", props: { ... } } instead of flat props.
 */
export function normalizeTemplate(node: unknown): WidgetTemplate {
  if (!node || typeof node !== 'object') return node as WidgetTemplate

  const obj = node as Record<string, unknown>
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'props' && value && typeof value === 'object' && !Array.isArray(value)) {
      // Unwrap props to flat
      Object.assign(result, value)
    } else if (key === 'children' && Array.isArray(value)) {
      result.children = value.map((child) => normalizeTemplate(child))
    } else {
      result[key] = value
    }
  }

  return result as WidgetTemplate
}

export function validateTemplate(node: WidgetTemplate, path = 'root'): string[] {
  const errors: string[] = []

  if (!node || typeof node !== 'object') {
    errors.push(`${path}: Template must be an object, got ${typeof node}`)
    return errors
  }

  if (!node.type) {
    errors.push(`${path}: Missing required "type" property`)
    return errors
  }

  if (typeof node.type !== 'string') {
    errors.push(`${path}: "type" must be a string, got ${typeof node.type}`)
    return errors
  }

  if (!VALID_TYPES.has(node.type)) {
    errors.push(`${path}: Unknown widget type "${node.type}". Valid types: ${[...VALID_TYPES].join(', ')}`)
  }

  if (node.children) {
    if (!Array.isArray(node.children)) {
      errors.push(`${path}: "children" must be an array`)
    } else if (!CONTAINER_TYPES.has(node.type)) {
      errors.push(`${path}: Widget type "${node.type}" does not support children. Container types: ${[...CONTAINER_TYPES].join(', ')}`)
    } else {
      for (let i = 0; i < node.children.length; i++) {
        errors.push(...validateTemplate(node.children[i], `${path}.children[${i}]`))
      }
    }
  }

  return errors
}
