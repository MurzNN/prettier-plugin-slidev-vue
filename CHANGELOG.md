# Changelog

Each version below is generated from Conventional Commits by release-it.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3](https://github.com/MurzNN/prettier-plugin-slidev-vue/compare/v0.2.2...v0.2.3) (2026-11-07)

### Fixed

* stop formatting from copying the end of a Slidev deck ([5089017](https://github.com/MurzNN/prettier-plugin-slidev-vue/commit/50890179ee66797ce16a46ae50087f4baffb81d9))

## [0.2.2](https://github.com/MurzNN/prettier-plugin-slidev-vue/compare/v0.2.1...v0.2.2) (2026-11-06)

### Fixed

* keep long attribute-free inline tags on one line ([c6cd25e](https://github.com/MurzNN/prettier-plugin-slidev-vue/commit/c6cd25e06e8c2327db18313984b7bf137b970efb))

## [0.2.1] - 2026-10-28

### Fixed

- Protect blank-line Markdown islands (lists, headings, fences, paragraphs,
  images, …) inside Vue components so Vue formatting cannot collapse them;
  restore islands flush with blank lines for stable reformat (e.g. keep
  `![](…)` on its own lines inside `<div>`, not `<div>![](…)</div>`)
- Merge Vue text gaps through inline HTML (`span`, `input`, …) so list items are
  not shredded; skip unsafe islands (lone `>`, false indented HTML “code”,
  paragraphs that absorbed closing tags); fall back to plain Vue format if an
  island pass leaves a broken shell
- Dedent indented Markdown islands (lists whose AST starts at `-` while later
  lines still carry the Vue container indent) so Vue formatting cannot nest or
  reflow them into one wrapped paragraph
- Flush Vue tags that border a blank-line Markdown island (e.g. `<v-clicks>` /
  `</v-clicks>`) so a 1–3 space indent cannot be absorbed as CommonMark list
  continuation and break Slidev with “Element is missing end tag”

### Documentation

- Document Slidev blank-line Markdown zones inside components
- Extend the playground example with list/heading/Mermaid island cases and
  comments that contrast broken source vs fixed output

## [0.2.0] - 2026-10-27

### Fixed

- Rewrite empty top-level CommonMark inline HTML tags (`span`, `button`, and
  other mdit-vue force-inline tags) to self-closing form after Vue formatting,
  so Slidev Markdown still treats them as raw HTML
- Fail formatting when a top-level multiline inline tag still has content
  (errors are rethrown from `print`, because Prettier swallows `embed` failures)

### Documentation

- Document Slidev-safe inline HTML rules and cover them with Markdown-pipeline
  smoke tests

## [0.1.1] - 2026-10-27

### Added

- Format Slidev Markdown with embedded Vue components via Prettier 3
- Sort Vue attributes (`vue/attributes-order`) and UnoCSS utilities in one pass
- Optional `slidevVueUnoConfig` for project UnoCSS presets
- CI workflows for tests and npm publishing from GitHub Releases

[0.2.0]: https://github.com/MurzNN/prettier-plugin-slidev-vue/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/MurzNN/prettier-plugin-slidev-vue/releases/tag/v0.1.1
