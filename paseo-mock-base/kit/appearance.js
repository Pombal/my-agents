// Paseo Settings → Appearance (Fonts + Layout) for mocks.
// An "Aa" button in the situation bar opens a popover with the same fields,
// limits and defaults as Paseo 0.12.0 (hooks/use-settings/storage.ts,
// screens/settings/appearance/appearance-section.tsx). Values persist in
// localStorage (shared by every mock on this origin) and drive the kit tokens
// on the frame the way Paseo's applyAppearance() (appearance/apply.ts) drives
// its theme: the UI ramp scales from the interface size, content and code are
// absolute, content line-height = round(content × 1.4), diff = round(code × 1.5).
// Loaded by dev.js; the button joins the situation bar through MockKit.addSituationControl.
(() => {
  if (window.KitAppearance) return; // a page that still loads its own copy
  window.KitAppearance = true;
  const KEY = "paseo-mock:appearance";
  const UI_RAMP = { sm: 12, base: 14, lg: 16, xl: 18, "2xl": 20, "3xl": 22, "4xl": 26 }; // FONT_SIZE, styles/theme.ts
  const FIELDS = [
    { key: "uiFontFamily", group: "Fonts", label: "Interface font", hint: "Used across the app. Leave empty for the system default", font: true, def: "" },
    { key: "uiBaseFontSize", group: "Fonts", label: "Interface size", hint: "Used for navigation, controls, and labels", min: 10, max: 21, def: 14 },
    { key: "contentFontSize", group: "Fonts", label: "Content size", hint: "Used for chat text and rendered Markdown", min: 10, max: 21, def: 15 },
    { key: "monoFontFamily", group: "Fonts", label: "Code font", hint: "Used in code, diffs, and the terminal output. Leave empty for the system default", font: true, def: "" },
    { key: "codeFontSize", group: "Fonts", label: "Code size", hint: "Used for code, diffs, and terminal output", min: 9, max: 22, def: 12 },
    { key: "contentMaxWidth", group: "Layout", label: "Content width", hint: "Max width of chat and Markdown files on wide screens", min: 600, max: 4000, def: 820, step: 10 },
  ];
  const DEFAULTS = Object.fromEntries(FIELDS.map((f) => [f.key, f.def]));

  function load() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    } catch {
      return { ...DEFAULTS };
    }
  }
  let settings = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(settings));
  const clamp = (f, v) => Math.min(f.max, Math.max(f.min, Math.round(Number(v) || f.def)));
  const cleanFont = (v) => String(v).replace(/[;{}<>]/g, "").trim().slice(0, 200);

  // Tokens Paseo's settings change. Defaults are left to tokens.css.
  function applyTokens() {
    const frame = document.querySelector(".mock-frame");
    if (!frame) return;
    const s = settings;
    const set = (name, value, isDefault) => (isDefault ? frame.style.removeProperty(name) : frame.style.setProperty(name, value));
    const r = s.uiBaseFontSize / UI_RAMP.base;
    for (const [k, v] of Object.entries(UI_RAMP)) set(`--fs-${k}`, Math.round(v * r) + "px", s.uiBaseFontSize === DEFAULTS.uiBaseFontSize);
    set("--fs-content", s.contentFontSize + "px", s.contentFontSize === DEFAULTS.contentFontSize);
    set("--lh-content", Math.round(s.contentFontSize * 1.4) + "px", s.contentFontSize === DEFAULTS.contentFontSize);
    set("--fs-code", s.codeFontSize + "px", s.codeFontSize === DEFAULTS.codeFontSize);
    set("--lh-diff", Math.round(s.codeFontSize * 1.5) + "px", s.codeFontSize === DEFAULTS.codeFontSize);
    set("--content-max-width", s.contentMaxWidth + "px", s.contentMaxWidth === DEFAULTS.contentMaxWidth);
    set("--font-ui", s.uiFontFamily, !s.uiFontFamily);
    set("--font-mono", s.monoFontFamily, !s.monoFontFamily);
  }

  // ------------------------------------------------------------- styles
  const css = document.createElement("style");
  css.textContent = `
  .kit-appearance-btn { display: inline-flex; align-items: center; gap: 6px; }
  .kit-appearance-btn b { font-weight: 700; }
  .kit-appearance-btn.kit-on { background: color-mix(in srgb, var(--kit-accent) 22%, transparent); }
  .kit-appearance {
    position: fixed; z-index: 20; width: 340px; box-sizing: border-box; padding: 10px 12px 12px;
    background: var(--kit-panel); backdrop-filter: blur(12px); border: 1px solid var(--kit-line);
    border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.45); font: 12px/18px var(--kit-font); color: var(--kit-text);
  }
  .kit-appearance[hidden] { display: none; }
  .kit-appearance h4 { margin: 8px 0 4px; font: inherit; color: var(--kit-situation); }
  .kit-appearance h4:first-child { margin-top: 0; }
  .kit-ap-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
  .kit-ap-text { flex: 1; min-width: 0; }
  .kit-ap-hint { color: var(--kit-dim); font-size: 10.5px; line-height: 14px; }
  .kit-ap-num { display: inline-flex; align-items: center; border: 1px solid var(--kit-line); border-radius: 7px; overflow: hidden; }
  .kit-ap-num button { width: 22px; height: 24px; border: 0; background: rgba(255,255,255,.04); color: var(--kit-text); font: inherit; cursor: pointer; }
  .kit-ap-num button:hover { background: rgba(255,255,255,.1); }
  .kit-ap-num input { width: 44px; height: 24px; border: 0; background: transparent; color: var(--kit-text); font: inherit; text-align: center; outline: none; -moz-appearance: textfield; }
  .kit-ap-num input::-webkit-inner-spin-button { -webkit-appearance: none; }
  .kit-ap-font { width: 120px; height: 24px; box-sizing: border-box; padding: 0 6px; border: 1px solid var(--kit-line); border-radius: 7px; background: transparent; color: var(--kit-text); font: inherit; outline: none; }
  .kit-ap-row.kit-changed .kit-ap-text > div:first-child { color: var(--kit-situation); }
  .kit-ap-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; color: var(--kit-dim); font-size: 10.5px; }
  .kit-ap-foot button { padding: 2px 8px; border: 1px solid var(--kit-line); border-radius: 7px; background: transparent; color: var(--kit-text); font: inherit; cursor: pointer; }
  .kit-ap-foot button:hover { background: rgba(255,255,255,.06); }
  `;
  document.head.append(css);

  // ------------------------------------------------------------- popover
  const pop = document.createElement("div");
  pop.className = "kit-appearance";
  pop.hidden = true;
  const btn = document.createElement("button");
  btn.className = "kit-cycle-btn kit-appearance-btn";
  btn.title = "Appearance: Paseo's font and layout settings (remembered)";

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function label() {
    const s = settings;
    btn.replaceChildren(el("b", null, "Aa"), el("span", null, `${s.uiBaseFontSize} · ${s.contentFontSize} · ${s.codeFontSize}`));
  }
  function update(key, value) {
    settings = { ...settings, [key]: value };
    save();
    applyTokens();
    label();
    pop.querySelector(`[data-key="${key}"]`)?.classList.toggle("kit-changed", value !== DEFAULTS[key]);
  }
  function render() {
    pop.replaceChildren();
    let group = null;
    for (const f of FIELDS) {
      if (f.group !== group) pop.append(el("h4", null, (group = f.group)));
      const row = el("div", "kit-ap-row" + (settings[f.key] !== f.def ? " kit-changed" : ""));
      row.dataset.key = f.key;
      const text = el("div", "kit-ap-text");
      text.append(el("div", null, f.label), el("div", "kit-ap-hint", f.hint));
      row.append(text);
      if (f.font) {
        const input = el("input", "kit-ap-font");
        input.placeholder = "System default";
        input.value = settings[f.key];
        input.spellcheck = false;
        input.onchange = () => update(f.key, (input.value = cleanFont(input.value)));
        row.append(input);
      } else {
        const box = el("div", "kit-ap-num");
        const minus = el("button", null, "−");
        const input = el("input");
        const plus = el("button", null, "+");
        input.type = "number";
        input.min = f.min;
        input.max = f.max;
        input.value = settings[f.key];
        const commit = (v) => update(f.key, (input.value = clamp(f, v)));
        minus.onclick = () => commit(Number(input.value) - (f.step || 1));
        plus.onclick = () => commit(Number(input.value) + (f.step || 1));
        input.onchange = () => commit(input.value);
        input.onkeydown = (e) => e.key === "Enter" && commit(input.value);
        box.append(minus, input, plus);
        row.append(box);
      }
      pop.append(row);
    }
    const foot = el("div", "kit-ap-foot");
    const reset = el("button", null, "Reset to Paseo defaults");
    reset.onclick = () => {
      settings = { ...DEFAULTS };
      save();
      applyTokens();
      label();
      render();
    };
    foot.append(el("span", null, "Remembered in this browser"), reset);
    pop.append(foot);
  }
  function place() {
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth || 340;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    pop.style.bottom = window.innerHeight - r.top + 10 + "px";
  }
  function toggle(open = pop.hidden) {
    pop.hidden = !open;
    btn.classList.toggle("kit-on", open);
    if (open) {
      render();
      place();
    }
  }
  btn.onclick = (e) => {
    e.stopPropagation();
    toggle();
  };
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) toggle(false);
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && !pop.hidden && toggle(false));
  window.addEventListener("resize", () => !pop.hidden && place());

  function mount() {
    if (!pop.isConnected) document.body.append(pop);
    window.MockKit.addSituationControl(btn);
  }
  label();
  applyTokens();
  document.addEventListener("mockchange", () => {
    applyTokens();
    if (!pop.hidden) place();
  });
  document.addEventListener("mockready", mount);
  if (window.MockKit) mount();
})();
