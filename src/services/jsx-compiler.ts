/**
 * JSX-like markup → Nunjucks JSON template compiler.
 *
 * Parses an XML/HTML-like syntax with nunjucks blocks and emits
 * a nunjucks template string that resolves to valid widget JSON.
 *
 * Supports:
 *   - JSX elements:        <Card size="md"> ... </Card>
 *   - Self-closing:        <Divider />
 *   - String attributes:   prop="value"
 *   - Expression attrs:    prop={expr}
 *   - Boolean attrs:       prop  (implies true)
 *   - Nunjucks blocks:     {% for item in list %} ... {% endfor %}
 *   - .map() loops:        {items.map((item) => ( ... ))}
 *   - Ternary expressions: {cond ? trueVal : falseVal}
 *   - Object literals:     {{ x: 1, y: item.color }}
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsxError {
  message: string
  line: number
  column: number
  offset: number
}

export type JsxAttrValue =
  | { kind: 'string'; value: string }   // prop="value"
  | { kind: 'expr'; value: string }     // prop={value}
  | { kind: 'boolean' }                 // prop  (bare, implies true)

export interface JsxElement {
  kind: 'element'
  tag: string
  attrs: [string, JsxAttrValue][]
  children: JsxNode[]
  line: number
  column: number
}

export interface JsxNunjucksBlock {
  kind: 'nunjucks'
  raw: string
  line: number
  column: number
}

export interface JsxText {
  kind: 'text'
  value: string
  line: number
  column: number
}

export interface JsxMapBlock {
  kind: 'map'
  arrayExpr: string
  itemName: string
  indexName?: string
  children: JsxNode[]
  line: number
  column: number
}

export interface JsxConditionalBlock {
  kind: 'conditional'
  condition: string
  children: JsxNode[]
  line: number
  column: number
}

export type JsxNode = JsxElement | JsxNunjucksBlock | JsxText | JsxMapBlock | JsxConditionalBlock

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private src: string
  private pos = 0
  private line = 1
  private col = 1
  errors: JsxError[] = []

  constructor(src: string) {
    this.src = src
  }

  // -- helpers ---------------------------------------------------------------

  private at(offset = 0): string {
    return this.src[this.pos + offset] ?? ''
  }

  private peek(str: string): boolean {
    return this.src.startsWith(str, this.pos)
  }

  private eof(): boolean {
    return this.pos >= this.src.length
  }

  private advance(n = 1): string {
    const chunk = this.src.slice(this.pos, this.pos + n)
    for (const ch of chunk) {
      if (ch === '\n') {
        this.line++
        this.col = 1
      } else {
        this.col++
      }
    }
    this.pos += n
    return chunk
  }

  private skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.at())) {
      this.advance()
    }
  }

  private error(msg: string): void {
    this.errors.push({ message: msg, line: this.line, column: this.col, offset: this.pos })
  }

  private expect(ch: string): boolean {
    if (this.at() === ch) {
      this.advance()
      return true
    }
    this.error(`Expected '${ch}', got '${this.at() || 'EOF'}'`)
    return false
  }

  // -- main parse ------------------------------------------------------------

  parse(): JsxNode[] {
    const nodes = this.parseChildren(null)
    this.skipWhitespace()
    if (!this.eof()) {
      this.error(`Unexpected content at end of input: '${this.src.slice(this.pos, this.pos + 20)}'`)
    }
    return nodes
  }

  private parseChildren(parentTag: string | null): JsxNode[] {
    const children: JsxNode[] = []

    while (!this.eof()) {
      this.skipWhitespace()
      if (this.eof()) break

      // Closing tag for parent?
      if (parentTag && this.peek('</')) break

      // Nunjucks block tag {% ... %}
      if (this.peek('{%')) {
        children.push(this.parseNunjucksBlock())
        continue
      }

      // Nunjucks expression {{ ... }} as standalone text
      if (this.peek('{{')) {
        children.push(this.parseNunjucksExpr())
        continue
      }

      // Nunjucks comment {# ... #}
      if (this.peek('{#')) {
        this.parseNunjucksComment()
        continue
      }

      // JSX expression block { ... } (must check AFTER nunjucks patterns)
      if (this.at() === '{' && !this.peek('{{') && !this.peek('{%') && !this.peek('{#')) {
        const node = this.parseJsxExpressionBlock()
        if (node) {
          children.push(node)
          continue
        }
      }

      // Opening tag
      if (this.at() === '<' && this.at(1) !== '/') {
        children.push(this.parseElement())
        continue
      }

      // If we hit a closing tag but no parent, that's an error
      if (this.peek('</')) {
        this.error(`Unexpected closing tag`)
        break
      }

      // Anything else: consume as text until next interesting token
      const text = this.parseTextContent()
      if (text.value.trim()) {
        children.push(text)
      }
    }

    return children
  }

  private parseElement(): JsxElement {
    const startLine = this.line
    const startCol = this.col

    this.advance() // consume '<'

    const tag = this.parseIdentifier()
    if (!tag) {
      this.error('Expected tag name after <')
      return { kind: 'element', tag: 'Unknown', attrs: [], children: [], line: startLine, column: startCol }
    }

    const attrs = this.parseAttributes()
    this.skipWhitespace()

    // Self-closing?
    if (this.peek('/>')) {
      this.advance(2)
      return { kind: 'element', tag, attrs, children: [], line: startLine, column: startCol }
    }

    // Opening tag close
    if (!this.expect('>')) {
      return { kind: 'element', tag, attrs, children: [], line: startLine, column: startCol }
    }

    // Parse children
    const children = this.parseChildren(tag)

    // Expect closing tag
    if (this.peek('</')) {
      this.advance(2) // consume '</'
      const closingTag = this.parseIdentifier()
      if (closingTag !== tag) {
        this.error(`Mismatched closing tag: expected </${tag}>, got </${closingTag}>`)
      }
      this.skipWhitespace()
      this.expect('>')
    } else if (!this.eof()) {
      this.error(`Expected closing tag </${tag}>`)
    }

    return { kind: 'element', tag, attrs, children, line: startLine, column: startCol }
  }

  private parseIdentifier(): string {
    let id = ''
    while (!this.eof() && /[a-zA-Z0-9_-]/.test(this.at())) {
      id += this.advance()
    }
    return id
  }

  private parseAttributes(): [string, JsxAttrValue][] {
    const attrs: [string, JsxAttrValue][] = []

    while (!this.eof()) {
      this.skipWhitespace()

      // End of attributes?
      if (this.at() === '>' || this.peek('/>')) break
      if (this.eof()) break

      const name = this.parseIdentifier()
      if (!name) {
        this.error(`Expected attribute name, got '${this.at()}'`)
        this.advance() // skip bad char
        continue
      }

      this.skipWhitespace()

      // Bare boolean attribute (no =)
      if (this.at() !== '=') {
        attrs.push([name, { kind: 'boolean' }])
        continue
      }

      this.advance() // consume '='
      this.skipWhitespace()

      if (this.at() === '"') {
        attrs.push([name, this.parseStringAttr()])
      } else if (this.at() === "'") {
        attrs.push([name, this.parseStringAttrSingle()])
      } else if (this.at() === '{') {
        attrs.push([name, this.parseExprAttr()])
      } else {
        this.error(`Expected attribute value (string or expression) for '${name}'`)
        attrs.push([name, { kind: 'string', value: '' }])
      }
    }

    return attrs
  }

  private parseStringAttr(): JsxAttrValue {
    this.advance() // consume opening "
    let value = ''
    while (!this.eof() && this.at() !== '"') {
      if (this.at() === '\\' && this.at(1) === '"') {
        value += '"'
        this.advance(2)
      } else {
        value += this.advance()
      }
    }
    if (!this.eof()) this.advance() // consume closing "
    return { kind: 'string', value }
  }

  private parseStringAttrSingle(): JsxAttrValue {
    this.advance() // consume opening '
    let value = ''
    while (!this.eof() && this.at() !== "'") {
      if (this.at() === '\\' && this.at(1) === "'") {
        value += "'"
        this.advance(2)
      } else {
        value += this.advance()
      }
    }
    if (!this.eof()) this.advance() // consume closing '
    return { kind: 'string', value }
  }

  private parseExprAttr(): JsxAttrValue {
    this.advance() // consume opening {
    let value = ''
    let depth = 1
    while (!this.eof() && depth > 0) {
      if (this.at() === '{') depth++
      else if (this.at() === '}') {
        depth--
        if (depth === 0) break
      }
      value += this.advance()
    }
    if (!this.eof()) this.advance() // consume closing }
    return { kind: 'expr', value: value.trim() }
  }

  /**
   * Parse a JSX expression block: { ... }
   * Handles .map() expressions and plain text expressions.
   */
  private parseJsxExpressionBlock(): JsxNode | null {
    const startLine = this.line
    const startCol = this.col

    this.advance() // consume {

    // Read full content until matching }
    let content = ''
    let depth = 1
    while (!this.eof() && depth > 0) {
      if (this.at() === '{') depth++
      else if (this.at() === '}') {
        depth--
        if (depth === 0) break
      }
      content += this.advance()
    }
    if (!this.eof()) this.advance() // consume closing }

    // Try to match .map((item) => (...))
    const mapMatch = content.match(
      /^([\w.[\]]+)\s*\.map\(\s*\(\s*(\w+)(?:\s*,\s*(\w+))?\s*\)\s*=>\s*\(/,
    )

    if (mapMatch) {
      const arrayExpr = mapMatch[1].trim()
      const itemName = mapMatch[2]
      const indexName = mapMatch[3]
      const bodyStart = mapMatch[0].length

      // Body ends at the last ))
      const bodyEnd = content.lastIndexOf('))')
      if (bodyEnd > bodyStart) {
        const bodyJsx = content.slice(bodyStart, bodyEnd).trim()

        // Re-parse the body as JSX
        const bodyParser = new Parser(bodyJsx)
        const bodyNodes = bodyParser.parse()

        // Propagate errors with adjusted line numbers
        for (const err of bodyParser.errors) {
          this.errors.push({
            ...err,
            line: err.line + startLine - 1,
          })
        }

        return {
          kind: 'map',
          arrayExpr,
          itemName,
          indexName,
          children: bodyNodes,
          line: startLine,
          column: startCol,
        }
      }
    }

    // Try to match condition && <Element /> pattern
    const andIdx = findLogicalAnd(content)
    if (andIdx !== -1) {
      const condition = content.slice(0, andIdx).trim()
      const body = content.slice(andIdx + 2).trim()
      if (body.startsWith('<')) {
        const bodyParser = new Parser(body)
        const bodyNodes = bodyParser.parse()

        for (const err of bodyParser.errors) {
          this.errors.push({
            ...err,
            line: err.line + startLine - 1,
          })
        }

        return {
          kind: 'conditional',
          condition,
          children: bodyNodes,
          line: startLine,
          column: startCol,
        }
      }
    }

    // Not a map or conditional — return as text (e.g. plain expression like {someVar})
    return {
      kind: 'text',
      value: content.trim(),
      line: startLine,
      column: startCol,
    }
  }

  private parseNunjucksBlock(): JsxNunjucksBlock {
    const startLine = this.line
    const startCol = this.col
    let raw = ''
    raw += this.advance(2) // consume '{%'

    while (!this.eof()) {
      if (this.peek('%}')) {
        raw += this.advance(2)
        break
      }
      raw += this.advance()
    }

    return { kind: 'nunjucks', raw, line: startLine, column: startCol }
  }

  private parseNunjucksExpr(): JsxNunjucksBlock {
    const startLine = this.line
    const startCol = this.col
    let raw = ''
    raw += this.advance(2) // consume '{{'

    while (!this.eof()) {
      if (this.peek('}}')) {
        raw += this.advance(2)
        break
      }
      raw += this.advance()
    }

    return { kind: 'nunjucks', raw, line: startLine, column: startCol }
  }

  private parseNunjucksComment(): void {
    this.advance(2) // consume '{#'
    while (!this.eof()) {
      if (this.peek('#}')) {
        this.advance(2)
        return
      }
      this.advance()
    }
  }

  private parseTextContent(): JsxText {
    const startLine = this.line
    const startCol = this.col
    let value = ''
    while (
      !this.eof() &&
      this.at() !== '<' &&
      this.at() !== '{' &&
      !this.peek('{%') &&
      !this.peek('{{') &&
      !this.peek('{#')
    ) {
      value += this.advance()
    }
    return { kind: 'text', value, line: startLine, column: startCol }
  }
}

// ---------------------------------------------------------------------------
// Logical && finder (for {condition && <Element />} patterns)
// ---------------------------------------------------------------------------

/**
 * Find the position of `&&` at depth 0 in an expression string.
 * Returns the index of the first `&`, or -1 if not found.
 */
function findLogicalAnd(expr: string): number {
  let depth = 0
  let inString: string | null = null

  for (let i = 0; i < expr.length - 1; i++) {
    const ch = expr[i]
    const prev = i > 0 ? expr[i - 1] : ''

    if ((ch === '"' || ch === "'") && prev !== '\\') {
      if (inString === ch) inString = null
      else if (!inString) inString = ch
      continue
    }
    if (inString) continue

    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') depth--
    else if (ch === '&' && expr[i + 1] === '&' && depth === 0) {
      return i
    }
  }

  return -1
}

// ---------------------------------------------------------------------------
// Ternary expression parser
// ---------------------------------------------------------------------------

interface Ternary {
  condition: string
  trueExpr: string
  falseExpr: string
}

/**
 * Parse a JS ternary expression `condition ? trueExpr : falseExpr`.
 * Correctly handles nested braces, brackets, and parens.
 */
function parseTernary(expr: string): Ternary | null {
  let depth = 0
  let inString: string | null = null
  let questionPos = -1

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    const prev = i > 0 ? expr[i - 1] : ''

    // Handle strings
    if ((ch === '"' || ch === "'") && prev !== '\\') {
      if (inString === ch) inString = null
      else if (!inString) inString = ch
      continue
    }
    if (inString) continue

    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') depth--
    else if (ch === '?' && depth === 0) {
      questionPos = i
      break
    }
  }

  if (questionPos === -1) return null

  // Find the matching : at depth 0, starting after ?
  depth = 0
  inString = null
  let colonPos = -1

  for (let i = questionPos + 1; i < expr.length; i++) {
    const ch = expr[i]
    const prev = i > 0 ? expr[i - 1] : ''

    if ((ch === '"' || ch === "'") && prev !== '\\') {
      if (inString === ch) inString = null
      else if (!inString) inString = ch
      continue
    }
    if (inString) continue

    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') depth--
    else if (ch === ':' && depth === 0) {
      colonPos = i
      break
    }
  }

  if (colonPos === -1) return null

  return {
    condition: expr.slice(0, questionPos).trim(),
    trueExpr: expr.slice(questionPos + 1, colonPos).trim(),
    falseExpr: expr.slice(colonPos + 1).trim(),
  }
}

