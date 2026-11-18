// guide-kit: search, copy buttons, full-size pictures and "On this page". Everything here is optional;
// without it the guide is plain pages and links.
(() => {
  const root = document.querySelector('meta[name="guide-root"]')?.content || "./";
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ------------------------------------------------------------------ search
  const dlg = document.querySelector("dialog.search");
  const input = dlg.querySelector("input");
  const list = dlg.querySelector(".results");
  const empty = dlg.querySelector(".search-empty");
  let index = null;
  let pick = 0;

  const load = () =>
    (index ??= fetch(`${root}search.json`)
      .then((r) => r.json())
      .then((rows) => rows.map((r) => ({ ...r, hay: `${r.p} ${r.s} ${r.t}`.toLowerCase() })))
      .catch(() => []));

  function open() {
    if (dlg.open) return;
    dlg.showModal();
    input.select();
    load();
  }
  for (const b of document.querySelectorAll(".search-open")) b.addEventListener("click", open);
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      open();
    }
  });
  dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());

  /** Every word must appear somewhere; a word in the title or section heading counts for more. */
  function find(q, rows) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const r of rows) {
      if (!words.every((w) => r.hay.includes(w))) continue;
      const head = `${r.p} ${r.s}`.toLowerCase();
      let score = 0;
      for (const w of words) score += head.includes(w) ? 10 : 1;
      if (!r.s) score += 2; // the page itself, ahead of its sections
      out.push({ r, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 20).map((x) => x.r);
  }
  function snippet(text, words) {
    const low = text.toLowerCase();
    const at = Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0));
    const start = Math.max(0, (Number.isFinite(at) ? at : 0) - 50);
    return (start ? "…" : "") + text.slice(start, start + 170);
  }
  function mark(text, words) {
    let html = esc(text);
    for (const w of words) if (w.length > 1) html = html.replace(new RegExp(`(${esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>");
    return html;
  }
  async function show() {
    const q = input.value.trim();
    const rows = await load();
    if (q !== input.value.trim()) return;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = find(q, rows);
    pick = 0;
    list.innerHTML = hits
      .map(
        (r, i) => `<li><a href="${root}${r.u}" role="option" aria-selected="${i === 0}">
          ${r.s ? `<small>${esc(r.p)}</small><b>${mark(r.s, words)}</b>` : `<b>${mark(r.p, words)}</b>`}
          <span>${mark(snippet(r.t, words), words)}</span></a></li>`,
      )
      .join("");
    empty.hidden = !q || hits.length > 0;
  }
  input.addEventListener("input", show);
  input.addEventListener("keydown", (e) => {
    const links = [...list.querySelectorAll("a")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!links.length) return;
      pick = (pick + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
      links.forEach((a, i) => a.setAttribute("aria-selected", String(i === pick)));
      links[pick].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && links[pick]) {
      e.preventDefault();
      dlg.close();
      location.href = links[pick].href;
    }
  });
  list.addEventListener("click", (e) => e.target.closest("a") && dlg.close());

  // ------------------------------------------------------------------ copy buttons
  for (const box of document.querySelectorAll(".code")) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "copy";
    b.textContent = "Copy";
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(box.querySelector("code").textContent);
        b.textContent = "Copied";
      } catch {
        b.textContent = "Select and copy";
      }
      setTimeout(() => (b.textContent = "Copy"), 1600);
    });
    box.append(b);
  }

  // ------------------------------------------------------------------ pictures, full size
  const zoom = document.querySelector("dialog.zoomed");
  for (const a of document.querySelectorAll("a.zoom"))
    a.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      const img = a.querySelector("img");
      zoom.querySelector("img").src = a.href;
      zoom.querySelector("img").alt = img.alt;
      zoom.querySelector("p").textContent = img.alt;
      zoom.showModal();
    });
  zoom.addEventListener("click", () => zoom.close());

  // ------------------------------------------------------------------ on this page
  const toc = [...document.querySelectorAll(".toc a")];
  if (toc.length && "IntersectionObserver" in window) {
    const heads = toc.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
    const seen = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.isIntersecting ? seen.add(e.target) : seen.delete(e.target);
        const current = heads.find((h) => seen.has(h)) || [...heads].reverse().find((h) => h.getBoundingClientRect().top < 120);
        toc.forEach((a) => a.classList.toggle("on", !!current && a.hash === `#${current.id}`));
      },
      { rootMargin: "-56px 0px -60% 0px" },
    );
    heads.forEach((h) => io.observe(h));
  }

  // ------------------------------------------------------------------ contents
  // A sidebar on wide screens; on narrow ones a menu that starts folded (it's open without JavaScript).
  const menu = document.querySelector(".menu");
  const narrow = matchMedia("(max-width: 860px)");
  const fit = () => (menu.open = !narrow.matches);
  fit();
  narrow.addEventListener("change", fit);
  // Keep the current guide in view in the sidebar, without moving the page.
  const side = document.querySelector(".side");
  const here = side.querySelector('a[aria-current="page"]');
  if (here && side.scrollHeight > side.clientHeight) side.scrollTop = here.offsetTop - side.clientHeight / 2;
})();
