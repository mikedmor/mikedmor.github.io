#!/usr/bin/env node
/**
 * guide-kit: turns a folder of Markdown guides into a static guide site.
 *
 *   node tools/guide-kit/build.mjs public-site/guide.json
 *
 * The config's paths are relative to the current directory (the project's repository root). See
 * README.md beside this file for the config and the conventions the guides follow.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const KIT = dirname(fileURLToPath(import.meta.url));
const configPath = process.argv[2];
if (!configPath) {
  console.error("Usage: node build.mjs <path to guide.json>");
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));
const need = (k) => {
  if (!config[k]) throw new Error(`${configPath}: "${k}" is required`);
  return config[k];
};
const NAME = need("name");
const SRC = need("src"); // e.g. "guides"
const OUT = need("out"); // e.g. "public-site/guide"
const REPO = need("repo").replace(/\/$/, ""); // e.g. "https://github.com/mikedmor/muny"
const BRANCH = config.branch || "main";
const SRC_IN_REPO = posix.normalize(relative(".", SRC).split("\\").join("/"));

// ------------------------------------------------------------------------------------------- utils
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const unesc = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]);
const plain = (html) => unesc(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const isExternal = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
const slugOf = (file) => file.replace(/\.md$/i, "").toLowerCase();

/** GitHub's heading ids, so links like `budgets.md#rollover` written for GitHub keep working. */
function slugger() {
  const seen = new Map();
  return (text) => {
    const base = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

// -------------------------------------------------------------------------------- the guides' files
const files = readdirSync(SRC).filter((f) => /\.md$/i.test(f));
if (!files.includes("README.md")) throw new Error(`${SRC}/README.md is required: it's the guide's front page and contents`);
const pages = new Map(); // slug -> { file, slug, title, desc, group }

/**
 * The contents come from README.md: each `## Section` with a table whose first column links to a
 * guide (`[Budgets](budgets.md)`) and whose second says what it covers. Rows that link outside the
 * guides (../CHANGELOG.md) are kept as links to GitHub.
 */
function readContents() {
  const lexer = new Marked({ gfm: true });
  const tokens = lexer.lexer(readFileSync(join(SRC, "README.md"), "utf8"));
  const groups = [];
  let title = `${NAME} guide`;
  const intro = [];
  const outro = [];
  for (const t of tokens) {
    if (t.type === "heading" && t.depth === 1) title = t.text;
    else if (t.type === "heading" && t.depth === 2) groups.push({ title: t.text, items: [], extra: [] });
    else if (t.type === "table" && groups.length) {
      for (const row of t.rows) {
        const m = row[0].text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (!m) continue;
        const [, label, href] = m;
        const desc = row[1]?.text || "";
        const [path, hash] = href.split("#");
        if (!isExternal(href) && !path.includes("/") && files.includes(path))
          groups.at(-1).items.push({ label, slug: slugOf(path), hash, desc });
        else groups.at(-1).items.push({ label, href: isExternal(href) ? href : repoUrl(href), desc, external: true });
      }
    } else if (t.type === "hr") outro.push(t);
    else if (!groups.length) intro.push(t);
    else outro.push(t);
  }
  // Guides that aren't in the contents still get a page, under "More".
  const listed = new Set(groups.flatMap((g) => g.items.map((i) => i.slug).filter(Boolean)));
  const rest = files.filter((f) => f !== "README.md" && !listed.has(slugOf(f)));
  if (rest.length) {
    groups.push({
      title: "More",
      items: rest.map((f) => ({ label: titleOf(f), slug: slugOf(f), desc: "" })),
    });
  }
  return { title, intro, outro, groups };
}
function titleOf(file) {
  const m = readFileSync(join(SRC, file), "utf8").match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : file.replace(/\.md$/, "");
}
/** A path relative to the guides folder, on GitHub. */
function repoUrl(href) {
  const [path, hash] = href.split("#");
  const target = posix.normalize(posix.join(SRC_IN_REPO, path));
  const kind = target.endsWith("/") || !/\.[a-z0-9]+$/i.test(target) ? "tree" : "blob";
  return `${REPO}/${kind}/${BRANCH}/${target}${hash ? `#${hash}` : ""}`;
}

// ------------------------------------------------------------------------------------ markdown → html
const ALERTS = { NOTE: "Note", TIP: "Tip", IMPORTANT: "Important", WARNING: "Warning", CAUTION: "Caution" };

/** A renderer for one page. `up` is the way back to the guide's root from that page ("" or "../"). */
function renderer(up) {
  const slug = slugger();
  const toc = [];
  const md = new Marked({ gfm: true });
  const link = (href) => {
    if (!href || href.startsWith("#") || isExternal(href)) return href;
    const [path, hash] = href.split("#");
    const h = hash ? `#${hash}` : "";
    if (path === "README.md") return `${up || "./"}${h}`;
    if (!path.includes("/") && files.includes(path)) return `${up}${slugOf(path)}/${h}`;
    if (path.startsWith("images/")) return `${up}${path}`;
    return repoUrl(href);
  };
  md.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const id = slug(plain(html));
        if (depth === 2) toc.push({ id, text: plain(html) });
        if (depth === 1) return `<h1 id="${id}">${html}</h1>\n`;
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${html}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const to = link(href);
        const ext = isExternal(to) && !to.startsWith(REPO) ? ' rel="noopener"' : "";
        return `<a href="${esc(to)}"${title ? ` title="${esc(title)}"` : ""}${ext}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href, title, text }) {
        const src = esc(link(href));
        return `<a class="zoom" href="${src}"><img src="${src}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ""} loading="lazy" decoding="async" /></a>`;
      },
      code({ text, lang }) {
        const l = (lang || "").split(/\s/)[0];
        return `<div class="code"><pre><code${l ? ` class="language-${esc(l)}"` : ""}>${esc(text)}</code></pre></div>\n`;
      },
      blockquote({ tokens }) {
        let body = this.parser.parse(tokens);
        const m = body.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/);
        if (!m) return `<blockquote>\n${body}</blockquote>\n`;
        body = body.replace(m[0], "<p>").replace(/^<p><\/p>\s*/, "");
        const kind = m[1].toLowerCase();
        return `<aside class="callout ${kind}"><p class="callout-title">${ALERTS[m[1]]}</p>\n${body}</aside>\n`;
      },
    },
    hooks: {
      postprocess: (html) => html.replace(/<table>/g, '<div class="table"><table>').replace(/<\/table>/g, "</table></div>"),
    },
  });
  return { md, toc };
}