// ---------------------------------------------------------------------------
// JS object literal → nunjucks JSON emitter
// ---------------------------------------------------------------------------

/**
 * Split a JS object literal's inner content by commas at depth 0.
 */
function splitByComma(inner: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inString: string | null = null
  let current = ''

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    const prev = i > 0 ? inner[i - 1] : ''

    if ((ch === '"' || ch === "'") && prev !== '\\') {
      if (inString === ch) inString = null
      else if (!inString) inString = ch
    }

    if (!inString) {
      if (ch === '{' || ch === '(' || ch === '[') depth++
      else if (ch === '}' || ch === ')' || ch === ']') depth--
      else if (ch === ',' && depth === 0) {
        parts.push(current.trim())
        current = ''
        continue
      }
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/**
 * Emit a JS object literal like `{ size: 1, color: item.color }` as a
 * nunjucks JSON template: `{"size":1,"color":{{ (item.color) | tojson }}}`.
 */
function emitJsObjectLiteral(expr: string): string {
  const inner = expr.slice(1, -1).trim()
  if (!inner) return '{}'

  const pairs = splitByComma(inner)
  const jsonPairs = pairs.map((pair) => {
    // Find the first : at depth 0
    let depth = 0
    let inString: string | null = null
    let colonPos = -1

    for (let i = 0; i < pair.length; i++) {
      const ch = pair[i]
      const prev = i > 0 ? pair[i - 1] : ''

      if ((ch === '"' || ch === "'") && prev !== '\\') {
        if (inString === ch) inString = null
        else if (!inString) inString = ch
        continue
      }
      if (inString) continue

      if (ch === '{' || ch === '(' || ch === '[') depth++
      else if (ch === '}' || ch === ')' || ch === ']') depth--
      else if (ch === ':' && depth === 0) {
        colonPos = i
        break
      }
    }

    if (colonPos === -1) return ''
    const key = pair.slice(0, colonPos).trim()
    const val = pair.slice(colonPos + 1).trim()
    return `${JSON.stringify(key)}:${emitExprValue(val)}`
  }).filter(Boolean)

  return `{${jsonPairs.join(',')}}`
}

// ---------------------------------------------------------------------------
// Expression value emitter
// ---------------------------------------------------------------------------

/**
 * Emit a JS expression value as nunjucks JSON.
 * Handles ternaries, object literals, string literals, numbers, booleans,
 * and variable references.
 */
function emitExprValue(expr: string): string {
  const trimmed = expr.trim()

  // Check for ternary
  const ternary = parseTernary(trimmed)
  if (ternary) return emitTernaryValue(ternary)

  // undefined → null in JSON
  if (trimmed === 'undefined') return 'null'

  // Literal values: numbers, booleans, null
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
  if (/^(true|false|null)$/.test(trimmed)) return trimmed

  // String literals
  if (/^".*"$/.test(trimmed)) return trimmed
  if (/^'(.*)'$/.test(trimmed)) return JSON.stringify(trimmed.slice(1, -1))

  // JS object literal → JSON with nunjucks vars
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    // Check if it's valid JSON first
    try { JSON.parse(trimmed); return trimmed } catch { /* not JSON */ }
    return emitJsObjectLiteral(trimmed)
  }

  // Array literal
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try { JSON.parse(trimmed); return trimmed } catch { /* not JSON */ }
  }

  // Variable reference
  return `{{ (${trimmed}) | tojson }}`
}

