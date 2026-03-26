/**
 * CodeMirror 6 configuration for the JSX-like widget markup language.
 * Provides syntax highlighting, autocomplete, and lint integration.
 */

import { StreamLanguage, type StreamParser } from '@codemirror/language'
import { autocompletion, startCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { linter, type Diagnostic } from '@codemirror/lint'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { widgetSchema } from './widgetSchema'
import { parseJsx, type JsxError } from './jsx-compiler'

// ---------------------------------------------------------------------------
// Widget type/prop knowledge for autocomplete
// ---------------------------------------------------------------------------

const WIDGET_TYPES = Object.keys(widgetSchema.types)

function getPropsForType(typeName: string): string[] {
  const def = (widgetSchema.types as Record<string, { props?: Record<string, unknown> }>)[typeName]
  if (!def?.props) return []
  return Object.keys(def.props)
}

interface PropDef {
  type?: string
  enum?: string[]
  default?: unknown
  description?: string
}

function getPropDef(typeName: string, propName: string): PropDef | null {
  const def = (widgetSchema.types as Record<string, { props?: Record<string, PropDef> }>)[typeName]
  return def?.props?.[propName] ?? null
}

/** SpacingSize values used by gap, padding, margin, spacing */
const SPACING_VALUES = ['0', '1', '2', '4', '6', '8', '10', '12', '16', '20', '24']

/** Common props that use SpacingSize */
const SPACING_PROPS = new Set(['gap', 'padding', 'margin', 'spacing', 'minSize'])

/** Well-known color token values for the `color` prop */
const COLOR_TOKENS = ['primary', 'secondary', 'tertiary', 'success', 'danger', 'warning', 'info', 'discovery', 'caution']

/** Text color tokens (includes prose) */
const TEXT_COLOR_TOKENS = ['prose', ...COLOR_TOKENS]

/** Radius values */
const RADIUS_VALUES = ['none', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'full']

function getValuesForProp(typeName: string, propName: string): { label: string; detail?: string }[] {
  const def = getPropDef(typeName, propName)
  if (!def) return []

  // If the prop has enum values, use those
  if (def.enum) {
    return def.enum.map((v) => ({ label: v }))
  }

  // SpacingSize props
  if (SPACING_PROPS.has(propName) || def.description?.includes('SpacingSize')) {
    return SPACING_VALUES.map((v) => ({
      label: v,
      detail: `${Number(v) * 0.25}rem (${Number(v) * 4}px)`,
    }))
  }

  // Color props without explicit enum — use well-known tokens
  if (propName === 'color' && def.type === 'string') {
    const isTextLike = ['Text', 'Title', 'Caption', 'Label', 'Icon'].includes(typeName)
    return (isTextLike ? TEXT_COLOR_TOKENS : COLOR_TOKENS).map((v) => ({ label: v }))
  }

  // Radius props without explicit enum
  if (propName === 'radius' && def.type === 'string') {
    return RADIUS_VALUES.map((v) => ({ label: v }))
  }

  return []
}

// ---------------------------------------------------------------------------
// Stream-based tokenizer for JSX + Nunjucks
// ---------------------------------------------------------------------------

type TokenState = {
  context: 'root' | 'tag' | 'attr-value-string' | 'attr-value-expr' | 'nunjucks-block' | 'nunjucks-expr' | 'nunjucks-comment'
  depth: number
  tagName: string
  quote: string
}

const jsxStreamParser: StreamParser<TokenState> = {
  startState(): TokenState {
    return { context: 'root', depth: 0, tagName: '', quote: '' }
  },

  token(stream, state): string | null {
    // Inside nunjucks comment
    if (state.context === 'nunjucks-comment') {
      if (stream.match('#}')) {
        state.context = 'root'
        return 'comment'
      }
      stream.next()
      return 'comment'
    }

    // Inside nunjucks block {% ... %}
    if (state.context === 'nunjucks-block') {
      if (stream.match('%}')) {
        state.context = 'root'
        return 'keyword'
      }
      // Highlight keywords inside blocks
      if (stream.match(/^(for|endfor|if|elif|else|endif|set|endset|macro|endmacro|block|endblock|extends|include|import|from|as|in|not|and|or|is)\b/)) {
        return 'keyword'
      }
      stream.next()
      return 'meta'
    }

    // Inside nunjucks expression {{ ... }}
    if (state.context === 'nunjucks-expr') {
      if (stream.match('}}')) {
        state.context = 'root'
        return 'brace'
      }
      if (stream.match('|')) {
        return 'operator'
      }
      if (stream.match(/^(tojson|safe|escape|upper|lower|trim|length|default|first|last|join|sort|reverse)\b/)) {
        return 'function'
      }
      if (stream.match(/^[a-zA-Z_][\w.]*/)) {
        return 'variableName'
      }
      stream.next()
      return 'meta'
    }

    // Inside attribute string value
    if (state.context === 'attr-value-string') {
      // Check for nunjucks expressions inside strings
      if (stream.match('{{')) {
        state.context = 'nunjucks-expr'
        return 'brace'
      }
      if (stream.match(state.quote === '"' ? '"' : "'")) {
        state.context = 'tag'
        return 'string'
      }
      if (stream.match(/^\\./)) {
        return 'string'
      }
      stream.next()
      return 'string'
    }

    // Inside attribute expression value { ... }
    if (state.context === 'attr-value-expr') {
      if (stream.peek() === '{') {
        state.depth++
        stream.next()
        return 'brace'
      }
      if (stream.peek() === '}') {
        state.depth--
        if (state.depth <= 0) {
          state.context = 'tag'
          stream.next()
          return 'brace'
        }
        stream.next()
        return 'brace'
      }
      if (stream.match(/^-?\d+(\.\d+)?/)) {
        return 'number'
      }
      if (stream.match(/^(true|false|null)\b/)) {
        return 'bool'
      }
      if (stream.match(/^"[^"]*"/)) {
        return 'string'
      }
      stream.next()
      return 'content'
    }

    // Inside a tag (after < and tag name)
    if (state.context === 'tag') {
      if (stream.eat(/\s/)) {
        stream.eatWhile(/\s/)
        return null
      }
      // Self-closing />
      if (stream.match('/>')) {
        state.context = 'root'
        return 'angleBracket'
      }
      // Close >
      if (stream.match('>')) {
        state.context = 'root'
        return 'angleBracket'
      }
      // Attribute name
      if (stream.match(/^[a-zA-Z_][\w-]*/)) {
        // Check if followed by =
        if (stream.peek() === '=') {
          stream.next() // consume =
          if (stream.peek() === '"' || stream.peek() === "'") {
            state.quote = stream.peek()!
            stream.next()
            state.context = 'attr-value-string'
            return 'attributeName'
          }
          if (stream.peek() === '{') {
            stream.next()
            state.context = 'attr-value-expr'
            state.depth = 1
            return 'attributeName'
          }
        }
        return 'attributeName'
      }
      stream.next()
      return null
    }

    // Root context
    // Nunjucks comment {# ... #}
    if (stream.match('{#')) {
      state.context = 'nunjucks-comment'
      return 'comment'
    }

    // Nunjucks block {% ... %}
    if (stream.match('{%')) {
      state.context = 'nunjucks-block'
      return 'keyword'
    }

    // Nunjucks expression {{ ... }}
    if (stream.match('{{')) {
      state.context = 'nunjucks-expr'
      return 'brace'
    }

    // Closing tag </Tag>
    if (stream.match('</')) {
      const tagMatch = stream.match(/^[a-zA-Z_][\w-]*/)
      if (tagMatch) {
        stream.match('>')
      }
      return 'tagName'
    }

    // Opening tag <Tag
    if (stream.peek() === '<' && stream.string.charAt(stream.pos + 1)?.match(/[a-zA-Z]/)) {
      stream.next() // consume <
      const tagMatch = stream.match(/^[a-zA-Z_][\w-]*/) as RegExpMatchArray | null
      if (tagMatch) {
        state.context = 'tag'
        state.tagName = tagMatch[0]
      }
      return 'tagName'
    }

    // Whitespace
    if (stream.eat(/\s/)) {
      stream.eatWhile(/\s/)
      return null
    }

    // Any other content
    stream.next()
    return 'content'
  },
}

// ---------------------------------------------------------------------------
// Language + Highlight style
// ---------------------------------------------------------------------------

export const jsxLanguage = StreamLanguage.define(jsxStreamParser)

export const jsxHighlightStyle = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.tagName, color: '#7ee787' },
  { tag: tags.attributeName, color: '#79c0ff' },
  { tag: tags.string, color: '#a5d6ff' },
  { tag: tags.number, color: '#d2a8ff' },
  { tag: tags.bool, color: '#d2a8ff' },
  { tag: tags.keyword, color: '#ff7b72' },
  { tag: tags.meta, color: '#ffa657' },
  { tag: tags.variableName, color: '#ffa657' },
  { tag: tags.function(tags.variableName), color: '#d2a8ff' },
  { tag: tags.operator, color: '#ff7b72' },
  { tag: tags.brace, color: '#e6c06c' },
  { tag: tags.angleBracket, color: '#8b949e' },
  { tag: tags.comment, color: '#6e7681', fontStyle: 'italic' },
  { tag: tags.content, color: '#c9d1d9' },
]))

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

