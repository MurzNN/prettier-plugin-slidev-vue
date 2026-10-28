import { doc, format } from 'prettier'
import { parsers } from 'prettier/plugins/markdown'
import slidev from 'prettier-plugin-slidev'
import vueParser from 'vue-eslint-parser'
import { Linter } from 'eslint'
import pluginVue from 'eslint-plugin-vue'
import unocss from '@unocss/eslint-config/flat'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const prefix = '<template>\n'
const suffix = '\n</template>'
const linter = new Linter()
const astFormat = slidev.parsers.slidev.astFormat
const printer = slidev.printers[astFormat]
const defaultUnoConfig = fileURLToPath(new URL('./uno.config.js', import.meta.url))

/**
 * CommonMark / mdit-vue inline HTML tags. Multiline top-level tags from this
 * set are not kept as raw HTML by Slidev's Markdown pipeline, so a line that
 * starts with `>` becomes a blockquote and Comark can rewrite `{ ... }` in
 * attribute values. Custom Vue components and block tags are unaffected.
 *
 * Mirrors `@mdit-vue/plugin-component`'s force-inline list (TAGS_INLINE minus
 * Vue reserved tags such as `template` and `slot`).
 */
const INLINE_HTML_TAGS = new Set([
  'a', 'abbr', 'acronym', 'audio', 'b', 'bdi', 'bdo', 'big', 'br', 'button',
  'canvas', 'cite', 'code', 'data', 'datalist', 'del', 'dfn', 'em', 'embed',
  'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'map', 'mark', 'meter',
  'noscript', 'object', 'output', 'picture', 'progress', 'q', 'ruby', 's',
  'samp', 'script', 'select', 'small', 'span', 'strong', 'sub', 'sup', 'svg',
  'textarea', 'time', 'u', 'tt', 'var', 'video', 'wbr',
])

/**
 * Block Markdown nodes that appear once a blank line ends an HTML/component
 * block in Slidev's Markdown pipeline. Nested children (list items, emphasis)
 * are not collected separately — the whole island is protected as one unit.
 */
const MARKDOWN_ISLAND_TYPES = new Set([
  'blockquote',
  'code',
  'heading',
  'list',
  'paragraph',
  'table',
  'thematicBreak',
])

/**
 * Parse a formatted Vue fragment as a single template root.
 *
 * @param {string} content Formatted Vue/HTML fragment.
 * @returns {import('vue-eslint-parser').AST.VElement | null}
 */