/**
 * Emit a ternary as a nunjucks conditional.
 */
function emitTernaryValue(t: Ternary): string {
  const trueVal = emitExprValue(t.trueExpr)
  const falseVal = emitExprValue(t.falseExpr)
  return `{% if ${t.condition} %}${trueVal}{% else %}${falseVal}{% endif %}`
}

// ---------------------------------------------------------------------------
// Emitter: AST → nunjucks JSON template string
// ---------------------------------------------------------------------------

/** Check if a string value contains nunjucks expressions */
function containsNunjucksExpr(value: string): boolean {
  return /\{\{.*?\}\}/.test(value)
}

/**
 * Convert a string attribute value to its JSON representation in nunjucks.
 * If the value is a pure nunjucks expression like "{{ title }}",
 * emit it as `{{ title | tojson }}` (unquoted, produces a JSON value).
 * If it's a static string, emit as a JSON string literal.
 * If it's a mixed string like "Hello {{ name }}", use nunjucks concatenation.
 */
function emitStringValue(value: string): string {
  if (!containsNunjucksExpr(value)) {
    // Pure static string
    return JSON.stringify(value)
  }

  // Check if the entire value is a single nunjucks expression
  const singleExprMatch = value.match(/^\{\{\s*(.*?)\s*\}\}$/)
  if (singleExprMatch) {
    const expr = singleExprMatch[1]
    // If it already has | tojson, don't add it again
    if (expr.includes('| tojson') || expr.includes('|tojson')) {
      return `{{ ${expr} }}`
    }
    return `{{ (${expr}) | tojson }}`
  }

  // Mixed content: "Hello {{ name }}, welcome!"
  // Build a nunjucks concatenation expression
  const parts: string[] = []
  const exprPattern = /\{\{\s*(.*?)\s*\}\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = exprPattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push(JSON.stringify(value.slice(lastIndex, match.index)))
    }
    const expr = match[1]
    parts.push(`(${expr})`)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < value.length) {
    parts.push(JSON.stringify(value.slice(lastIndex)))
  }

  return `{{ (${parts.join(' ~ ')}) | tojson }}`
}

