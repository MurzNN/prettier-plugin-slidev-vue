import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { format } from 'prettier'
import plugin from '../index.js'
import { fileURLToPath } from 'node:url'
import { createMarkdownExit } from 'markdown-exit'
import { componentPlugin } from '@mdit-vue/plugin-component'
import comark from '@comark/markdown-it'

const options = { parser: 'slidev', plugins: [plugin], filepath: 'slides.md' }

async function renderSlidev(markdown) {
  const md = createMarkdownExit({ html: true, linkify: true })
  md.use(componentPlugin)
  md.use(comark)
  return md.renderAsync(markdown)
}

function assertSlidevRawHtml(html, tag = 'span') {
  assert.ok(!html.includes('="true"'), html)
  assert.ok(!html.includes(`&lt;${tag}`), html)
  assert.ok(!html.includes('<blockquote>'), html)
}

test('formats multiline Vue attributes without a blank line before the closing bracket', async () => {
  const expected = '<div>\n  <button\n    class="flex rounded-lg bg-blue-500 p-4 text-white"\n    disabled="{loading}"\n    type="submit"\n  >'
  for (const inner of [
    '<button\n  class="flex rounded-lg bg-blue-500 p-4 text-white"\n  disabled="{loading}"\n  type="submit"\n>\nSubmit\n</button>',
    '<button\nclass="flex rounded-lg bg-blue-500 p-4 text-white"\ndisabled="{loading}"\ntype="submit"\n\n>\nSubmit\n</button>',
  ]) {
    const result = await format(`<div>\n${inner}\n</div>\n`, options)
    assert.ok(result.startsWith(expected), result)
    assert.equal(await format(result, options), result)
  }
})

test('indents nested Vue elements while keeping the extracted root unindented', async () => {
  const source = '<section>\n<h2>Title</h2>\n<div>\n<p>Body</p>\n</div>\n</section>\n'
  const result = await format(source, options)
  assert.ok(result.startsWith(
    '<section>\n  <h2>Title</h2>\n  <div>\n    <p>Body</p>\n  </div>\n</section>',
  ), result)
  assert.equal(await format(result, options), result)
})

test('formats Markdown and frontmatter while retaining Vue directive syntax', async () => {
  const source = '---\ntitle:    Test\n---\n\n#   Heading\n\n<PointingBubble\n  v-click.up="15"\n  :target="{ x: 340, y: 390 }"\n  placement="manual"\n>\nText\n</PointingBubble>\n\n---\ntransition:    slide-up\n---\n\n# Second\n'
  const result = await format(source, options)
  assert.match(result, /title: Test/)
  assert.match(result, /# Heading/)
  assert.match(result, /transition: slide-up/)
  assert.match(result, /v-click\.up="15"/)
  assert.match(result, /:target="\{ x: 340, y: 390 \}"/)
  assert.equal(await format(result, options), result)
})

test('does not extract Vue tags inside fenced or inline code', async () => {
  const source = '# Code\n\n```text\n<Foo class="example">\n```\n\n`<Bar>`\n\n<div>\n<button\n  type="submit"\n  disabled="{loading}"\n>\nSubmit\n</button>\n</div>\n'
  const result = await format(source, options)
  assert.match(result, /```text\n<Foo class="example">\n```/)
  assert.match(result, /`<Bar>`/)
  assert.match(result, /<button type="submit" disabled="\{loading\}">/)
  assert.equal(await format(result, options), result)
})

test('rewrites empty multiline inline tags to self-closing for Slidev Markdown', async () => {
  const source = `<span v-if="$clicks === 7" @vue:mounted="$cursor.moveTo('#mf1-msg4 .btn-offer'); $timeout(() => { $cursor.click(); }, 1000);"></span>\n`
  const result = await format(source, options)
  assert.match(result, /@vue:mounted="/)
  assert.match(result, /\/>\s*$/)
  assert.doesNotMatch(result, /><\/span>/)
  assert.equal(await format(result, options), result)
  assertSlidevRawHtml(await renderSlidev(result))
})

test('keeps empty block tags and nested empty spans unchanged', async () => {
  const source = `<div v-if="$clicks === 7" @vue:mounted="$timeout(() => { $cursor.click(); }, 1000);"></div>\n`
  const result = await format(source, options)
  assert.match(result, /<\/div>\s*$/)
  assert.equal(await format(result, options), result)
  assertSlidevRawHtml(await renderSlidev(result), 'div')

  const nested = await format(
    `<div class="p-4">\n  <span v-if="$clicks === 9" @vue:mounted="$timeout(() => { $cursor.click(); }, 1000);"></span>\n</div>\n`,
    options,
  )
  assert.match(nested, /<span[\s\S]*><\/span>/)
  assert.equal(await format(nested, options), nested)
  assertSlidevRawHtml(await renderSlidev(nested))
})

test('rejects top-level multiline inline tags that still have content', async () => {
  const source = `<span
  v-click="1"
  class="very-long-class-name-that-forces-wrapping foo bar baz qux"
>in the messenger</span>
`
  await assert.rejects(
    () => format(source, { ...options, printWidth: 40 }),
    /Slidev Markdown cannot keep a multiline <span>/,
  )
})

test('Prettier alone sorts Vue attributes and UnoCSS classes', async () => {
  const source = '<PointingBubble\n  class="text-white p-4 absolute"\n  v-click.up="15"\n  :target="{ x: 340, y: 390 }"\n>\nText\n</PointingBubble>\n'
  const result = await format(source, options)
  assert.match(result, /v-click\.up="15"\n  class="absolute p-4 text-white"/)
  assert.equal(await format(result, options), result)
})

test('sorts nested Vue blocks in MDX without sorting code examples', async () => {
  const source = '# Nested\n\n```text\n<Foo class="text-white p-4 absolute" />\n```\n\n<div>\n<PointingBubble\n  class="text-white p-4 absolute"\n  v-click.up="15"\n  :target="{ x: 340, y: 390 }"\n>\nText\n</PointingBubble>\n</div>\n'
  const mdxOptions = { ...options, filepath: 'test1.mdx' }
  const result = await format(source, mdxOptions)
  assert.match(result, /```text\n<Foo class="text-white p-4 absolute" \/>\n```/)
  assert.match(result, /v-click\.up="15"\n\s+class="absolute p-4 text-white"/)
  assert.equal(await format(result, mdxOptions), result)
})

test('uses an explicitly configured UnoCSS config instead of the bundled preset', async () => {
  const source = '<div class="text-white p-4 absolute"></div>\n'
  const result = await format(source, {
    ...options,
    slidevVueUnoConfig: fileURLToPath(new URL('./fixtures/uno.config.js', import.meta.url)),
  })
  assert.match(result, /class="text-white p-4 absolute"/)
  const defaultResult = await format(source, options)
  assert.match(defaultResult, /class="absolute p-4 text-white"/)
})
test('formats the mixed Slidev and Vue example from its source file', async () => {
  const source = await readFile(
    new URL('../playground/example.md', import.meta.url),
    'utf8',
  )
  const expected = await readFile(
    new URL('../playground/example.formatted.md', import.meta.url),
    'utf8',
  )
  const result = await format(source, options)
  assert.equal(result, expected)
  assert.equal(await format(result, options), expected)
})
