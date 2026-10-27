# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MurzNN/prettier-plugin-slidev-vue/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/MurzNN/prettier-plugin-slidev-vue/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/MurzNN/prettier-plugin-slidev-vue/releases/tag/v0.1.1
