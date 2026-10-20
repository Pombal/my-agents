import { Platform } from "react-native";
import { isDiffBlock, parseDiff, type DiffModel, type EditKind, type TokenKind } from "./model";
import { diffPalette, type DiffPalette, type Scheme } from "./palette";

// Web and desktop only. Paseo renders chat code blocks as React Native Web views marked with
// data-paseo-markdown-* attributes for its own copy-as-markdown feature (kept through the
// react-native-enriched-markdown rewrite, PR #6973; unchanged in v0.12.0's
// components/highlighted-code-block.tsx). This module never adds, removes or edits React-owned
// nodes: token colors and changed-word marks use the CSS Custom Highlight API (Range objects over
// the existing text) and diff rows are background layers on the block's inline style. The copy
// button, text selection, Find and copy-as-markdown keep working on the untouched text.

// The plugin typechecks without the DOM library; declare only what this module uses.
interface Rect {
  top: number;
  bottom: number;
  height: number;
}
interface DomNode {
  readonly nodeType: number;
  readonly parentElement: DomElement | null;
  readonly isConnected: boolean;
}
interface DomText extends DomNode {
  readonly data: string;
}
interface DomElement extends DomNode {
  readonly textContent: string | null;
  readonly style: { setProperty(name: string, value: string, priority: "important"): void; removeProperty(name: string): void };
  getAttribute(name: string): string | null;
  closest(selector: string): DomElement | null;
  matches(selector: string): boolean;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  getBoundingClientRect(): Rect;
}
interface DomRange {
  setStart(node: DomText, offset: number): void;
  setEnd(node: DomText, offset: number): void;
  getClientRects(): ArrayLike<Rect>;
}
interface HighlightSet {
  priority: number;
  add(range: DomRange): void;
  delete(range: DomRange): void;
}
interface StyleElement extends DomElement {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  remove(): void;
}
declare const document: {
  readonly body: DomElement;
  readonly head: { appendChild(node: StyleElement): void };
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  createElement(tag: "style"): StyleElement;
  createRange(): DomRange;
  createTreeWalker(root: DomElement, whatToShow: number): { nextNode(): DomNode | null };
};
declare const CSS: { highlights?: { set(name: string, highlight: HighlightSet): void; delete(name: string): void } } | undefined;
declare const Highlight: { new (): HighlightSet } | undefined;
declare const localStorage: { getItem(key: string): string | null };
declare function getComputedStyle(element: DomElement): { color: string; lineHeight: string };
declare function requestAnimationFrame(callback: () => void): number;
declare function cancelAnimationFrame(handle: number): void;
declare class MutationObserver {
  constructor(callback: (records: Array<{ type: string; target: DomNode; addedNodes: ArrayLike<DomNode> }>) => void);
  observe(target: DomElement, options: { childList: boolean; characterData: boolean; subtree: boolean }): void;
  disconnect(): void;
}
declare class ResizeObserver {
  constructor(callback: (entries: Array<{ target: DomElement }>) => void);
  observe(target: DomElement): void;
  unobserve(target: DomElement): void;
  disconnect(): void;
}

const PRE = '[data-paseo-markdown-tag="pre"]';
const CODE = '[data-paseo-markdown-tag="code"]';
const LANGUAGE = "data-paseo-markdown-language";
const PREFIX = "chat-diff-highlight";
const SHOW_TEXT = 4;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const THEME_POLL_MS = 1500;
const TOKEN_KINDS: TokenKind[] = ["keyword", "comment", "string", "number", "literal", "function", "type", "tag", "attribute", "property", "operator", "addSign", "delSign", "header", "hunk"];
const EDIT_KINDS: EditKind[] = ["delEdit", "addEdit"];
const ROW_STYLE = ["background-image", "background-size", "background-position", "background-repeat", "background-origin"];

type HighlightKind = TokenKind | EditKind;

interface Block {
  code: DomElement;
  text: string;
  model: DiffModel;
  ranges: Array<[HighlightKind, DomRange]>;
  nodes: DomText[];
  starts: number[];
}