/**
 * Check if a string is a JSON-safe literal (number, boolean, null, object, array).
 * If not, it's a variable reference that needs nunjucks wrapping.
 */
function isLiteralExpr(value: string): boolean {
  // Numbers (including negative and floats)
  if (/^-?\d+(\.\d+)?$/.test(value)) return true
  // Booleans and null
  if (/^(true|false|null)$/.test(value)) return true
  // JSON objects or arrays (starts with { or [)
  if (/^\{[\s\S]*\}$/.test(value) || /^\[[\s\S]*\]$/.test(value)) {
    try { JSON.parse(value); return true } catch { /* not valid JSON, could be a variable */ }
  }
  // Quoted strings
  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) return true
  return false
}

/**
 * Emit a single attribute's JSON key:value pair.
 */
function emitAttr(name: string, value: JsxAttrValue): string {
  const key = JSON.stringify(name)
  switch (value.kind) {
    case 'boolean':
      return `${key}:true`
    case 'string':
      return `${key}:${emitStringValue(value.value)}`
    case 'expr': {
      const v = value.value

      // Check for ternary expression
      const ternary = parseTernary(v)
      if (ternary) {
        return `${key}:${emitTernaryValue(ternary)}`
      }

      if (isLiteralExpr(v)) {
        // Literal value: output as-is in JSON
        return `${key}:${v}`
      }

      // undefined → omit entirely or emit null
      if (v === 'undefined') {
        return `${key}:null`
      }

      // JS object literal (non-JSON)
      if (v.startsWith('{') && v.endsWith('}')) {
        return `${key}:${emitJsObjectLiteral(v)}`
      }

      // Variable reference: wrap in nunjucks tojson filter
      return `${key}:{{ (${v}) | tojson }}`
    }
  }
}