// ------------------------------------------------------------------------------------------- pages
const theme = (() => {
  const vars = (o = {}) => Object.entries(o).map(([k, v]) => `${k.startsWith("--") ? k : `--${k}`}: ${v};`).join(" ");
  const c = config.colors || {};
  return [
    `:root { ${vars(c.light)} }`,
    `@media (prefers-color-scheme: dark) { :root { ${vars(c.dark)} } }`,
  ].join("\n");
})();
const logo = config.logo ? readFileSync(resolve(dirname(configPath), config.logo), "utf8").replace(/<\?xml[^>]*>\s*/, "").trim() : "";
const SEARCH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

function shell({ up, title, description, body, contents, current }) {
  const href = (h) => (isExternal(h) || h.startsWith("/") ? h : `${up}${h}`);
  const links = (config.links || [])
    .map((l) => `<a${l.optional ? ' class="opt"' : ""} href="${esc(href(l.href))}">${esc(l.label)}${isExternal(l.href) ? " ↗" : ""}</a>`)
    .join("");
  const nav = contents.groups
    .map(
      (g) => `<div class="nav-group"><p>${esc(g.title)}</p><ul>${g.items
        .map((i) =>
          i.slug
            ? `<li><a href="${up}${i.slug}/"${i.slug === current ? ' aria-current="page"' : ""}>${esc(i.label)}</a></li>`
            : `<li><a href="${esc(i.href)}">${esc(i.label)} <span aria-hidden="true">↗</span></a></li>`,
        )
        .join("")}</ul></div>`,
    )
    .join("");
  return `<!doctype html>
<html lang="${esc(config.lang || "en")}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    ${description ? `<meta name="description" content="${esc(description)}" />` : ""}
    <meta name="color-scheme" content="light dark" />
    <meta name="guide-root" content="${up || "./"}" />
    ${config.favicon ? `<link rel="icon" href="${esc(href(config.favicon))}" />` : ""}
    <link rel="stylesheet" href="${up}guide.css" />
    <style>${theme}</style>
    ${config.analytics ? config.analytics : ""}
  </head>
  <body>
    <a class="skip" href="#main">Skip to the guide</a>
    <header class="top">
      <div class="top-in">
        <a class="logo" href="${up || "./"}">${logo}<span>${esc(NAME)} <b>Guide</b></span></a>
        <button class="search-open" type="button" aria-label="Search the guide">${SEARCH_ICON}<span>Search</span><kbd>/</kbd></button>
        <nav class="links" aria-label="${esc(NAME)}">${links}</nav>
      </div>
    </header>
    <div class="layout">
      <aside class="side">
        <details class="menu" open>
          <summary>Contents</summary>
          <nav aria-label="Guides">
            <a class="nav-home" href="${up || "./"}"${current ? "" : ' aria-current="page"'}>Start here</a>
            ${nav}
          </nav>
        </details>
      </aside>
      ${body}
    </div>
    <dialog class="search" aria-label="Search the guide">
      <form method="dialog" class="search-box">
        ${SEARCH_ICON}
        <input type="search" placeholder="Search the ${esc(NAME)} guide" autocomplete="off" spellcheck="false" aria-label="Search" />
        <button type="submit" class="esc" aria-label="Close">Esc</button>
      </form>
      <ol class="results" role="listbox"></ol>
      <p class="search-empty" hidden>Nothing found. Try fewer or different words.</p>
    </dialog>
    <dialog class="zoomed" aria-label="Picture">
      <img alt="" />
      <p></p>
      <button type="button" aria-label="Close">×</button>
    </dialog>
    <script src="${up}guide.js" defer></script>
  </body>
</html>
`;
}

