import { Platform } from "react-native";
import { tagList, type Preferences } from "../shared/preferences";
import { isPlain, parseBlocks, segment, type Block, type Inline, type Segment } from "./parse";

// Web and desktop only. Paseo draws a sent message as one React Native Web Text marked
// data-message-text="true" inside [data-testid="user-message"] (0.12.0 components/message.tsx).
// The copy button and rewind read the message prop, never this DOM, so they keep the raw text.
//
// For a message with Markdown or a foldable tag block, the plugin hides Paseo's Text (kept in place,
// aria-hidden so Chat Find skips it) and draws its own copy right after it. The copy carries
// data-message-text="true" too, so Chat Find searches it and omp-magic-keywords colours it;
// session-tree reads the first [data-message-text], which stays Paseo's original. Code blocks carry
// Paseo's data-paseo-markdown-* markers, so chat-diff-highlight colours diff fences here as well.
// Plain messages are left untouched. React never reads the hidden Text's children, and a sibling
// it doesn't know about survives its updates; a removed or changed original is re-drawn.

const SOURCE = '[data-testid="user-message"] [data-message-text="true"]:not([data-ump-view])';
const PREFIX = "user-message-polish";
const CACHE_LIMIT = 400;

type Tree = { segments: Segment[]; blocks: Map<number, Block[]> } | null;
interface Drawn { raw: string; view: HTMLElement; ariaHidden: string | null }

export interface Polisher { apply(values: Preferences): void; dispose(): void }

export function startPolishing(onFocus: () => void): Polisher {
  if (Platform.OS !== "web" || typeof document === "undefined") return { apply() {}, dispose() {} };
  window.addEventListener("focus", onFocus);

  const style = document.createElement("style");
  style.setAttribute("data-plugin", PREFIX);
  style.textContent = CSS;
  document.head.appendChild(style);

  let prefs: Preferences | null = null;
  let disposed = false;
  const drawn = new Map<HTMLElement, Drawn>();
  /** Which folds are open, per original, so a re-draw keeps them open. */
  const opened = new WeakMap<HTMLElement, Set<number>>();
  const cache = new Map<string, Tree>();
  const pending = new Set<HTMLElement>();
  let frame = 0;

  const treeFor = (raw: string, values: Preferences): Tree => {
    const hit = cache.get(raw);
    if (hit !== undefined) return hit;
    const segments: Segment[] = values.foldTags
      ? segment(raw, { always: tagList(values.alwaysFold), never: tagList(values.neverFold) })
      : [{ kind: "text", text: raw }];
    const blocks = new Map<number, Block[]>();
    if (values.markdown) segments.forEach((part, index) => { if (part.kind === "text") blocks.set(index, parseBlocks(part.text)); });
    const folds = segments.some((part) => part.kind === "fold");
    const tree = folds || [...blocks.values()].some((parsed) => !isPlain(parsed)) ? { segments, blocks } : null;
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(raw, tree);
    return tree;
  };

  const restore = (source: HTMLElement) => {
    const entry = drawn.get(source);
    if (!entry) return;
    entry.view.remove();
    source.removeAttribute("data-ump-src");
    if (entry.ariaHidden === null) source.removeAttribute("aria-hidden");
    else source.setAttribute("aria-hidden", entry.ariaHidden);
    drawn.delete(source);
  };

  const draw = (source: HTMLElement) => {
    if (!source.isConnected || !prefs) return restore(source);
    const raw = source.textContent ?? "";
    const entry = drawn.get(source);
    if (entry && entry.raw === raw && entry.view.isConnected && source.nextSibling === entry.view) {
      if (entry.view.className !== `${source.className} ump`) entry.view.className = `${source.className} ump`;
      return;
    }
    const tree = treeFor(raw, prefs);
    if (!tree) return restore(source);
    const view = entry?.view ?? document.createElement("div");
    view.className = `${source.className} ump`;
    view.setAttribute("data-message-text", "true");
    view.setAttribute("data-ump-view", "");
    view.replaceChildren(...renderTree(tree, source));
    if (source.nextSibling !== view) source.after(view);
    if (!entry) drawn.set(source, { raw, view, ariaHidden: source.getAttribute("aria-hidden") });
    else entry.raw = raw;
    source.setAttribute("data-ump-src", "");
    source.setAttribute("aria-hidden", "true");
  };

  const renderTree = (tree: NonNullable<Tree>, source: HTMLElement): Node[] => {
    const open = opened.get(source) ?? new Set<number>();
    opened.set(source, open);
    return tree.segments.map((part, index) => {
      if (part.kind === "fold") return renderFold(part, open.has(index), (isOpen) => { if (isOpen) open.add(index); else open.delete(index); });
      const blocks = tree.blocks.get(index);
      if (!blocks) return el("div", { "data-paseo-markdown-tag": "p" }, [part.text]);
      return el("div", { class: "ump-md" }, renderBlocks(blocks));
    });
  };

  const flush = () => {
    frame = 0;
    if (disposed) return;
    for (const source of pending) draw(source);
    pending.clear();
  };
  const schedule = (source: HTMLElement) => {
    pending.add(source);
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const sweep = () => {
    for (const source of document.querySelectorAll<HTMLElement>(SOURCE)) schedule(source);
  };

  const observer = new MutationObserver((records) => {
    if (!prefs) return;
    let removed = false;
    for (const record of records) {
      const target = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target as HTMLElement;
      if (target?.hasAttribute("data-ump-src")) schedule(target);
      if (record.type !== "childList") continue;
      if (target?.hasAttribute("data-ump-view")) continue;
      if (record.removedNodes.length) removed = true;
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const element = node as HTMLElement;
        if (element.matches(SOURCE)) schedule(element);
        else for (const inner of element.querySelectorAll<HTMLElement>(SOURCE)) schedule(inner);
      }
    }
    if (removed) for (const source of [...drawn.keys()]) if (!source.isConnected) drawn.delete(source), opened.delete(source);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });

  return {
    apply(values) {
      if (disposed) return;
      const changed = !prefs || JSON.stringify(prefs) !== JSON.stringify(values);
      prefs = values;
      if (!changed) return;
      cache.clear();
      for (const entry of drawn.values()) entry.raw = "\u0000"; // force a re-draw with the new settings
      sweep();
    },
    dispose() {
      disposed = true;
      window.removeEventListener("focus", onFocus);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      for (const source of [...drawn.keys()]) restore(source);
      style.remove();
    },
  };
}