/**
 * Check if children contain any dynamic blocks (conditionals, maps, nunjucks)
 * that could produce variable-length output, requiring the accumulator pattern.
 */
function hasDynamicChildren(children: JsxNode[]): boolean {
  return children.some((c) => c.kind === 'conditional' || c.kind === 'map' || c.kind === 'nunjucks')
}

/**
 * Emit a JSX element as a JSON object in the nunjucks template.
 */
function emitElement(node: JsxElement): string {
  const parts: string[] = [`"type":${JSON.stringify(node.tag)}`]

  for (const [name, value] of node.attrs) {
    parts.push(emitAttr(name, value))
  }

  const childOutputs = emitChildren(node.children)

  if (childOutputs.length > 0) {
    if (hasDynamicChildren(node.children)) {
      // Use accumulator pattern: each child emits with a leading comma,
      // then we strip the first comma. This handles conditionals that
      // may produce nothing without leaving stray commas.
      const accumulated = node.children
        .map((child) => {
          if (child.kind === 'text' && !child.value.trim()) return ''
          const output = emitNode(child)
          if (!output) return ''
          // Dynamic blocks manage their own comma (they may emit nothing)
          if (child.kind === 'conditional') return output
          // Static children always get a leading comma
          return `,${output}`
        })
        .join('')
      parts.push(
        `"children":[` +
        `{%- set _ch -%}${accumulated}{%- endset -%}` +
        `{{- (_ch[1:] if _ch and _ch[0] == ',' else _ch) -}}` +
        `]`,
      )
    } else {
      parts.push(`"children":[${childOutputs.join(',')}]`)
    }
  }

  return `{${parts.join(',')}}`
}

