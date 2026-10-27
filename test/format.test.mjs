import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { format } from 'prettier'
import plugin from '../index.js'
import { fileURLToPath } from 'node:url'

const options = { parser: 'slidev', plugins: [plugin], filepath: 'slides.md' }

test('formats multiline Vue attributes without a blank line before the closing bracket', async () => {
  const expected = '<button\n  class="flex rounded-lg bg-blue-500 p-4 text-white"\n  disabled="{loading}"\n  type="submit"\n>'
  for (const tag of [
    expected,
    '<button\nclass="flex rounded-lg bg-blue-500 p-4 text-white"\ndisabled="{loading}"\ntype="submit"\n\n>',
  ]) {
    const result = await format(`${tag}\nSubmit\n</button>\n`, options)
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
  const source = '# Code\n\n```text\n<Foo class="example">\n```\n\n`<Bar>`\n\n<button\n  type="submit"\n  disabled="{loading}"\n>\nSubmit\n</button>\n'
  const result = await format(source, options)
  assert.match(result, /```text\n<Foo class="example">\n```/)
  assert.match(result, /`<Bar>`/)
  assert.match(result, /<button type="submit" disabled="\{loading\}">/)
  assert.equal(await format(result, options), result)
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
    new URL('../example/example.md', import.meta.url),
    'utf8',
  )
  const expected = await readFile(
    new URL('../example/example.formatted.md', import.meta.url),
    'utf8',
  )
  const result = await format(source, options)
  assert.equal(result, expected)
  assert.equal(await format(result, options), expected)
})