/** Starts coloring diff code blocks. Returns cleanup; a no-op off the web. */
export function startDiffHighlighting(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};

  const blocks = new Map<DomElement, Block>();
  const highlights = {} as Record<HighlightKind, HighlightSet | undefined>;
  if (CSS?.highlights && Highlight) {
    // Below Paseo's own highlights (chat Find), which use the default priority 0. Word marks sit
    // above the syntax colors: inside a changed range the text takes the plain foreground.
    for (const [kinds, priority] of [[TOKEN_KINDS, -2], [EDIT_KINDS, -1]] as const) {
      for (const kind of kinds) {
        const highlight = new Highlight();
        highlight.priority = priority;
        CSS.highlights.set(`${PREFIX}-${kind}`, highlight);
        highlights[kind] = highlight;
      }
    }
  }
  const style = document.createElement("style");
  style.setAttribute("data-plugin", PREFIX);
  document.head.appendChild(style);

  let paletteKey = "";
  let palette: DiffPalette = diffPalette("one", "light");

  const syncPalette = (sample: DomElement | undefined): boolean => {
    let syntaxTheme = "one";
    try {
      const settings: unknown = JSON.parse(localStorage.getItem("@paseo:app-settings") ?? "{}");
      const value = settings && typeof settings === "object" ? Reflect.get(settings, "syntaxTheme") : undefined;
      if (typeof value === "string") syntaxTheme = value;
    } catch {
      // Unreadable settings: Paseo's default syntax theme.
    }
    // The block's text color is the theme's foreground, so light text means a dark theme.
    const foreground = sample ? getComputedStyle(sample).color : "";
    const scheme: Scheme = foreground && luminance(foreground) > 0.5 ? "dark" : "light";
    const key = `${syntaxTheme}|${scheme}|${foreground}`;
    if (key === paletteKey) return false;
    paletteKey = key;
    palette = diffPalette(syntaxTheme, scheme);
    const markText = foreground ? ` color: ${foreground};` : "";
    style.textContent = [
      ...TOKEN_KINDS.map((kind) => `::highlight(${PREFIX}-${kind}) { color: ${palette.tokens[kind]}; }`),
      ...EDIT_KINDS.map((kind) => `::highlight(${PREFIX}-${kind}) { background-color: ${palette.edits[kind]};${markText} }`),
    ].join("\n");
    return true;
  };

  const clear = (pre: DomElement) => {
    const block = blocks.get(pre);
    if (!block) return;
    for (const [kind, range] of block.ranges) highlights[kind]?.delete(range);
    for (const property of ROW_STYLE) pre.style.removeProperty(property);
    blocks.delete(pre);
    resizes.unobserve(pre);
  };

  const rangeFor = (block: Block, start: number, end: number): DomRange | undefined => {
    const range = document.createRange();
    const from = locate(block, start);
    const to = locate(block, end);
    if (!from || !to) return undefined;
    range.setStart(from[0], from[1]);
    range.setEnd(to[0], to[1]);
    return range;
  };

  // Full-width row backgrounds, like Paseo's git diff view, measured from the rendered text so
  // wrapped lines and any font size line up.
  const paintRows = (pre: DomElement, block: Block) => {
    const box = pre.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(block.code).lineHeight);
    const rows: Array<{ top: number; bottom: number; color: string }> = [];
    for (const line of block.model.lines) {
      const color = palette.rows[line.kind];
      if (!color) continue;
      const rects = Array.from(rangeFor(block, line.start, line.end)?.getClientRects() ?? []).filter((r) => r.height > 0);
      if (rects.length === 0) continue;
      const leading = Number.isFinite(lineHeight) ? Math.max(0, (lineHeight - rects[0]!.height) / 2) : 0;
      const top = Math.min(...rects.map((r) => r.top)) - leading - box.top;
      const bottom = Math.max(...rects.map((r) => r.bottom)) + leading - box.top;
      const previous = rows[rows.length - 1];
      // Rows are contiguous: snap sub-pixel gaps so a run of changes paints as one band.
      if (previous && previous.color === color && top - previous.bottom < 2) previous.bottom = bottom;
      else rows.push({ top: previous && top - previous.bottom < 2 ? previous.bottom : top, bottom, color });
    }
    if (rows.length === 0) {
      for (const property of ROW_STYLE) pre.style.removeProperty(property);
      return;
    }
    const px = (n: number) => `${Math.round(n * 100) / 100}px`;
    // Important, so theme plugins that restyle code blocks (Chat Polish sets `background` with
    // !important) don't hide the rows; inline !important wins over any stylesheet.
    const set = (property: string, value: string) => pre.style.setProperty(property, value, "important");
    set("background-image", rows.map((r) => `linear-gradient(${r.color}, ${r.color})`).join(", "));
    set("background-size", rows.map((r) => `100% ${px(r.bottom - r.top)}`).join(", "));
    set("background-position", rows.map((r) => `0 ${px(r.top)}`).join(", "));
    set("background-repeat", "no-repeat");
    set("background-origin", "border-box");
  };

  const process = (pre: DomElement) => {
    const code = pre.querySelector(CODE);
    const text = code?.textContent ?? "";
    if (!code || !pre.isConnected || !isDiffBlock(pre.getAttribute(LANGUAGE), text)) return clear(pre);
    const existing = blocks.get(pre);
    if (existing && existing.code === code && existing.text === text) return;
    clear(pre);

    const nodes: DomText[] = [];
    const starts: number[] = [];
    const walker = document.createTreeWalker(code, SHOW_TEXT);
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const textNode = node as DomText;
      nodes.push(textNode);
      starts.push(offset);
      offset += textNode.data.length;
    }
    const block: Block = { code, text, model: parseDiff(text), ranges: [], nodes, starts };
    for (const span of [...block.model.spans, ...block.model.edits]) {
      const highlight = highlights[span.kind];
      const range = highlight && rangeFor(block, span.start, span.end);
      if (!range) continue;
      highlight.add(range);
      block.ranges.push([span.kind, range]);
    }
    blocks.set(pre, block);
    resizes.observe(pre);
    if (syncPalette(code)) repaintAll();
    else paintRows(pre, block);
  };

  const repaintAll = () => {
    for (const [pre, block] of blocks) paintRows(pre, block);
  };

  let resizeFrame: number | undefined;
  const pendingResize = new Set<DomElement>();
  const resizes = new ResizeObserver((entries) => {
    for (const entry of entries) pendingResize.add(entry.target);
    resizeFrame ??= requestAnimationFrame(() => {
      resizeFrame = undefined;
      for (const pre of pendingResize) {
        const block = blocks.get(pre);
        if (block) paintRows(pre, block);
      }
      pendingResize.clear();
    });
  });

  // Streaming rewrites a block's text node in place; virtualized chat mounts and unmounts blocks.
  // Changes are collected and handled once per frame, so a fast stream re-parses a growing block
  // at most at the display rate.
  let mutationFrame: number | undefined;
  const pendingMutation = new Set<DomElement>();
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target.nodeType === ELEMENT_NODE ? (record.target as DomElement) : record.target.parentElement;
      const pre = target?.closest(PRE);
      if (pre) pendingMutation.add(pre);
      if (record.type !== "childList") continue;
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType !== ELEMENT_NODE) continue;
        const element = node as DomElement;
        if (element.matches(PRE)) pendingMutation.add(element);
        for (const inner of Array.from(element.querySelectorAll(PRE))) pendingMutation.add(inner);
      }
    }
    if (pendingMutation.size === 0) return;
    mutationFrame ??= requestAnimationFrame(() => {
      mutationFrame = undefined;
      for (const pre of pendingMutation) process(pre);
      pendingMutation.clear();
    });
  });
  mutations.observe(document.body, { childList: true, characterData: true, subtree: true });

  // Theme and syntax-theme switches restyle without touching these nodes, so check them here.
  const poll = setInterval(() => {
    for (const pre of [...blocks.keys()]) if (!pre.isConnected) clear(pre);
    const sample = blocks.values().next().value?.code;
    if (syncPalette(sample)) repaintAll();
  }, THEME_POLL_MS);

  syncPalette(undefined);
  for (const pre of Array.from(document.querySelectorAll(PRE))) process(pre);

  return () => {
    clearInterval(poll);
    mutations.disconnect();
    resizes.disconnect();
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    if (mutationFrame !== undefined) cancelAnimationFrame(mutationFrame);
    for (const pre of [...blocks.keys()]) clear(pre);
    for (const kind of [...TOKEN_KINDS, ...EDIT_KINDS]) CSS?.highlights?.delete(`${PREFIX}-${kind}`);
    style.remove();
  };
}

/** Text node and offset for a character offset into the block's text. */
function locate(block: Block, offset: number): [DomText, number] | undefined {
  const { nodes, starts } = block;
  if (nodes.length === 0) return undefined;
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  const node = nodes[lo]!;
  if (node.nodeType !== TEXT_NODE) return undefined;
  return [node, Math.min(offset - starts[lo]!, node.data.length)];
}

/** Relative luminance (0 dark … 1 light) of a computed `rgb()`/`rgba()` color. */
function luminance(color: string): number {
  const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