/**
 * Emit a .map() block as a nunjucks for loop.
 * Uses the _c accumulator pattern to handle JSON array comma separation.
 */
function emitMapBlock(node: JsxMapBlock): string {
  const bodyOutputs = emitChildren(node.children)
  const bodyJson = bodyOutputs.join(',')

  // Use the accumulator pattern: collect with leading comma, strip first
  return (
    `{%- set _c -%}` +
    `{%- for ${node.itemName} in ${node.arrayExpr} -%}` +
    `,${bodyJson}` +
    `{%- endfor -%}` +
    `{%- endset -%}` +
    `{{- (_c[1:] if _c and _c[0] == ',' else _c) -}}`
  )
}

/**
 * Emit a conditional block as a nunjucks {% if %} wrapper.
 * Includes a leading comma inside the block so that when the condition
 * is false, no stray comma is left in the JSON array.
 */
function emitConditionalBlock(node: JsxConditionalBlock): string {
  const bodyOutputs = emitChildren(node.children)
  return `{%- if ${node.condition} -%},${bodyOutputs.join(',')}{%- endif -%}`
}

/**
 * Emit a single node to its nunjucks JSON fragment.
 */
function emitNode(node: JsxNode): string {
  switch (node.kind) {
    case 'element': return emitElement(node)
    case 'nunjucks': return node.raw
    case 'map': return emitMapBlock(node)
    case 'conditional': return emitConditionalBlock(node)
    case 'text': return node.value.trim()
  }
}

