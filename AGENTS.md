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
  input should produce the same output.

## Change Guidelines

- Keep the plugin compatible with Prettier 3 and the Slidev printer interface;
  changes to parser/printer integration or dependency versions should be
  covered by the formatting tests.
- Formatting and sorting errors should remain visible to callers; do not
  silently skip failed sorting, missing configured files, or lost Vue blocks.
- Keep consumer UnoCSS configuration optional: the bundled Wind3 preset is the
  default, and custom presets are supplied by the consuming project.
