# prettier-plugin-slidev-vue

A Prettier 3 plugin for **Slidev Markdown with embedded Vue components**.
It extends `prettier-plugin-slidev` to format Markdown and Vue separately,
preserve multiline component attributes, and sort Vue attributes and UnoCSS
utilities in one Prettier invocation.

## Requirements

- Node.js 24 or later
- Prettier 3.9.10 or later within major version 3

The package is ESM and runs directly from JavaScript; there is no build step.
It owns its sorting dependencies and does not load your project's ESLint config.

## Installation

Until an npm release is published, install directly from GitHub:

```sh
pnpm add -D prettier github:MurzNN/prettier-plugin-slidev-vue
```

## Configure Prettier

```js
// prettier.config.mjs
export default {
  overrides: [
    {
      files: ["slides.md", "pages/**/*.md", "*.mdx"],
      options: {
        parser: "slidev",
        plugins: ["prettier-plugin-slidev-vue"],
      },
    },
  ],
};
```

Load this plugin **instead of** `prettier-plugin-slidev`: it already includes
Slidev support. Scope overrides to your presentation files so regular Markdown
is not interpreted as a slide deck. An `.mdx` extension here means Slidev/Vue
syntax, **not React MDX**.

Run:

```sh
pnpm exec prettier --write slides.md
```

For VS Code, use the Prettier extension (`esbenp.prettier-vscode`) as the
Markdown formatter and enable format-on-save. The same config performs both
formatting and sorting; no ESLint extension or wrapper command is required.

## What it does

- Keeps Slidev frontmatter, slide separators, and presenter-note handling.
- Formats surrounding Markdown through Prettier's Markdown parser.
- Formats extracted HTML/Vue blocks through Prettier's Vue parser, including
indentation for nested component trees.
- Sorts component attributes using `vue/attributes-order` (Vue's grouped order,
not globally alphabetical order).
- Sorts UnoCSS classes and attributify utilities using UnoCSS's ESLint rules.
- Masks fenced and inline code during Vue extraction so example tags do not
consume actual components. Prettier may still format fenced code normally.

For example, an opening tag is kept properly indented without a blank line
before `>`:

```html
<button
  class="flex rounded-lg bg-blue-500 p-4 text-white"
  disabled="{loading}"
  type="submit"
>
```

## UnoCSS configuration

By default, sorting uses the bundled `presetWind3()` configuration. Unknown
classes are retained according to UnoCSS's sorting behavior.

For custom presets, shortcuts, or rules, point to your own UnoCSS config:

```js
export default {
  plugins: ["prettier-plugin-slidev-vue"],
  parser: "slidev",
  slidevVueUnoConfig: "./uno.config.ts",
};
```

`slidevVueUnoConfig` is resolved relative to the **current working directory**,
not the Prettier config file. An absolute path is also accepted. Any presets
imported by that config must be installed by the consuming project. Missing
configs and remaining sorting errors fail formatting rather than being ignored.

## Implementation

The entry point is [index.js](./index.js):

1. Delegate deck parsing, YAML, and notes to `prettier-plugin-slidev`.
2. Parse each slide's Markdown to identify code examples.
3. Parse the body as a temporary Vue template, masking code examples without
 changing source offsets.
4. Extract top-level Vue elements, including their nested components.
5. Apply sorting rules to each extracted block and format it as Vue.
6. Protect those blocks with unique comments while formatting the Markdown.
7. Restore the formatted blocks.

The ESLint `Linter` is reused across blocks. ESLint is an internal implementation
detail, not a separate formatting pass over the Markdown file.

## Limitations

- This is not a React MDX formatter or a general Markdown-to-Vue compiler.
- Vue elements are formatted as blocks. Complex inline component/Markdown
combinations and Markdown nested inside Vue elements may follow Vue
whitespace rules rather than Markdown rules.
- `embeddedLanguageFormatting: "off"` disables Slidev's embedded formatting,
including this plugin's Vue formatting and sorting.
- Other plugins that replace Slidev/Vue/Markdown printers may conflict. Start
with this plugin alone.
- The implementation depends on the Slidev plugin's parser/printer interface;
rerun the tests when upgrading Prettier or Slidev dependencies.

## Playground

Run `pnpm playground` to try the formatter at [http://127.0.0.1:3000](http://127.0.0.1:3000). The
playground calls the actual formatter through a local Node.js server. Its
source sample is [playground/example.md](./playground/example.md);
the formatted output is covered by the same fixture in the test suite.

## Development

Clone the repository and install dependencies:

```sh
git clone https://github.com/MurzNN/prettier-plugin-slidev-vue.git
cd prettier-plugin-slidev-vue
pnpm install
pnpm test
npm pack --dry-run
```

Tests cover multiline attributes, slide frontmatter, Vue directives, sorting,
code-example isolation, nested components, and stable repeated formatting.

## License

[MIT](./LICENSE) © 2026 Alexey Korepov.
