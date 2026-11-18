# guide-kit

Turns a project's Markdown guides into a static guide site: a front page with a card for every guide, a
page per guide with the contents beside it, "On this page", search, copy buttons on code, full-size
pictures, and light and dark themes. The Markdown stays the source and still reads well on GitHub.

Used by Muny (`mikedmor.com/muny/guide/`), and meant for Hearth and Arden too.

## What the guides need

- A folder of `.md` files (`guides/`), with pictures in `guides/images/`.
- `guides/README.md` as the contents: a `# Title`, an introduction, then `## Section` headings, each with
  a table whose first column links to a guide and whose second says what it covers:

  ```md
  ## Everyday money

  | Guide                 | What it covers                         |
  | --------------------- | -------------------------------------- |
  | [Budgets](budgets.md) | Budget basics, rollover, the forecast  |
  | [Changelog](../CHANGELOG.md) | What changed in each version    |
  ```

  Rows that point outside the guides (like the changelog) become links to GitHub. Guides that aren't in
  the contents still get a page, under **More**. Anything after the last table is shown at the bottom of
  the front page.

- Links between guides as GitHub writes them (`budgets.md#rollover`) keep working: headings get GitHub's
  ids. GitHub's alerts (`> [!TIP]`, `NOTE`, `IMPORTANT`, `WARNING`, `CAUTION`) become callouts.

## guide.json

Paths are relative to where you run the build (the repository's root); `logo` is relative to the
`guide.json` itself.

```json
{
  "name": "Muny",
  "src": "guides",
  "out": "public-site/guide",
  "repo": "https://github.com/mikedmor/muny",
  "branch": "main",
  "title": "Everything about Muny",
  "description": "For search engines: what the guide covers.",
  "logo": "guide-logo.svg",
  "links": [
    { "label": "Muny", "href": "../" },
    { "label": "GitHub", "href": "https://github.com/mikedmor/muny", "optional": true }
  ],
  "analytics": "<script …></script>",
  "colors": {
    "light": { "accent": "#0d9488", "accent-ink": "#0f766e", "bg": "#f6f8fb" },
    "dark": { "accent-ink": "#2dd4bf", "bg": "#050c1a" }
  }
}
```

- `links` go in the top bar. A relative `href` is from the guide's front page, so `../` is the project's
  home page. `optional` links are hidden on phones.
- `colors` override the defaults in `assets/guide.css`: `bg`, `bg-2`, `card`, `ink`, `muted`, `faint`,
  `line`, `accent`, `accent-ink` (links and highlights), `on-accent`, `glow`, `code-bg`, `code-ink`.
- `analytics` is pasted into every page's `<head>` as it is (it's yours, from your own config).

## Building

```sh
npm ci --prefix path/to/tools/guide-kit
node path/to/tools/guide-kit/build.mjs public-site/guide.json
```

It empties `out` and writes `index.html`, a folder per guide (`budgets/index.html`), `images/`,
`guide.css`, `guide.js` and `search.json`. Keep `out` out of git; build it when the site deploys:

```yaml
      - name: Get guide-kit
        uses: actions/checkout@v4
        with:
          repository: mikedmor/mikedmor.github.io
          path: .guide-kit
          sparse-checkout: tools/guide-kit
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Build the guide
        run: |
          npm ci --prefix .guide-kit/tools/guide-kit
          node .guide-kit/tools/guide-kit/build.mjs public-site/guide.json
```

A change to guide-kit reaches a project's guide the next time that project's site deploys (run its
workflow by hand to update it straight away).