function parseRootElement(content) {
  const { ast } = vueParser.parseForESLint(`${prefix}${content}${suffix}`, {
    filePath: 'slide.vue',
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const elements = ast.templateBody.children.filter((node) => node.type === 'VElement')
  return elements.length === 1 ? elements[0] : null
}

/**
 * True when the element has no meaningful children (empty script-host tags).
 *
 * @param {import('vue-eslint-parser').AST.VElement} element
 */
function isEmptyElement(element) {
  return !element.children.some((child) => {
    if (child.type === 'VText') return Boolean(child.value.trim())
    if (child.type === 'VElement') return true
    return false
  })
}

/**
 * Make empty top-level inline HTML tags self-closing, and reject multiline
 * inline tags that still have content. Both shapes break under Slidev Markdown.
 *
 * @param {string} content Formatted Vue block restored into the slide body.
 * @returns {string}
 */
function normalizeSlidevRoot(content) {
  const root = parseRootElement(content)
  if (!root) return content

  const tag = root.rawName.toLowerCase()
  if (!INLINE_HTML_TAGS.has(tag)) return content

  const openStart = root.startTag.range[0] - prefix.length
  const openEnd = root.startTag.range[1] - prefix.length
  const openTag = content.slice(openStart, openEnd)
  const multilineOpen = /[\r\n]/.test(openTag)

  if (isEmptyElement(root)) {
    if (openTag.endsWith('/>')) return openTag.trimEnd()
    if (!openTag.endsWith('>')) return content
    return `${openTag.slice(0, -1)}/>`.trimEnd()
  }

  if (multilineOpen) {
    throw new Error(
      `Slidev Markdown cannot keep a multiline <${root.rawName}> as raw HTML. `
      + 'Keep the opening tag on one line, nest it under a block tag (div), '
      + 'or use a Vue component / block HTML tag instead.',
    )
  }

  return content
}

/**
 * Collect blank-line Markdown islands from a Prettier Markdown AST.
 * Does not recurse into an island so lists stay one range.
 *
 * @param {import('prettier').AST} node
 * @param {Array<[number, number, string]>} [ranges]
 * @returns {Array<[number, number, string]>}
 */
function collectMarkdownIslands(node, ranges = []) {
  if (MARKDOWN_ISLAND_TYPES.has(node.type) && node.position) {
    ranges.push([node.position.start.offset, node.position.end.offset, node.type])
    return ranges
  }
  for (const child of node.children ?? []) collectMarkdownIslands(child, ranges)
  return ranges
}

/**
 * Block-ish Vue children that should bound Markdown text gaps. Inline HTML
 * (`span`, `input`, `a`, …) is merged into the surrounding gap so a list item
 * like `- <span>NO</span> text` is not shredded into tiny fragments.
 *
 * @param {import('vue-eslint-parser').AST.VElement} element
 */
function isBlockishVueChild(element) {
  return !INLINE_HTML_TAGS.has(element.rawName.toLowerCase())
}

/**
 * Absolute text gaps inside a Vue element: between the opening tag and the
 * first block-ish child, between block-ish siblings, and before the closing
 * tag. Inline children are included in the surrounding gap rather than
 * splitting it. Nested block elements contribute their own gaps.
 *
 * @param {import('vue-eslint-parser').AST.VElement} element
 * @param {number} prefixLen Length of the temporary `<template>\n` prefix.
 * @param {Array<[number, number]>} [gaps]
 * @returns {Array<[number, number]>}
 */
function collectVueTextGaps(element, prefixLen, gaps = []) {
  let cursor = element.startTag.range[1] - prefixLen
  /** @type {number | null} */
  let pendingGapStart = null
  for (const child of element.children) {
    if (child.type !== 'VElement') continue
    const childStart = child.range[0] - prefixLen
    if (!isBlockishVueChild(child)) {
      // Fold inline tags into the open gap; do not close it yet.
      if (pendingGapStart === null) pendingGapStart = cursor
      continue
    }
    const gapStart = pendingGapStart === null ? cursor : pendingGapStart
    if (childStart > gapStart) gaps.push([gapStart, childStart])
    pendingGapStart = null
    collectVueTextGaps(child, prefixLen, gaps)
    cursor = child.range[1] - prefixLen
  }
  if (element.endTag) {
    const closeStart = element.endTag.range[0] - prefixLen
    const gapStart = pendingGapStart === null ? cursor : pendingGapStart
    if (closeStart > gapStart) gaps.push([gapStart, closeStart])
  }
  return gaps
}

/**
 * True when `offset` sits inside an HTML/Vue tag (after `<` and before the
 * matching `>`). Protecting Markdown islands there would splice placeholders
 * into attribute lists (for example a lone `>` line parsed as a blockquote).
 *
 * @param {string} source
 * @param {number} offset
 */
function isInsideHtmlTag(source, offset) {
  const before = source.slice(0, offset)
  return before.lastIndexOf('<') > before.lastIndexOf('>')
}

/**
 * True when `text` contains a blank line (Slidev's signal that an HTML block
 * ended and Markdown resumed).
 *
 * @param {string} text
 */
function hasBlankLine(text) {
  return /\n[ \t]*\n/.test(text)
}

/**
 * Indented Vue/HTML mistaken for a CommonMark code block (4-space indent after
 * a blank line). Real fences like Mermaid may contain `<br>`; structural Vue
 * tags mean this is markup, not an island to protect.
 *
 * @param {string} text
 */
function isFalseHtmlCodeIsland(text) {
  return /(?:^|\n)[ \t]*<\/?(?:div|span|p|button|template|v-[\w-]+)[\s>/]/i.test(text)
    || /(?:\sv-(?:click|if|else|for|show|model|bind|on|slot|html)\b|@vue:)/.test(text)
}

/**
 * Paragraphs that absorbed a closing tag after an HTML block ended mid-tag
 * (for example `Submit\n</button>`), or other nodes that are not safe to lift
 * out of the Vue shell.
 *
 * @param {string} type
 * @param {string} text
 */
function isUnsafeIsland(type, text) {
  if (text.trim() === '>') return true
  if (type === 'code' && isFalseHtmlCodeIsland(text)) return true
  // Closing tags mean CommonMark split a Vue element; leave it to Vue format.
  if (type === 'paragraph' && /<\/[A-Za-z]/.test(text)) return true
  if (type === 'blockquote' && /<\/[A-Za-z]/.test(text)) return true
  return false
}

/**
 * Keep only the parts of Markdown island ranges that sit in Vue text gaps that
 * are real blank-line Markdown zones. This drops false intersections where a
 * loose CommonMark list range overlaps ordinary `<p>…</p>` text, skips islands
 * inside tags, and ignores a lone `>` blockquote from a multiline open tag.
 *
 * @param {Array<[number, number, string?]>} islandRanges
 * @param {Array<[number, number]>} gaps
 * @param {string} source
 * @returns {Array<[number, number]>}
 */
function clipIslandsToGaps(islandRanges, gaps, source) {
  /** @type {Array<[number, number]>} */
  const clipped = []
  for (const [start, end, type] of islandRanges) {
    if (isInsideHtmlTag(source, start)) continue
    const raw = source.slice(start, end)
    if (isUnsafeIsland(type, raw)) continue
    for (const [gapStart, gapEnd] of gaps) {
      if (!hasBlankLine(source.slice(gapStart, gapEnd))) continue
      const nextStart = Math.max(start, gapStart)
      const nextEnd = Math.min(end, gapEnd)
      const piece = source.slice(nextStart, nextEnd)
      if (!piece.trim() || isUnsafeIsland(type, piece)) continue
      clipped.push([nextStart, nextEnd])
    }
  }
  return clipped
}

/**
 * Collect fenced/inline code ranges so tags inside examples are masked during
 * Vue extraction without shifting surrounding offsets.
 *
 * @param {import('prettier').AST} node
 * @param {Array<[number, number]>} [ranges]
 * @returns {Array<[number, number]>}
 */
function collectCodeRanges(node, ranges = []) {
  if (['code', 'inlineCode'].includes(node.type) && node.position) {
    ranges.push([node.position.start.offset, node.position.end.offset])
  }
  for (const child of node.children ?? []) collectCodeRanges(child, ranges)
  return ranges
}

/**
 * Expand an island start left over spaces/tabs on the same line. CommonMark
 * list/paragraph positions start at the first content character, so indented
 * islands inside a Vue tag otherwise keep sibling-line indent and look nested.
 *
 * @param {string} source
 * @param {number} start
 */
function expandIslandStartToLineIndent(source, start) {
  let next = start
  while (next > 0 && /[ \t]/.test(source[next - 1])) next -= 1
  return next
}

/**
 * Strip the shared leading indent from every non-empty line so a Markdown
 * island can be formatted flush, then restored at column 0.
 *
 * @param {string} text
 */
function dedentIslandText(text) {
  const lines = text.split(/\r\n?|\n/)
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^[ \t]*/)[0].length)
  if (indents.length === 0) return text.trim()
  const minIndent = Math.min(...indents)
  return lines
    .map((line) => {
      if (!line.trim()) return ''
      const lead = line.match(/^[ \t]*/)[0].length
      return line.slice(Math.min(minIndent, lead))
    })
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
}

