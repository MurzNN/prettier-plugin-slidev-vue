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
 * Sort and format Vue blocks independently of Markdown, then restore them.
 * Markdown's parser otherwise treats a standalone `>` as a blockquote and
 * strips the indentation from multiline opening tags.
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
    const content = await format(sorted.output.slice(prefix.length, -suffix.length), {
      ...options,
      parser: 'vue',
    })
    blocks.push({ marker, content: content.trimEnd() })
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
      embed(path, options) {
        // Keep Slidev's YAML, notes, and separators; intercept only slide bodies.
        const embed = printer.embed(path, options)
        if (!embed) return embed
        return (textToDoc, ...args) => embed(async (text, embeddedOptions) => {
          if (embeddedOptions.parser !== 'markdown') return textToDoc(text, embeddedOptions)
          const formatted = await formatBody(text, options)
          return doc.builders.join(doc.builders.hardline, formatted.trimEnd().split('\n'))
        }, ...args)
      },
    },
  },
}

export default plugin