function el(tag: string, attrs: Record<string, string>, children: (Node | string)[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function renderBlocks(blocks: Block[]): HTMLElement[] {
  return blocks.map((block): HTMLElement => {
    switch (block.t) {
      case "p": return el("div", { "data-paseo-markdown-tag": "p", class: "ump-p" }, renderInline(block.inline));
      case "h": return el("div", { "data-paseo-markdown-tag": `h${block.level}`, class: "ump-h" }, renderInline(block.inline));
      case "hr": return el("hr", { class: "ump-hr" });
      case "quote": return el("blockquote", { class: "ump-quote" }, renderBlocks(block.blocks));
      case "code": return el("div", {
        "data-paseo-markdown-tag": "pre",
        ...(block.lang ? { "data-paseo-markdown-language": block.lang } : {}),
        class: "ump-pre",
        // Paseo's app-wide interface font skips [data-pmono] subtrees (its code-surface marker).
        "data-pmono": "",
      }, [el("div", { "data-paseo-markdown-tag": "code" }, [block.text])]);
      case "list": return el(block.ordered ? "ol" : "ul", {
        class: "ump-list",
        ...(block.ordered && block.start !== 1 ? { start: String(block.start) } : {}),
      }, block.items.map((item) => el("li", {}, renderBlocks(item))));
    }
  });
}

function renderInline(nodes: Inline[]): (Node | string)[] {
  return nodes.map((node) => {
    switch (node.t) {
      case "text": return node.text;
      case "code": return el("code", { class: "ump-code", "data-pmono": "" }, [node.text]);
      case "strong": return el("strong", {}, renderInline(node.children));
      case "em": return el("em", {}, renderInline(node.children));
      case "del": return el("del", {}, renderInline(node.children));
      case "link": return /^(https?:|mailto:)/i.test(node.href)
        ? el("a", { href: node.href, target: "_blank", rel: "noopener noreferrer", class: "ump-a" }, renderInline(node.children))
        : el("span", {}, renderInline(node.children));
    }
  });
}

const CHEVRON = "M9 6l6 6-6 6";

function renderFold(fold: Extract<Segment, { kind: "fold" }>, startOpen: boolean, remember: (open: boolean) => void): HTMLElement {
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("class", "ump-chev");
  chevron.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", CHEVRON);
  chevron.append(path);
  const head = el("div", { class: "ump-head", role: "button", tabindex: "0", "data-paseo-markdown-ignore": "true" }, [
    chevron,
    el("span", { class: "ump-tag" }, [fold.tag]),
    el("span", { class: "ump-hint" }, [fold.hint]),
    el("span", { class: "ump-lines" }, [`${fold.lines} ${fold.lines === 1 ? "line" : "lines"}`]),
  ]);
  head.title = fold.hint;
  const box = el("div", { class: "ump-fold" }, [head]);
  const setOpen = (open: boolean) => {
    box.toggleAttribute("data-open", open);
    head.setAttribute("aria-expanded", String(open));
    if (open && box.childNodes.length === 1) box.append(el("div", { class: "ump-body", "data-pmono": "" }, [fold.body]));
    if (!open && box.childNodes.length > 1) box.lastChild!.remove();
  };
  setOpen(startOpen);
  const toggle = () => {
    const open = !box.hasAttribute("data-open");
    setOpen(open);
    remember(open);
  };
  head.addEventListener("click", toggle);
  head.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });
  return box;
}

