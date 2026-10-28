# Project Guidelines

## Project Overview

This is an ESM Prettier 3 plugin that extends `prettier-plugin-slidev` to format
Vue components embedded in Slidev Markdown and sort Vue attributes and UnoCSS
utilities. The package runs directly from JavaScript; there is no build step.
See [README.md](./README.md) for user configuration, installation, behavior,
and limitations.

## Architecture

- [index.js](./index.js) wraps the Slidev printer's embed hook, keeping Slidev
  handling for frontmatter, notes, and slide separators while formatting slide
  Markdown and extracted Vue blocks separately.
- Vue blocks are identified with `vue-eslint-parser`, sorted with ESLint rules,
  formatted by Prettier's Vue parser, and temporarily protected while Markdown
  is formatted. Preserve source offsets when masking code examples or changing
  extraction; fenced and inline code must not be treated as live Vue markup.
- After Vue formatting, `normalizeSlidevRoot` rewrites empty top-level CommonMark
  inline HTML tags to self-closing form and rejects multiline inline tags that
  still have content. Keep that list aligned with `@mdit-vue/plugin-component`'s
  force-inline tags. Cover both behaviors with format tests that also render
  through `markdown-exit` + `@mdit-vue/plugin-component` + `@comark/markdown-it`.
  Rejection errors must be stored on the Prettier options object and rethrown
  from `print`, because Prettier swallows `embed` failures unless
  `PRETTIER_DEBUG` is set.
- Blank-line Markdown islands inside Vue components (lists, headings, fences,
  paragraphs, …) are collected from the Markdown AST, clipped to Vue text gaps
  that contain a blank line, protected while the Vue shell is formatted, then
  restored flush with surrounding blank lines. Text gaps merge through inline
  HTML children (`span`, `input`, …) so list items are not shredded; islands
  that fall inside a tag (attribute lists) are skipped. Do not indent restored
  islands by 4+ spaces (CommonMark indented code). Cover lists, Mermaid fences,
  Markdown images in a div, inline-HTML lists, checkbox lists, and the
  no-blank-line collapse case with
  format tests; keep `playground/example.md` / `example.formatted.md` in sync.
- The default UnoCSS preset is in [uno.config.js](./uno.config.js). Tests use a
  separate empty-preset config at [test/fixtures/uno.config.js](./test/fixtures/uno.config.js).
  Custom config paths are resolved relative to the consumer's current working
  directory.

## Development and Tests

- Use Node.js 24 or later and pnpm.
- Install dependencies with `pnpm install`.
- Run the test suite with `pnpm test` (`node --test test/*.test.mjs`).
- Check the package contents with `npm pack --dry-run`; there is no build or
  lint script configured.
- Add or update tests in [test/format.test.mjs](./test/format.test.mjs) for
  formatting behavior. Preserve idempotence: formatting already-formatted
  input should produce the same output. Prefer nesting multiline inline HTML
  (`span`, `button`, …) under a block tag in fixtures so they remain valid
  Slidev Markdown.

## Change Guidelines

- Keep the plugin compatible with Prettier 3 and the Slidev printer interface;
  changes to parser/printer integration or dependency versions should be
  covered by the formatting tests.
- Formatting and sorting errors should remain visible to callers; do not
  silently skip failed sorting, missing configured files, or lost Vue blocks.
- Keep consumer UnoCSS configuration optional: the bundled Wind3 preset is the
  default, and custom presets are supplied by the consuming project.
- Record user-facing changes under `[Unreleased]` in [CHANGELOG.md](./CHANGELOG.md)
  before cutting a release. `pnpm release` uses `@release-it/keep-a-changelog`
  to move that section into the new version and feed the GitHub Release body.
  Set `GITHUB_TOKEN` (for example from `gh auth token`) so the GitHub Release
  is created via the API instead of opening a browser link.