function articleFooter({ up, file, prev, next }) {
  const edit = `${REPO}/edit/${BRANCH}/${SRC_IN_REPO}/${file}`;
  const pn = (p, dir) =>
    p ? `<a class="${dir}" href="${up}${p.slug}/"><small>${dir === "prev" ? "← Previous" : "Next →"}</small>${esc(p.label)}</a>` : "<span></span>";
  return `<nav class="pager" aria-label="More guides">${pn(prev, "prev")}${pn(next, "next")}</nav>
        <p class="edit"><a href="${esc(edit)}">Suggest a change to this page</a> · <a href="${esc(REPO)}/issues">Report a problem</a></p>`;
}

// ------------------------------------------------------------------------------------------- build
const contents = readContents();
const order = contents.groups.flatMap((g) => g.items.filter((i) => i.slug).map((i) => ({ ...i, group: g.title })));
const seen = new Set();
const ordered = order.filter((i) => !seen.has(i.slug) && seen.add(i.slug));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const search = [];

// The front page: the README's introduction, then a card for every guide.
{
  const { md } = renderer("");
  const intro = md.parser(contents.intro.filter((t) => !(t.type === "heading" && t.depth === 1)));
  const outro = contents.outro.filter((t) => t.type !== "hr").length ? md.parser(contents.outro.filter((t) => t.type !== "hr")) : "";
  const groups = contents.groups
    .map(
      (g) => `<section class="group">
          <h2>${esc(g.title)}</h2>
          <div class="cards">${g.items
            .map(
              (i) =>
                `<a class="card" href="${i.slug ? `${i.slug}/` : esc(i.href)}"><b>${esc(i.label)}${i.external ? " ↗" : ""}</b>${i.desc ? `<span>${md.parseInline(i.desc)}</span>` : ""}</a>`,
            )
            .join("")}</div>
        </section>`,
    )
    .join("\n        ");
  const body = `<main id="main" class="home">
        <header class="home-head">
          <p class="kicker">${esc(NAME)} guide</p>
          <h1>${esc(config.title || contents.title)}</h1>
          <div class="intro">${intro}</div>
          <button class="search-big search-open" type="button">${SEARCH_ICON}<span>Search the guide</span><kbd>/</kbd></button>
        </header>
        ${groups}
        ${outro ? `<div class="outro">${outro}</div>` : ""}
      </main>`;
  writeFileSync(
    join(OUT, "index.html"),
    shell({ up: "", title: `${NAME} guide`, description: config.description || plain(intro), body, contents, current: null }),
  );
}

// One page per guide.
for (const [n, item] of ordered.entries()) {
  const file = files.find((f) => slugOf(f) === item.slug);
  const up = "../";
  const { md, toc } = renderer(up);
  const html = md.parse(readFileSync(join(SRC, file), "utf8"));
  const title = plain(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || item.label);
  const first = plain(html.match(/<p>([\s\S]*?)<\/p>/)?.[1] || "");
  const onPage = toc.length > 1
    ? `<nav class="toc" aria-label="On this page"><p>On this page</p><ul>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ul></nav>`
    : "";
  const body = `<main id="main" class="page">
        <article class="prose">
          <p class="crumb"><a href="${up}">${esc(NAME)} guide</a> <span aria-hidden="true">/</span> ${esc(item.group)}</p>
          ${html}
        </article>
        ${articleFooter({ up, file, prev: ordered[n - 1], next: ordered[n + 1] })}
      </main>
      <aside class="aside">${onPage}</aside>`;
  mkdirSync(join(OUT, item.slug), { recursive: true });
  writeFileSync(
    join(OUT, item.slug, "index.html"),
    shell({ up, title: `${title} · ${NAME} guide`, description: item.desc ? plain(md.parseInline(item.desc)) : first.slice(0, 200), body, contents, current: item.slug }),
  );

  // Search: one entry per section of the page.
  const parts = html.split(/(?=<h2 )/);
  for (const part of parts) {
    const h = part.match(/^<h2 id="([^"]+)">[\s\S]*?<\/a>([\s\S]*?)<\/h2>/);
    const text = plain(part.replace(/<h[12][^>]*>[\s\S]*?<\/h[12]>/g, " ").replace(/<div class="code">[\s\S]*?<\/div>/g, " "));
    search.push({ p: title, s: h ? plain(h[2]) : "", u: `${item.slug}/${h ? `#${h[1]}` : ""}`, t: text.slice(0, 1500) });
  }
}

writeFileSync(join(OUT, "search.json"), JSON.stringify(search));
cpSync(join(KIT, "assets", "guide.css"), join(OUT, "guide.css"));
cpSync(join(KIT, "assets", "guide.js"), join(OUT, "guide.js"));
if (existsSync(join(SRC, "images"))) cpSync(join(SRC, "images"), join(OUT, "images"), { recursive: true });

console.log(`${NAME} guide: ${ordered.length} pages and the front page, in ${OUT}/`);