// Colours mix the bubble's own text colour, so every theme works without per-theme values.
const MIX = (percent: number) => `color-mix(in srgb, currentColor ${percent}%, transparent)`;
const CSS = `
[data-ump-src] { display: none !important; }
.ump { display: block !important; }
.ump > * + *, .ump-md > * + *, .ump-quote > * + * { margin-top: 8px; }
.ump-list li > * + *, .ump-list li + li { margin-top: 2px; }
.ump-h { font-weight: 600; }
.ump-hr { border: 0; border-top: 1px solid ${MIX(18)}; margin: 4px 0; }
.ump-quote { margin: 0; padding-left: 10px; border-left: 3px solid ${MIX(22)}; color: ${MIX(80)}; }
.ump-list { margin: 0; padding-left: 20px; }
.ump-code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.86em; padding: 1px 4px; border-radius: 4px; background: ${MIX(10)}; }
/* Long lines wrap rather than widen the bubble past a narrow window. */
.ump-pre { background: ${MIX(7)}; border-radius: 8px; padding: 10px 12px; }
.ump-pre > div { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.ump-a { color: inherit; text-decoration: underline; text-decoration-color: ${MIX(45)}; text-underline-offset: 2px; }
/* Fold line (Stefan's pick B, opened as one piece "B1"): the header never moves; when open its
   text steps down and the chevron goes full strength; the body is the same tint at half. */
.ump-fold { border-radius: 8px; overflow: hidden; }
.ump-fold + .ump-fold { margin-top: 4px; }
.ump-head { display: flex; align-items: center; gap: 6px; height: 28px; box-sizing: border-box; padding: 0 10px 0 8px; background: ${MIX(7)}; font-size: 12px; line-height: 18px; cursor: pointer; user-select: none; -webkit-user-select: none; white-space: nowrap; }
.ump-head:hover { background: ${MIX(10)}; }
.ump-head:focus-visible { outline: 1px solid ${MIX(45)}; outline-offset: -1px; border-radius: 8px; }
.ump-chev { width: 12px; height: 12px; flex: none; fill: none; stroke: ${MIX(52)}; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 120ms ease; }
.ump-fold[data-open] .ump-chev { transform: rotate(90deg); stroke: currentColor; }
.ump-tag { flex: none; color: ${MIX(78)}; }
/* One clamped line instead of nowrap: the full hint still sizes a wide bubble, but a long one can't
   force the bubble wider than a narrow window (nowrap text can't shrink below its full width). */
.ump-hint { flex: 1 1 auto; min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; overflow: hidden; white-space: normal; overflow-wrap: anywhere; color: ${MIX(52)}; }
.ump-lines { flex: none; margin-left: auto; color: ${MIX(52)}; }
.ump-fold[data-open] .ump-tag { color: ${MIX(52)}; }
.ump-fold[data-open] .ump-hint, .ump-fold[data-open] .ump-lines { color: ${MIX(38)}; }
/* width 0 + min-width 100%: opening never widens the bubble; the body wraps to the header's width. */
.ump-body { width: 0; min-width: 100%; box-sizing: border-box; max-height: 320px; overflow: auto; padding: 8px 12px 10px 26px; background: ${MIX(3.5)}; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
`;
