import { Platform } from "react-native";
import { DARK_LIGHTNESS, findMagicKeywords, LIGHT_LIGHTNESS, MAGIC_KEYWORDS, SATURATION, SHIMMER_PERIOD_MS, STOPS, stopFor } from "./keywords";

// Web and desktop only. Paseo 0.12.0 renders a sent message's text as one React Native Web Text
// marked data-message-text inside [data-testid="user-message"]. This module never adds, removes or
// edits React-owned nodes: it colors keywords with the CSS Custom Highlight API. Every keyword
// character is its own Range; each frame moves it to the highlight of its current gradient stop, so
// the colors run across the word as in OMP's editor. Copy, selection and Find see the plain text.

// The plugin typechecks without the DOM library; declare only what this module uses.
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
  closest(selector: string): DomElement | null;
  matches(selector: string): boolean;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
}
interface DomRange {
  setStart(node: DomText, offset: number): void;
  setEnd(node: DomText, offset: number): void;
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
interface MediaQuery {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
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
declare function getComputedStyle(element: DomElement): { color: string };
declare function matchMedia(query: string): MediaQuery;
declare function requestAnimationFrame(callback: () => void): number;
declare function cancelAnimationFrame(handle: number): void;
declare class MutationObserver {
  constructor(callback: (records: Array<{ type: string; target: DomNode; addedNodes: ArrayLike<DomNode> }>) => void);
  observe(target: DomElement, options: { childList: boolean; characterData: boolean; subtree: boolean }): void;
  disconnect(): void;
}
declare class IntersectionObserver {
  constructor(callback: (entries: Array<{ target: DomElement; isIntersecting: boolean }>) => void);
  observe(target: DomElement): void;
  unobserve(target: DomElement): void;
  disconnect(): void;
}

const MESSAGE_TEXT = '[data-testid="user-message"] [data-message-text]';
const PREFIX = "omp-magic-keywords";
const SHOW_TEXT = 4;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const POLL_MS = 1500;

/** One keyword character: its Range and the gradient stop whose highlight currently holds it. */
interface Glyph {
  range: DomRange;
  keyword: number;
  index: number;
  length: number;
  stop: number;
}

interface Message {
  text: string;
  glyphs: Glyph[];
}

/** Starts coloring keywords in sent messages. Returns cleanup; a no-op off the web. */
export function startKeywordShimmer(): () => void {
  const registry = typeof CSS === "undefined" ? undefined : CSS.highlights;
  const HighlightClass = typeof Highlight === "undefined" ? undefined : Highlight;
  if (Platform.OS !== "web" || typeof document === "undefined" || !registry || !HighlightClass) return () => {};

  // Below Paseo's own highlights (chat Find), which use the default priority 0.
  const highlights = MAGIC_KEYWORDS.map(({ word }) =>
    Array.from({ length: STOPS }, (_, stop) => {
      const highlight = new HighlightClass();
      highlight.priority = -1;
      registry.set(`${PREFIX}-${word}-${stop}`, highlight);
      return highlight;
    }),
  );
  const style = document.createElement("style");
  style.setAttribute("data-plugin", PREFIX);
  document.head.appendChild(style);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  let lightness = 0;
  const syncScheme = (sample: DomElement | undefined) => {
    // Light message text means a dark theme; with nothing on screen yet, assume dark.
    const color = sample ? getComputedStyle(sample).color : "";
    const next = color && luminance(color) < 0.5 ? LIGHT_LIGHTNESS : DARK_LIGHTNESS;
    if (next === lightness) return;
    lightness = next;
    style.textContent = MAGIC_KEYWORDS.flatMap(({ word, hue: [from, to] }) =>
      Array.from({ length: STOPS }, (_, stop) => {
        const hue = Math.round((from + (stop / STOPS) * (to - from)) % 360);
        return `::highlight(${PREFIX}-${word}-${stop}) { color: hsl(${hue} ${SATURATION}% ${lightness}%); }`;
      }),
    ).join("\n");
  };

  const messages = new Map<DomElement, Message>();
  const visible = new Set<DomElement>();

  const paint = (glyphs: Glyph[]) => {
    const phase = reducedMotion.matches ? 0 : (Date.now() % SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS;
    for (const glyph of glyphs) {
      const stop = stopFor(glyph.index, glyph.length, phase);
      if (stop === glyph.stop) continue;
      const stops = highlights[glyph.keyword]!;
      if (glyph.stop >= 0) stops[glyph.stop]!.delete(glyph.range);
      stops[stop]!.add(glyph.range);
      glyph.stop = stop;
    }
  };

  // Only on-screen messages animate, and the loop stops when none are.
  let frame: number | undefined;
  const tick = () => {
    frame = undefined;
    for (const element of visible) {
      const message = messages.get(element);
      if (message) paint(message.glyphs);
    }
    if (visible.size > 0 && !reducedMotion.matches) frame = requestAnimationFrame(tick);
  };
  const schedule = () => {
    frame ??= requestAnimationFrame(tick);
  };
  reducedMotion.addEventListener("change", schedule);

  const intersections = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting && messages.has(target)) visible.add(target);
      else visible.delete(target);
    }
    schedule();
  });

  const clear = (element: DomElement) => {
    const message = messages.get(element);
    if (!message) return;
    for (const glyph of message.glyphs) if (glyph.stop >= 0) highlights[glyph.keyword]![glyph.stop]!.delete(glyph.range);
    messages.delete(element);
    visible.delete(element);
    intersections.unobserve(element);
  };

  const process = (element: DomElement) => {
    const text = element.isConnected ? element.textContent ?? "" : "";
    if (messages.get(element)?.text === text) return;
    clear(element);
    const matches = findMagicKeywords(text);
    if (matches.length === 0) return;

    const nodes: DomText[] = [];
    const starts: number[] = [];
    const walker = document.createTreeWalker(element, SHOW_TEXT);
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const textNode = node as DomText;
      nodes.push(textNode);
      starts.push(offset);
      offset += textNode.data.length;
    }
    const glyphs: Glyph[] = [];
    for (const { keyword, start, end } of matches) {
      for (let at = start; at < end; at++) {
        const from = locate(nodes, starts, at);
        const to = locate(nodes, starts, at + 1);
        if (!from || !to) continue;
        const range = document.createRange();
        range.setStart(from[0], from[1]);
        range.setEnd(to[0], to[1]);
        glyphs.push({ range, keyword, index: at - start, length: end - start, stop: -1 });
      }
    }
    messages.set(element, { text, glyphs });
    syncScheme(element);
    paint(glyphs);
    intersections.observe(element);
  };

  // The chat list is virtualized: messages mount and unmount as it scrolls. Changes are collected
  // and handled once per frame.
  let mutationFrame: number | undefined;
  const pending = new Set<DomElement>();
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target.nodeType === ELEMENT_NODE ? (record.target as DomElement) : record.target.parentElement;
      const message = target?.closest(MESSAGE_TEXT);
      if (message) pending.add(message);
      if (record.type !== "childList") continue;
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType !== ELEMENT_NODE) continue;
        const element = node as DomElement;
        if (element.matches(MESSAGE_TEXT)) pending.add(element);
        for (const inner of Array.from(element.querySelectorAll(MESSAGE_TEXT))) pending.add(inner);
      }
    }
    if (pending.size === 0) return;
    mutationFrame ??= requestAnimationFrame(() => {
      mutationFrame = undefined;
      for (const element of pending) process(element);
      pending.clear();
    });
  });
  mutations.observe(document.body, { childList: true, characterData: true, subtree: true });

  // Unmounted messages and theme switches change nothing this module observes.
  const poll = setInterval(() => {
    for (const element of [...messages.keys()]) if (!element.isConnected) clear(element);
    syncScheme(messages.keys().next().value);
  }, POLL_MS);

  syncScheme(undefined);
  for (const element of Array.from(document.querySelectorAll(MESSAGE_TEXT))) process(element);

  return () => {
    clearInterval(poll);
    mutations.disconnect();
    intersections.disconnect();
    reducedMotion.removeEventListener("change", schedule);
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (mutationFrame !== undefined) cancelAnimationFrame(mutationFrame);
    for (const element of [...messages.keys()]) clear(element);
    for (const { word } of MAGIC_KEYWORDS) for (let stop = 0; stop < STOPS; stop++) registry.delete(`${PREFIX}-${word}-${stop}`);
    style.remove();
  };
}

/** Text node and offset for a character offset into the element's text. */
function locate(nodes: DomText[], starts: number[], offset: number): [DomText, number] | undefined {
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