/**
 * Sort + Prettier-format a Vue slice with no Markdown island protection.
 *
 * @param {string} slice
 * @param {import('prettier').ParserOptions & { slidevVueUnoConfig?: string }} options
 */
async function formatVueSlicePlain(slice, options) {
  const sorted = linter.verifyAndFix(`${prefix}${slice}${suffix}`, {
    files: ['**/*.vue'],
    languageOptions: { parser: vueParser },
    plugins: { vue: pluginVue, ...unocss.plugins },
    settings: {
      unocss: {
        configPath: options.slidevVueUnoConfig
          ? resolve(options.slidevVueUnoConfig)
          : defaultUnoConfig,
      },
    },
    rules: {
      'vue/attributes-order': 'error',
      'unocss/order': 'error',
      'unocss/order-attributify': 'error',
    },
  }, { filename: 'slide.vue' })
  if (sorted.messages.length) {
    throw new Error(sorted.messages.map((message) => message.message).join('\n'))
  }
  const formatted = await format(sorted.output, {
    ...options,
    parser: 'vue',
  })
  const lineEnding = formatted.match(/\r\n?|\n/)?.[0] ?? '\n'
  const lines = formatted.trimEnd().split(/\r\n?|\n/)
  if (lines[0] !== '<template>' || lines.at(-1) !== '</template>') {
    throw new Error('Prettier did not preserve the temporary Vue template wrapper')
  }
  const indent = options.useTabs ? '\t' : ' '.repeat(options.tabWidth ?? 2)
  return normalizeSlidevRoot(
    lines.slice(1, -1)
      .map((line) => line.startsWith(indent) ? line.slice(indent.length) : line)
      .join(lineEnding)
      .trimEnd(),
  )
}