/**
 * Find the enclosing tag name by scanning backwards from the cursor position.
 */
function findEnclosingTag(text: string): string | null {
  const match = text.match(/<([A-Z][a-zA-Z]*)(?:\s[^>]*)?$/)
  return match ? match[1] : null
}

/**
 * Find which attribute name the cursor is currently inside the value of.
 * Matches patterns like: propName="partial  or  propName={partial
 */
function findCurrentAttrName(textBefore: string): string | null {
  // Inside a string value: propName="...cursor
  const stringMatch = textBefore.match(/([a-zA-Z][\w]*)="[^"]*$/)
  if (stringMatch) return stringMatch[1]

  // Inside an expression value: propName={...cursor
  const exprMatch = textBefore.match(/([a-zA-Z][\w]*)=\{[^}]*$/)
  if (exprMatch) return exprMatch[1]

  return null
}

function jsxCompletionSource(context: CompletionContext): CompletionResult | null {
  // After < — suggest widget type names
  const tagMatch = context.matchBefore(/<([A-Za-z]*)$/)
  if (tagMatch) {
    const prefix = tagMatch.text.slice(1) // remove <
    return {
      from: tagMatch.from + 1, // after <
      options: WIDGET_TYPES
        .filter((t) => t.toLowerCase().startsWith(prefix.toLowerCase()))
        .map((t) => ({ label: t, type: 'type' })),
    }
  }

  // After closing tag </ — suggest matching type names
  const closeTagMatch = context.matchBefore(/<\/([A-Za-z]*)$/)
  if (closeTagMatch) {
    const prefix = closeTagMatch.text.slice(2) // remove </
    return {
      from: closeTagMatch.from + 2,
      options: WIDGET_TYPES
        .filter((t) => t.toLowerCase().startsWith(prefix.toLowerCase()))
        .map((t) => ({ label: t, type: 'type' })),
    }
  }

  const fullTextBefore = context.state.doc.sliceString(0, context.pos)

  // Inside attribute value — suggest enum/token values
  // Check if we're inside a string attribute value: attr="prefix
  const stringValueMatch = context.matchBefore(/"([^"]*)$/)
  if (stringValueMatch) {
    const attrName = findCurrentAttrName(fullTextBefore)
    const tagName = findEnclosingTag(fullTextBefore)
    if (attrName && tagName) {
      const values = getValuesForProp(tagName, attrName)
      if (values.length > 0) {
        const prefix = stringValueMatch.text.slice(1) // remove opening "
        return {
          from: stringValueMatch.from + 1,
          options: values
            .filter((v) => v.label.toLowerCase().startsWith(prefix.toLowerCase()))
            .map((v) => ({ label: v.label, detail: v.detail, type: 'enum' })),
        }
      }
    }
  }

  // Inside expression attribute value: attr={prefix
  const exprValueMatch = context.matchBefore(/\{([^}]*)$/)
  if (exprValueMatch) {
    const attrName = findCurrentAttrName(fullTextBefore)
    const tagName = findEnclosingTag(fullTextBefore)
    if (attrName && tagName) {
      const values = getValuesForProp(tagName, attrName)
      if (values.length > 0) {
        const prefix = exprValueMatch.text.slice(1) // remove opening {
        return {
          from: exprValueMatch.from + 1,
          options: values
            .filter((v) => v.label.toLowerCase().startsWith(prefix.toLowerCase()))
            .map((v) => ({ label: v.label, detail: v.detail, type: 'enum' })),
        }
      }
    }
  }

  // Inside a tag — suggest prop names (after whitespace)
  const attrMatch = context.matchBefore(/\s([a-zA-Z]*)$/)
  if (attrMatch) {
    const tagName = findEnclosingTag(fullTextBefore)
    if (tagName) {
      const props = getPropsForType(tagName)
      const prefix = attrMatch.text.trim()

      if (props.length > 0) {
        return {
          from: attrMatch.from + (attrMatch.text.length - attrMatch.text.trimStart().length),
          options: props
            .filter((p) => p.toLowerCase().startsWith(prefix.toLowerCase()))
            .map((p) => {
              const def = getPropDef(tagName, p)
              const detail = def?.enum ? def.enum.join(' | ') : def?.type
              return { label: p, detail, type: 'property' }
            }),
        }
      }
    }
  }

  return null
}

export const jsxAutocomplete = autocompletion({
  override: [jsxCompletionSource],
  activateOnTyping: true,
})

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------

export const jsxLinter = linter((view) => {
  const doc = view.state.doc.toString()
  if (!doc.trim()) return []

  const { errors } = parseJsx(doc)
  const diagnostics: Diagnostic[] = []

  for (const err of errors) {
    const line = view.state.doc.line(Math.min(err.line, view.state.doc.lines))
    const from = line.from + Math.min(err.column - 1, line.length)
    const to = Math.min(from + 1, line.to)

    diagnostics.push({
      from,
      to,
      severity: 'error',
      message: err.message,
    })
  }

  return diagnostics
})

// ---------------------------------------------------------------------------
// JSON editor helpers (for schema/previewData)
// ---------------------------------------------------------------------------

export { json as jsonLanguage } from '@codemirror/lang-json'
export { startCompletion }
