// Paseo mock kit: dev toolbars + tag engine. No configuration: everything is
// read from tags in the page. See ../README.md for the authoring guide.
//
// Two separate control groups, on purpose:
//   DESIGN    (top bar)    which design option you're looking at: sections, variants
//   SITUATION (bottom bar) where you're looking at it: theme, viewport, app state
(() => {
  const kitBase = new URL(".", document.currentScript.src);
  const devCss = document.createElement("link");
  devCss.rel = "stylesheet";
  devCss.href = new URL("dev.css", kitBase).href;
  devCss.addEventListener("load", () => layout());
  document.head.append(devCss);

  const VIEWPORTS = {
    desktop: { w: 1440, h: 900, label: "Desktop" },
    laptop: { w: 1024, h: 720, label: "Small desktop" },
    phone: { w: 390, h: 844, label: "Phone" },
  };
  const VIEWPORT_ALIASES = { wide: ["desktop", "laptop"] };
  const THEME_LABELS = {
    dark: "Paseo dark",
    pureBlack: "Pure black",
    light: "Paseo light",
    zinc: "Zinc",
    midnight: "Midnight",
    claude: "Claude",
    ghostty: "Ghostty",
  };
  const DEFAULT_THEMES = "dark pureBlack light";

  const html = document.documentElement;
  const exportMode = new URLSearchParams(location.search).has("export");
  const words = (s) => (s || "").trim().split(/\s+/).filter(Boolean);

  // "A: Composer pill — works everywhere | B: Muted line"
  function parseVariants(s) {
    return (s || "")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const m = part.match(/^([^:]+?)\s*(?::\s*(.*?))?\s*(?:—\s*(.*))?$/);
        return { id: m[1].trim(), label: (m[2] || "").trim(), note: (m[3] || "").trim() };
      });
  }
  // "session: normal | empty | crashed; net: online | offline"
  function parseStates(s, into = new Map()) {
    for (const axis of (s || "").split(";")) {
      const [name, values] = axis.split(":");
      if (!name || !name.trim()) continue;
      const list = into.get(name.trim()) || [];
      for (const v of (values || "").split("|").map((x) => x.trim()).filter(Boolean)) {
        if (!list.includes(v)) list.push(v);
      }
      into.set(name.trim(), list);
    }
    return into;
  }
  // data-when="session: empty crashed; net: offline"
  function parseWhen(s) {
    const out = new Map();
    for (const clause of (s || "").split(";")) {
      const [name, values] = clause.split(":");
      if (name && name.trim()) out.set(name.trim(), words(values));
    }
    return out;
  }

  // ---------------------------------------------------------------- cycle button
  // <button data-cycle="Off | 30 min | 1 h"> steps through values, wrapping.
  // Its left third steps back, the rest steps forward; the hovered side shades
  // from its edge (and, with data-cycle-chevrons, its chevron lights up).
  // Width is that of the widest value, so it never jumps. Fires a "cycle"
  // event { value, index }; mirrors data-value. (Split idea from the Nilo
  // mock template's variants bar.)
  function enhanceCycle(el, onChange) {
    if (el.__cycle) return el.__cycle;
    const values = el.dataset.cycle.split("|").map((v) => v.trim()).filter(Boolean);
    const chevrons = el.hasAttribute("data-cycle-chevrons");
    el.classList.add("kit-cycle");
    el.textContent = "";
    const mk = (tag, cls, html) => {
      const n = document.createElement(tag);
      n.className = cls;
      if (html) n.innerHTML = html;
      return n;
    };
    const chev = (d) => `<svg viewBox="0 0 6 10" width="5" height="8" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const prev = mk("span", "kit-cycle-prev");
    const next = mk("span", "kit-cycle-next");
    const stack = mk("span", "kit-cycle-vals");
    const spans = values.map((v) => {
      const span = mk("span", "");
      span.textContent = v;
      stack.append(span);
      return span;
    });
    el.append(prev, next);
    if (chevrons) el.append(mk("em", "kit-cycle-l", chev("M5 1 1 5l4 4")));
    el.append(stack);
    if (chevrons) el.append(mk("em", "kit-cycle-r", chev("M1 1l4 4-4 4")));
    const at = (d) => values[(api.index + d + values.length) % values.length];
    const api = {
      values,
      index: 0,
      set(i, silent) {
        api.index = ((i % values.length) + values.length) % values.length;
        spans.forEach((s, j) => s.classList.toggle("kit-cycle-on", j === api.index));
        el.dataset.value = values[api.index];
        prev.title = "← " + at(-1);
        next.title = at(1) + " →";
        if (!silent) {
          el.dispatchEvent(new CustomEvent("cycle", { bubbles: true, detail: { value: values[api.index], index: api.index } }));
          onChange?.(values[api.index], api.index);
        }
      },
    };
    const start = values.indexOf(el.dataset.value);
    api.set(start < 0 ? 0 : start, true);
    el.addEventListener("click", (e) => {
      const back = e.target.closest?.(".kit-cycle-prev") || (e.target === el && e.offsetX < el.offsetWidth / 3);
      api.set(api.index + (back ? -1 : 1));
    });
    el.__cycle = api;
    return api;
  }

  // ---------------------------------------------------------------- page model
  const sectionEls = [...document.querySelectorAll("[data-section]")];
  const frame = document.createElement("div");
  frame.className = "mock-frame";
  if (sectionEls.length) {
    sectionEls.forEach((s) => frame.append(s));
  } else {
    // No sections: the whole body is one screen.
    const only = document.createElement("div");
    only.dataset.section = "main";
    [...document.body.childNodes].filter((n) => n.nodeName !== "SCRIPT").forEach((n) => only.append(n));
    frame.append(only);
    sectionEls.push(only);
  }

  const sections = sectionEls.map((el) => {
    let variants = parseVariants(el.dataset.variants);
    if (!variants.length) {
      const ids = [];
      el.querySelectorAll("[data-variant]").forEach((n) => words(n.dataset.variant).forEach((id) => ids.includes(id) || ids.push(id)));
      variants = ids.sort().map((id) => ({ id, label: "", note: "" }));
    }
    const axes = parseStates(html.dataset.states);
    parseStates(el.dataset.states, axes);
    el.querySelectorAll("[data-when]").forEach((n) => {
      for (const [axis, vals] of parseWhen(n.dataset.when)) {
        const list = axes.get(axis) || [];
        vals.forEach((v) => list.includes(v) || list.push(v));
        axes.set(axis, list);
      }
    });
    return { id: el.dataset.section, title: el.dataset.title || el.dataset.section, el, variants, axes };
  });

  const themes = words(html.dataset.themes || DEFAULT_THEMES);
  const viewports = words(html.dataset.viewports || "desktop laptop phone");

  // ---------------------------------------------------------------- state + hash
  const state = { section: sections[0].id, variant: null, theme: themes[0], vp: viewports[0], states: {} };

  function readHash() {
    const [path, query] = location.hash.slice(1).split("?");
    const [sec, variant] = (path || "").split("/");
    if (sections.some((s) => s.id === sec)) state.section = sec;
    state.variant = variant || null;
    const q = new URLSearchParams(query || "");
    if (themes.includes(q.get("theme"))) state.theme = q.get("theme");
    if (viewports.includes(q.get("vp"))) state.vp = q.get("vp");
    if (q.get("canvas")) html.dataset.canvas = q.get("canvas");
    for (const [k, v] of q) if (!["theme", "vp", "canvas"].includes(k)) state.states[k] = v;
  }
  function writeHash() {
    const q = new URLSearchParams();
    if (state.theme !== themes[0]) q.set("theme", state.theme);
    if (state.vp !== viewports[0]) q.set("vp", state.vp);
    const sec = current();
    for (const [axis, values] of sec.axes) if (state.states[axis] && state.states[axis] !== values[0]) q.set(axis, state.states[axis]);
    if (html.dataset.canvas) q.set("canvas", html.dataset.canvas);
    const path = state.section + (state.variant ? "/" + state.variant : "");
    const qs = q.toString();
    history.replaceState(null, "", "#" + path + (qs ? "?" + qs : ""));
  }
  const current = () => sections.find((s) => s.id === state.section);

  // ---------------------------------------------------------------- apply
  const listeners = [];
  let shownAxes = new Set();
  function apply() {
    const sec = current();
    if (sec.variants.length && !sec.variants.some((v) => v.id === state.variant)) state.variant = sec.variants[0].id;
    if (!sec.variants.length) state.variant = null;
    for (const [axis, values] of sec.axes) if (!values.includes(state.states[axis])) state.states[axis] = values[0];

    frame.dataset.theme = state.theme;
    frame.dataset.vp = state.vp;
    frame.dataset.section = sec.id;
    if (state.variant) frame.dataset.v = state.variant;
    else delete frame.dataset.v;
    for (const k of Object.keys(frame.dataset)) if (k.startsWith("state")) delete frame.dataset[k];
    for (const [axis] of sec.axes) frame.setAttribute("data-state-" + axis, state.states[axis]);
    html.dataset.theme = state.theme; // lets kit-styled controls outside the frame pick up tokens if wanted

    for (const s of sections) s.el.classList.toggle("kit-off", s !== sec);
    // An axis control is shown only if some element using it can currently
    // appear (e.g. a phone-only drawer axis hides on desktop).
    const structOff = new Set();
    const tagged = new Set();
    shownAxes = new Set();
    for (const n of sec.el.querySelectorAll("[data-variant],[data-viewport],[data-when]")) {
      let struct = true;
      if (n.dataset.variant) struct &&= words(n.dataset.variant).includes(state.variant);
      if (n.dataset.viewport) struct &&= words(n.dataset.viewport).flatMap((v) => VIEWPORT_ALIASES[v] || [v]).includes(state.vp);
      let on = struct;
      if (n.dataset.when) {
        const when = parseWhen(n.dataset.when);
        for (const [axis, vals] of when) {
          tagged.add(axis);
          on &&= vals.includes(state.states[axis]);
        }
        let reachable = struct;
        for (let p = n.parentElement; reachable && p && p !== sec.el; p = p.parentElement) if (structOff.has(p)) reachable = false;
        if (reachable) when.forEach((_, axis) => shownAxes.add(axis));
      }
      if (!struct) structOff.add(n);
      n.classList.toggle("kit-off", !on);
    }
    for (const [axis] of sec.axes) if (!tagged.has(axis)) shownAxes.add(axis);
    if (!exportMode) {
      writeHash();
      renderBars();
    }
    layout();
    // data-scroll="bottom": show the end of a scroll area, like a chat scrolled to the latest turn.
    sec.el.querySelectorAll('[data-scroll="bottom"]').forEach((n) => (n.scrollTop = n.scrollHeight));
    listeners.forEach((fn) => fn({ ...state, states: { ...state.states } }));
    document.dispatchEvent(new CustomEvent("mockchange", { detail: state }));
  }

  // ---------------------------------------------------------------- layout
  const stage = document.createElement("div");
  stage.className = "kit-stage";
  const label = document.createElement("div");
  label.className = "kit-frame-label";
  const holder = document.createElement("div");
  holder.className = "kit-frame-holder";
  holder.append(frame);
  stage.append(label, holder);

  function layout() {
    const vp = VIEWPORTS[state.vp];
    frame.style.width = vp.w + "px";
    frame.style.height = vp.h + "px";
    if (exportMode) {
      frame.style.transform = "";
      return;
    }
    // Frame starts below the design bar, or below the caption line when the
    // section has notes (the line is reserved, so flipping never shifts it).
    if (!designBar.hidden) caption.style.top = designBar.getBoundingClientRect().bottom + 6 + "px";
    const above = [designBar, caption].filter((n) => !n.hidden).map((n) => n.getBoundingClientRect().bottom);
    const top = Math.max(14, ...above) + 34;
    const bottom = situationBar.hidden ? 14 : window.innerHeight - situationBar.getBoundingClientRect().top + 24;
    const availH = window.innerHeight - top - bottom;
    const availW = window.innerWidth - 48;
    const scale = Math.min(1, availW / vp.w, availH / vp.h);
    frame.style.transform = `scale(${scale})`;
    holder.style.width = vp.w * scale + "px";
    holder.style.height = vp.h * scale + "px";
    stage.style.top = top - 22 + "px";
    label.textContent = `${vp.label} · ${vp.w}×${vp.h}${scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}`;
  }

  // ---------------------------------------------------------------- bars
  const designBar = document.createElement("div");
  designBar.className = "kit-bar kit-design";
  // Variant note: a quiet line under the design bar, outside it, so the bar
  // keeps one width whatever variant is shown.
  const caption = document.createElement("div");
  caption.className = "kit-caption";
  const situationBar = document.createElement("div");
  situationBar.className = "kit-bar kit-situation";

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  // items: { key, badge?, label?, title? }
  function segmented(items, activeKey, onPick) {
    const wrap = el("div", "kit-seg");
    for (const it of items) {
      const b = el("button", "kit-seg-btn" + (it.key === activeKey ? " kit-on" : ""));
      if (it.badge) b.append(el("b", null, it.badge));
      if (it.label) b.append(el("span", null, it.label));
      if (it.title) b.title = it.title;
      b.onclick = () => onPick(it.key);
      wrap.append(b);
    }
    return wrap;
  }
  function cycleControl(name, values, value, labels, onPick) {
    const wrap = el("span", "kit-ctl");
    if (name) wrap.append(el("span", "kit-ctl-name", name));
    const b = el("button", "kit-cycle-btn");
    b.dataset.cycle = values.map((v) => labels?.[v] || v).join("|");
    b.dataset.value = labels?.[value] || value;
    b.setAttribute("data-cycle-chevrons", "");
    wrap.append(b);
    enhanceCycle(b, (_, i) => onPick(values[i]));
    return wrap;
  }

  function renderBars() {
    const sec = current();
    designBar.replaceChildren();
    if (sections.length > 1) {
      designBar.append(segmented(sections.map((s) => ({ key: s.id, label: s.title })), sec.id, (id) => set({ section: id })));
    }
    if (sec.variants.length) {
      designBar.append(segmented(sec.variants.map((v) => ({ key: v.id, badge: v.id, label: v.label, title: v.note })), state.variant, (id) => set({ variant: id })));
    }
    designBar.hidden = !designBar.childElementCount;
    caption.hidden = designBar.hidden || !sec.variants.some((v) => v.note);
    caption.textContent = sec.variants.find((v) => v.id === state.variant)?.note || "";

    // Theme and viewport values name themselves ("Pure black", "Phone");
    // app-state axes get their name as a quiet label ("session normal").
    situationBar.replaceChildren();
    if (themes.length > 1) situationBar.append(cycleControl(null, themes, state.theme, THEME_LABELS, (v) => set({ theme: v })));
    if (viewports.length > 1) {
      const vpLabels = Object.fromEntries(viewports.map((v) => [v, VIEWPORTS[v].label]));
      situationBar.append(cycleControl(null, viewports, state.vp, vpLabels, (v) => set({ vp: v })));
    }
    for (const [axis, values] of sec.axes) {
      if (values.length > 1 && shownAxes.has(axis)) situationBar.append(cycleControl(axis, values, state.states[axis], null, (v) => set({ states: { ...state.states, [axis]: v } })));
    }
    situationBar.hidden = !situationBar.childElementCount;
  }

  function set(patch) {
    Object.assign(state, patch);
    apply();
  }

  function step(list, cur, d) {
    const i = list.indexOf(cur);
    return list[(i + d + list.length) % list.length];
  }
  function onKey(e) {
    const t = e.target;
    if (t.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const sec = current();
    const ids = sec.variants.map((v) => v.id);
    if (e.key === "ArrowRight" && ids.length) set({ variant: step(ids, state.variant, 1) });
    else if (e.key === "ArrowLeft" && ids.length) set({ variant: step(ids, state.variant, -1) });
    else if (e.key === "ArrowDown" && sections.length > 1) set({ section: step(sections.map((s) => s.id), state.section, 1) });
    else if (e.key === "ArrowUp" && sections.length > 1) set({ section: step(sections.map((s) => s.id), state.section, -1) });
    else if (e.key === "t") set({ theme: step(themes, state.theme, e.shiftKey ? -1 : 1) });
    else if (e.key === "v") set({ vp: step(viewports, state.vp, e.shiftKey ? -1 : 1) });
    else return;
    e.preventDefault();
  }

  // ---------------------------------------------------------------- icons
  // <i data-icon="plus" data-size="14"></i> → Lucide SVG (Paseo's icon set,
  // stroke 1.5, default 16px). Classes on the <i> carry over.
  function icon(name, size = 16, cls = "") {
    const body = window.KitIcons?.[name];
    if (!body) return `<span class="icon icon-missing" title="unknown icon: ${name}">?</span>`;
    return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  function renderIcons(root = document) {
    root.querySelectorAll("i[data-icon]").forEach((n) => {
      n.outerHTML = icon(n.dataset.icon, Number(n.dataset.size) || 16, n.className);
    });
  }
  function loadScript(name) {
    return new Promise((ok) => {
      const s = document.createElement("script");
      s.src = new URL(name, kitBase).href;
      s.onload = s.onerror = ok;
      document.head.append(s);
    });
  }

  // ---------------------------------------------------------------- boot
  html.classList.add(exportMode ? "kit-export" : "kit");
  readHash();
  if (exportMode) {
    document.body.replaceChildren(frame);
  } else {
    document.body.replaceChildren(stage, designBar, caption, situationBar);
    window.addEventListener("resize", layout);
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", () => {
      readHash();
      apply();
    });
  }
  Promise.all([loadScript("icons.js"), loadScript("icons-extra.js")]).then(() => {
    renderIcons(frame);
    frame.querySelectorAll("[data-cycle]").forEach((b) => enhanceCycle(b));
    apply();
    window.MockKit = {
      state,
      sections: sections.map(({ id, title, variants, axes }) => ({ id, title, variants, axes: Object.fromEntries(axes) })),
      viewports: VIEWPORTS,
      set,
      onChange: (fn) => listeners.push(fn),
      enhanceCycle,
      icon,
      renderIcons,
    };
    document.dispatchEvent(new CustomEvent("mockready"));
  });
})();