async function formatVueSlice(slice, sliceStart, islandRanges, options) {
  if (islandRanges.length === 0) return formatVueSlicePlain(slice, options)

  try {
    const localIslands = islandRanges
      .map(([start, end]) => [start - sliceStart, end - sliceStart])
      .sort((a, b) => b[0] - a[0])

    let working = slice
    /** @type {Array<{ marker: string, raw: string }>} */
    const islands = []
    for (const [start, end] of localIslands) {
      let marker = `<!-- slidev-md-${islands.length} -->`
      while (working.includes(marker) || slice.includes(marker)) {
        marker = marker.replace(' -->', '-unique -->')
      }
      // Include same-line indent before the AST start (lists begin at `-`).
      const expandedStart = expandIslandStartToLineIndent(working, start)
      const raw = working.slice(expandedStart, end)
      // Keep only leading newlines (not spaces) so dedent sees every line's indent.
      const leadingNewlines = raw.match(/^\r?\n*/)[0]
      const trailingWs = raw.match(/\s*$/)[0]
      const core = dedentIslandText(
        raw.slice(leadingNewlines.length, raw.length - trailingWs.length),
      )
      if (!core.trim()) continue
      islands.push({ marker, raw: core })
      // Keep surrounding whitespace so the closing tag stays on its own line.
      working = working.slice(0, expandedStart)
        + leadingNewlines
        + marker
        + trailingWs
        + working.slice(end)
    }

    const sorted = linter.verifyAndFix(`${prefix}${working}${suffix}`, {
      files: ['**/*.vue'],
      languageOptions: { parser: vueParser },
      plugins: { vue: pluginVue, ...unocss.plugins },
      settings: {
        unocss: {
          configPath: options.slidevVueUnoConfig
            ? resolve(options.slidevVueUnoConfig)
            : defaultUnoConfig,
        },
      },
      rules: {
        'vue/attributes-order': 'error',
        'unocss/order': 'error',
        'unocss/order-attributify': 'error',
      },
    }, { filename: 'slide.vue' })
    if (sorted.messages.length) {
      throw new Error(sorted.messages.map((message) => message.message).join('\n'))
    }

    const formatted = await format(sorted.output, {
      ...options,
      parser: 'vue',
    })
    const lineEnding = formatted.match(/\r\n?|\n/)?.[0] ?? '\n'
    const lines = formatted.trimEnd().split(/\r\n?|\n/)
    if (lines[0] !== '<template>' || lines.at(-1) !== '</template>') {
      throw new Error('Prettier did not preserve the temporary Vue template wrapper')
    }
    const indent = options.useTabs ? '\t' : ' '.repeat(options.tabWidth ?? 2)
    let content = lines.slice(1, -1)
      .map((line) => line.startsWith(indent) ? line.slice(indent.length) : line)
      .join(lineEnding)
      .trimEnd()

    for (const { marker, raw } of islands.toReversed()) {
      const formattedIsland = (await format(raw, {
        ...options,
        parser: 'markdown',
      })).trimEnd()
      const index = content.indexOf(marker)
      if (index === -1) {
        throw new Error(`Slidev formatting lost Markdown island ${marker}`)
      }
      const lineStart = content.lastIndexOf('\n', index - 1) + 1
      const lineEndIdx = content.indexOf('\n', index)
      const lineEnd = lineEndIdx === -1 ? content.length : lineEndIdx
      // Keep islands flush at column 0 with blank lines around them. That matches
      // Slidev's blank-line Markdown zones and stays stable on reformat; indenting
      // list/fence lines by 4+ spaces would turn them into indented code.
      let before = content.slice(0, lineStart).replace(/[ \t]*$/, '')
      let after = content.slice(lineEnd).replace(/^[ \t]*/, '')
      if (!before.endsWith('\n')) before += '\n'
      if (!/\n\n$/.test(before)) before += '\n'
      if (!after.startsWith('\n')) after = `\n${after}`
      if (!/^\n\n/.test(after)) after = `\n${after}`
      // Vue Prettier indents nested tags, but CommonMark treats a 1–3 space
      // indent after a list as list continuation — so `  </v-clicks>` is
      // absorbed into the last <li> and Vue reports a missing end tag. Flush
      // the tags that border the island.
      before = before.replace(
        /[ \t]{1,3}(<[A-Za-z][\w:.-]*\b[^>\n]*>)\n\n$/,
        '$1\n\n',
      )
      after = after.replace(
        /^(\n+)[ \t]{1,3}(<\/[A-Za-z][\w:.-]*>)/,
        '$1$2',
      )
      content = before + formattedIsland + after
    }

    return normalizeSlidevRoot(content)
  }
  catch {
    // Ambiguous Markdown/HTML splits can leave a broken Vue shell; fall back.
    return formatVueSlicePlain(slice, options)
  }
}

