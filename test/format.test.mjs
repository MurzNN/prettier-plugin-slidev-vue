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

test('preserves blank-line Markdown lists and headings inside Vue components', async () => {
  const source = `<div class="flex flex-col gap-4">
  <p class="text-white p-2">Placeholder lead-in.</p>

## Sample region heading

  <v-clicks>

- Alpha placeholder item for Sample City.
- Beta placeholder item for Sample Harbor.

  </v-clicks>

</div>
`
  const result = await format(source, options)
  assert.match(result, /^## Sample region heading$/m)
  assert.match(
    result,
    /<v-clicks>\n\n- Alpha placeholder item for Sample City\.\n- Beta placeholder item for Sample Harbor\.\n\n<\/v-clicks>/,
  )
  assert.doesNotMatch(result, /^ {2}<\/v-clicks>/m)
  assert.doesNotMatch(result, /- Alpha placeholder item for Sample City\. - Beta/)
  assert.equal(await format(result, options), result)
})

test('keeps v-clicks flush when it wraps a blank-line Markdown list', async () => {
  const source = `<div
  class="iw-modal bg-white"
>
<v-clicks at="7">

- Hello, is Bob there?
- Sure, thank you, bye!

</v-clicks>
</div>
`
  const result = await format(source, options)
  assert.equal(
    result,
    `<div class="iw-modal bg-white">
<v-clicks at="7">

- Hello, is Bob there?
- Sure, thank you, bye!

</v-clicks>
</div>
`,
  )
  assert.doesNotMatch(result, /^ {2}<v-clicks/m)
  assert.doesNotMatch(result, /^ {2}<\/v-clicks>/m)
  assert.equal(await format(result, options), result)
})

test('preserves indented blank-line Markdown lists inside a div', async () => {
  const source = `<div class="iw-modal bg-white">
  <p>You call them and...</p>

  - Hello, is Bob there?
  - Yes, this is Bob, how can I help you?
  - Sorry, 14 or 15?

  (recording)

</div>
`
  const result = await format(source, options)
  assert.match(
    result,
    /<p>You call them and\.\.\.<\/p>\n\n- Hello, is Bob there\?\n- Yes, this is Bob, how can I help you\?\n- Sorry, 14 or 15\?\n\n\(recording\)\n\n<\/div>/,
  )
  assert.doesNotMatch(result, /Hello, is Bob there\? - Yes/)
  assert.doesNotMatch(result, /^ {2}- Yes/m)
  assert.equal(await format(result, options), result)
})

test('preserves blank-line Markdown images inside a div', async () => {
  const source = `<div class="mt-24">

![](/photo-rectangles.png)

</div>
`
  const result = await format(source, options)
  assert.equal(result, `<div class="mt-24">

![](/photo-rectangles.png)

</div>
`)
  assert.doesNotMatch(result, /<div class="mt-24">!\[\]/)
  assert.equal(await format(result, options), result)
})

test('preserves blank-line Mermaid fences inside v-click', async () => {
  const source = `<v-click at="1">

\`\`\`mermaid
mindmap
  root((Placeholder root))
    Branch one
      Leaf A
\`\`\`

</v-click>
`
  const result = await format(source, options)
  assert.match(result, /<v-click at="1">\n\n```mermaid\nmindmap\n  root\(\(Placeholder root\)\)\n    Branch one\n      Leaf A\n```\n\n<\/v-click>/)
  assert.doesNotMatch(result, /```mermaid mindmap/)
  assert.equal(await format(result, options), result)
})

test('preserves blank-line lists that contain inline HTML tags', async () => {
  const source = `<PointingBubble class="p-6">
  <h2>Placeholder heading</h2>

  <v-clicks at="23">

- <span class="font-bold">NO</span> exploring the internet for Sample City.
- <span class="font-bold">NO</span> manual calls for Sample Harbor.

  </v-clicks>

</PointingBubble>
`
  const result = await format(source, options)
  assert.match(result, /- <span class="font-bold">NO<\/span> exploring the internet for Sample City\./)
  assert.match(result, /- <span class="font-bold">NO<\/span> manual calls for Sample Harbor\./)
  assert.doesNotMatch(result, /companies! -/)
  assert.equal(await format(result, options), result)
})

test('preserves blank-line nested checkbox lists inside a div', async () => {
  const source = `<div id="categories-list" class="h-56">

- <input type="checkbox" /> Tourism and travel
- <input type="checkbox" /> Repair services
  - <input type="checkbox" /> Smartphones repair
  - <input type="checkbox" /> Computer repair
- <input type="checkbox" /> Legal services

</div>
`
  const result = await format(source, options)
  assert.match(result, /- <input type="checkbox" \/> Tourism and travel\n/)
  assert.match(result, /- <input type="checkbox" \/> Repair services\n/)
  assert.match(result, /  - <input type="checkbox" \/> Smartphones repair\n/)
  assert.match(result, /- <input type="checkbox" \/> Legal services\n/)
  assert.doesNotMatch(result, /Tourism and travel -/)
  assert.equal(await format(result, options), result)
})

test('still Vue-formats component bodies without a blank-line Markdown zone', async () => {
  const source = `<v-clicks>
- Alpha placeholder item.
- Beta placeholder item.
</v-clicks>
`
  const result = await format(source, options)
  assert.match(result, /<v-clicks> - Alpha placeholder item\. - Beta placeholder item\. <\/v-clicks>/)
  assert.doesNotMatch(result, /<v-clicks>\n\n- Alpha/)
  assert.equal(await format(result, options), result)
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
