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

/** Prettier swallows embed errors unless PRETTIER_DEBUG is set; rethrow from print. */
const formatError = new WeakMap()

/**
 * Sort and format Vue blocks independently of Markdown, then restore them.
 * Markdown's parser otherwise treats a standalone `>` as a blockquote and
 * strips the indentation from multiline opening tags.
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
  const codeRanges = []
  const collectCode = (node) => {
    if (['code', 'inlineCode'].includes(node.type)) {
      codeRanges.push([node.position.start.offset, node.position.end.offset])
    }
    node.children?.forEach(collectCode)
  }
  collectCode(markdown)

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
    let marker = `<!-- slidev-vue-block-${blocks.length} -->`
    while (source.includes(marker)) marker = marker.replace(' -->', '-unique -->')
    const sorted = linter.verifyAndFix(`${prefix}${source.slice(start, end)}${suffix}`, {
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
    const content = lines.slice(1, -1)
      .map((line) => line.startsWith(indent) ? line.slice(indent.length) : line)
      .join(lineEnding)
    blocks.push({ marker, content: normalizeSlidevRoot(content.trimEnd()) })
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