/** Prettier swallows embed errors unless PRETTIER_DEBUG is set; rethrow from print. */
const formatError = new WeakMap()

/**
 * Sort and format Vue blocks independently of Markdown, then restore them.
 * Markdown's parser otherwise treats a standalone `>` as a blockquote and
 * strips the indentation from multiline opening tags.
 *
 * Blank-line Markdown zones inside components (lists, fences, headings, …) are
 * protected while the Vue shell is formatted, matching Slidev's HTML-block
 * rules: a blank line after a tag ends the HTML block and reopens Markdown.
 *
 * Empty top-level inline HTML tags (span, button, …) are rewritten as
 * self-closing so Slidev still treats them as raw HTML after format-on-save.
 *
 * @param {string} source One slide's body, excluding frontmatter.
 * @param {import('prettier').ParserOptions & { slidevVueUnoConfig?: string }} options
 *   Resolved Prettier options, including the optional consumer UnoCSS config.
 * @returns {Promise<string>} Formatted Markdown containing formatted Vue blocks.
 */
async function formatBody(source, options) {
  const markdown = await parsers.markdown.parse(source, options)
  const codeRanges = collectCodeRanges(markdown)
  const islandRanges = collectMarkdownIslands(markdown)

  // Mask code examples so their tags cannot consume real component markup.
  let templateSource = source
  for (const [start, end] of codeRanges.toReversed()) {
    templateSource = templateSource.slice(0, start)
      + templateSource.slice(start, end).replace(/[^\r\n]/g, ' ')
      + templateSource.slice(end)
  }
  const { ast } = vueParser.parseForESLint(`${prefix}${templateSource}${suffix}`, {
    filePath: 'slide.vue',
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const blocks = []
  let protectedSource = source
  const elements = ast.templateBody.children.filter((node) => node.type === 'VElement')
  // Replace from right to left so the original AST offsets stay valid.
  for (const element of elements.toReversed()) {
    const start = element.range[0] - prefix.length
    const end = element.range[1] - prefix.length
    const gaps = collectVueTextGaps(element, prefix.length)
    const clippedIslands = clipIslandsToGaps(islandRanges, gaps, source)
    let marker = `<!-- slidev-vue-block-${blocks.length} -->`
    while (source.includes(marker)) marker = marker.replace(' -->', '-unique -->')
    const content = await formatVueSlice(
      source.slice(start, end),
      start,
      clippedIslands,
      options,
    )
    blocks.push({ marker, content })
    protectedSource = protectedSource.slice(0, start) + marker + protectedSource.slice(end)
  }

  let result = await format(protectedSource, { ...options, parser: 'markdown' })
  for (const { marker, content } of blocks) {
    if (!result.includes(marker)) throw new Error(`Slidev formatting lost Vue block ${marker}`)
    result = result.replace(marker, () => content)
  }
  return result
}

/** @type {import('prettier').Plugin} */
const plugin = {
  ...slidev,
  options: {
    ...slidev.options,
    slidevVueUnoConfig: {
      type: 'path',
      category: 'Slidev Vue',
      default: '',
      description: 'Path to an UnoCSS config, relative to the current working directory.',
    },
  },
  printers: {
    ...slidev.printers,
    [astFormat]: {
      ...printer,
      print(path, options, ...args) {
        const error = formatError.get(options)
        if (error) throw error
        return printer.print(path, options, ...args)
      },
      embed(path, options) {
        // Keep Slidev's YAML, notes, and separators; intercept only slide bodies.
        const embed = printer.embed(path, options)
        if (!embed) return embed
        return (textToDoc, ...args) => embed(async (text, embeddedOptions) => {
          if (embeddedOptions.parser !== 'markdown') return textToDoc(text, embeddedOptions)
          try {
            const formatted = await formatBody(text, options)
            return doc.builders.join(doc.builders.hardline, formatted.trimEnd().split('\n'))
          }
          catch (error) {
            // Embed failures are swallowed by Prettier; fail the print pass instead.
            formatError.set(options, error)
            throw error
          }
        }, ...args)
      },
    },
  },
}

export default plugin