/**
 * Emit an array of child nodes. Returns an array of JSON fragments.
 * Nunjucks blocks are emitted as-is (they wrap/generate child JSON objects).
 */
function emitChildren(children: JsxNode[]): string[] {
  const outputs: string[] = []

  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    switch (child.kind) {
      case 'element':
        outputs.push(emitElement(child))
        break
      case 'nunjucks':
        outputs.push(child.raw)
        break
      case 'map':
        outputs.push(emitMapBlock(child))
        break
      case 'conditional':
        outputs.push(emitConditionalBlock(child))
        break
      case 'text':
        // Ignore whitespace-only text nodes
        if (child.value.trim()) {
          // Non-empty text: could be a nunjucks expression or literal
          outputs.push(child.value.trim())
        }
        break
    }
  }

  return outputs
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseJsx(source: string): { ast: JsxNode[]; errors: JsxError[] } {
  const parser = new Parser(source.trim())
  const ast = parser.parse()
  return { ast, errors: parser.errors }
}

export function compileJsx(source: string): string {
  const { ast, errors } = parseJsx(source)

  if (errors.length > 0) {
    const errorMsgs = errors.map((e) => `Line ${e.line}:${e.column}: ${e.message}`).join('\n')
    throw new Error(`JSX parse error:\n${errorMsgs}`)
  }

  // A widget template must be a single root element
  // Filter out text nodes that are just whitespace
  const rootNodes = ast.filter(
    (n) => n.kind !== 'text' || n.value.trim() !== '',
  )

  if (rootNodes.length === 0) {
    throw new Error('Empty template: no root element found')
  }

  if (rootNodes.length === 1 && rootNodes[0].kind === 'element') {
    return emitElement(rootNodes[0])
  }

  // Multiple root nodes or nunjucks at root level - wrap as-is
  // This handles cases like {% if %}<Card>...{% else %}<Card>...{% endif %}
  const outputs = rootNodes.map((n) => {
    switch (n.kind) {
      case 'element': return emitElement(n)
      case 'nunjucks': return n.raw
      case 'map': return emitMapBlock(n)
      case 'conditional': return emitConditionalBlock(n)
      case 'text': return n.value.trim()
    }
  })

  return outputs.join('')
}

/**
 * Validate JSX source and return errors without throwing.
 * Also attempts compilation to catch emitter-level issues.
 */
export function validateJsxSource(source: string): JsxError[] {
  const { errors } = parseJsx(source)
  if (errors.length > 0) return errors

  try {
    compileJsx(source)
    return []
  } catch (err) {
    return [{
      message: err instanceof Error ? err.message : String(err),
      line: 1,
      column: 1,
      offset: 0,
    }]
  }
}
