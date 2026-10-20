import { Platform } from "react-native";
import type { Preferences, Style } from "../shared/preferences";
import {
  DARK_LIGHTNESS,
  DARK_SATURATION,
  findMagicKeywords,
  LIGHT_LIGHTNESS,
  LIGHT_SATURATION,
  MAGIC_KEYWORDS,
  SHIMMER_PERIOD_MS,
  STOPS,
  stopFor,
} from "./keywords";

// Web and desktop only. The engine colours keywords with the CSS Custom Highlight API: every keyword
// character is its own Range, and each frame moves it to the highlight of its current gradient stop,
// so the colours run across the word as in OMP's editor. It never adds, removes or edits React-owned
// nodes, so copy, selection and Find see the plain text. Three kinds of text are coloured (markers
// seen in Paseo 0.12.0):
// - a sent message: one React Native Web Text marked data-message-text inside a user-message;
// - the chat outline's hover preview: one text node, mounted only while a tick is hovered;
// - the composer: a plain textarea with no text nodes for a Range to address. Each visible one gets
//   a see-through copy of its text laid exactly over it, and the copy's keywords are highlighted, so
//   coloured glyphs paint over the textarea's own.

// The plugin typechecks without the DOM library; declare only what this module uses.
interface DomNode {
  readonly nodeType: number;
  readonly parentElement: DomElement | null;
  readonly isConnected: boolean;
}
interface DomText extends DomNode {
  data: string;
}
interface DomElement extends DomNode {
  textContent: string | null;
  scrollTop: number;
  readonly scrollHeight: number;
  readonly style: { visibility: string };
  closest(selector: string): DomElement | null;
  matches(selector: string): boolean;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  getClientRects(): ArrayLike<unknown>;
  getBoundingClientRect(): { readonly left: number; readonly top: number };
  setAttribute(name: string, value: string): void;
  appendChild(node: DomNode): void;
  remove(): void;
}
interface TextArea extends DomElement {
  readonly value: string;
  readonly clientLeft: number;
  readonly clientTop: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
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
interface MediaQuery {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}
type DomListener = (event: { readonly target: DomNode | null }) => void;
declare const document: {
  readonly body: DomElement;
  readonly head: DomElement;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  createElement(tag: string): DomElement;
  createTextNode(data: string): DomText;
  createRange(): DomRange;
  createTreeWalker(root: DomElement, whatToShow: number): { nextNode(): DomNode | null };
  addEventListener(type: "input" | "scroll", listener: DomListener, capture: boolean): void;
  removeEventListener(type: "input" | "scroll", listener: DomListener, capture: boolean): void;
};
declare const CSS: { highlights?: { set(name: string, highlight: HighlightSet): void; delete(name: string): void } } | undefined;
declare const Highlight: { new (): HighlightSet } | undefined;
declare function getComputedStyle(element: DomElement): { readonly color: string; getPropertyValue(name: string): string };
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

export const isWeb = Platform.OS === "web" && typeof document !== "undefined";

export interface Engine {
  setPreferences(values: Preferences): void;
  /** Records which provider runs an agent, for the "only where the words act" scope. */
  agent(id: string, provider: string): void;
  /** Provider id → the words OMP has enabled there; providers left out keep every word. */
  setEnabledWords(byProvider: Readonly<Record<string, readonly string[]>>): void;
  dispose(): void;
}

/** Sent messages and the outline preview both follow the `sent` preference. */
const SENT = '[data-testid="user-message"] [data-message-text], [data-testid="chat-outline-preview"] [dir="auto"]';
const COMPOSER = "textarea[data-composer-input]";
const PREFIX = "omp-magic-keywords";
const SHOW_TEXT = 4;
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const POLL_MS = 500;
/** How far up React's tree to look for the chat's agent before giving up. */
const FIBER_DEPTH = 80;
/** Bit `i` set: keyword `i` of {@link MAGIC_KEYWORDS} may be coloured. */
const ALL_WORDS = (1 << MAGIC_KEYWORDS.length) - 1;
const ULTRATHINK = 1 << MAGIC_KEYWORDS.findIndex(({ word }) => word === "ultrathink");
/** The textarea's text-layout properties the overlay copies, so its lines wrap at the same places. */
const COPIED = [
  "font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant", "font-kerning",
  "font-feature-settings", "font-variation-settings", "line-height", "letter-spacing", "word-spacing",
  "text-transform", "text-indent", "text-align", "tab-size", "white-space", "overflow-wrap", "word-break",
  "line-break", "hyphens", "direction", "unicode-bidi", "padding-top", "padding-right", "padding-bottom", "padding-left",
];
// Hidden until a check shows its lines wrap like the textarea's. z-index: auto keeps it under
// Paseo's later popovers and modals, which mount after it at the end of the body.
const OVERLAY_CSS = "position:fixed;margin:0;border:0;box-sizing:border-box;overflow:hidden;pointer-events:none;"
  + "user-select:none;-webkit-user-select:none;color:transparent;background:transparent;visibility:hidden;";

type Kind = "sent" | "composer";

/** One keyword character: its Range and the gradient stop whose highlight currently holds it. */
interface Glyph {
  range: DomRange;
  keyword: number;
  index: number;
  length: number;
  stop: number;
}

interface Overlay {
  element: DomElement;
  node: DomText;
  /** Last geometry and text style written, to skip unchanged writes. */
  css: string;
  shown: boolean;
}

/** A coloured element: a message or preview text, or a composer textarea with its overlay. */
interface Source {
  kind: Kind;
  text: string;
  /** Words this source may colour (bit mask), as decided when its glyphs were built. */
  words: number;
  glyphs: Glyph[];
  overlay?: Overlay;
}

/** The chat's agent as read from React props; either part may be missing. */
interface AgentRef {
  id?: string;
  provider?: string;
}

interface Fiber {
  memoizedProps: { agentId?: unknown; agent?: { id?: unknown; provider?: unknown } | null } | null;
  type: unknown;
  return: Fiber | null;
}

/** Starts the engine idle; it colours nothing until the first {@link Engine.setPreferences}. */
export function startKeywordShimmer(): Engine {
  const registry = typeof CSS === "undefined" ? undefined : CSS.highlights;
  const HighlightClass = typeof Highlight === "undefined" ? undefined : Highlight;
  if (!isWeb || !registry || !HighlightClass) return { setPreferences() {}, agent() {}, setEnabledWords() {}, dispose() {} };

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

  let preferences: Preferences | undefined;
  const directory = new Map<string, string>();
  const enabledWords = new Map<string, number>();
  const sources = new Map<DomElement, Source>();
  const visible = new Set<DomElement>();
  // Messages and previews never change agent; composers are looked up again on each update.
  const agents = new WeakMap<DomElement, AgentRef>();

  let tone = "";
  const syncScheme = (sample: DomElement | undefined) => {
    // Light text means a dark theme; with nothing on screen yet, assume dark.
    const color = sample ? getComputedStyle(sample).color : "";
    const next = color && luminance(color) < 0.5 ? `${LIGHT_SATURATION}% ${LIGHT_LIGHTNESS}%` : `${DARK_SATURATION}% ${DARK_LIGHTNESS}%`;
    if (next === tone) return;
    tone = next;
    style.textContent = MAGIC_KEYWORDS.flatMap(({ word, hue: [from, to] }) =>
      Array.from({ length: STOPS }, (_, stop) => {
        const hue = Math.round((from + (stop / STOPS) * (to - from)) % 360);
        return `::highlight(${PREFIX}-${word}-${stop}) { color: hsl(${hue} ${tone}); }`;
      }),
    ).join("\n");
  };

  const styleOf = (kind: Kind): Style => preferences?.[kind] ?? "off";

  const paint = (source: Source) => {
    const moving = styleOf(source.kind) === "shimmer" && !reducedMotion.matches;
    const phase = moving ? (Date.now() % SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS : 0;
    for (const glyph of source.glyphs) {
      const stop = stopFor(glyph.index, glyph.length, phase);
      if (stop === glyph.stop) continue;
      const stops = highlights[glyph.keyword]!;
      if (glyph.stop >= 0) stops[glyph.stop]!.delete(glyph.range);
      stops[stop]!.add(glyph.range);
      glyph.stop = stop;
    }
  };

  const unpaint = (source: Source) => {
    for (const glyph of source.glyphs) if (glyph.stop >= 0) highlights[glyph.keyword]![glyph.stop]!.delete(glyph.range);
    source.glyphs = [];
  };

  /**
   * Which words act in this chat. An agent the lookup cannot place keeps every word: colouring too
   * much beats hiding the colours everywhere when Paseo's internals change.
   */
  const wordsFor = (agent: AgentRef): number => {
    const provider = (agent.id === undefined ? undefined : directory.get(agent.id)) ?? agent.provider;
    if (provider === undefined) return ALL_WORDS;
    let words = ALL_WORDS;
    if (preferences?.scope !== "all" && provider !== "omp" && !provider.startsWith("omp-")) {
      words = provider === "claude" ? ULTRATHINK : 0;
    }
    return words & (enabledWords.get(provider) ?? ALL_WORDS);
  };

  const glyphsFor = (text: string, words: number, nodes: DomText[], starts: number[]): Glyph[] => {
    const glyphs: Glyph[] = [];
    for (const { keyword, start, end } of findMagicKeywords(text)) {
      if (!(words & (1 << keyword))) continue;
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
    return glyphs;
  };

  // Only on-screen sources run the loop: shimmering ones to animate, composers with keywords to
  // track their textarea. It stops when none are left.
  let frame: number | undefined;
  const tick = () => {
    frame = undefined;
    let again = false;
    for (const element of visible) {
      const source = sources.get(element);
      if (!source) continue;
      if (source.overlay) {
        // Paseo writes the value directly on send, clear and draft restore, without an input event.
        if ((element as TextArea).value === source.text) place(element as TextArea, source);
        else processComposer(element as TextArea);
      }
      paint(source);
      const moving = styleOf(source.kind) === "shimmer" && !reducedMotion.matches;
      if (source.glyphs.length > 0 && (source.overlay || moving)) again = true;
    }
    // processComposer may already have asked for the next frame.
    if (again) frame ??= requestAnimationFrame(tick);
  };
  const schedule = () => {
    frame ??= requestAnimationFrame(tick);
  };
  reducedMotion.addEventListener("change", schedule);

  const intersections = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting && sources.has(target)) visible.add(target);
      else visible.delete(target);
    }
    schedule();
  });

  const clear = (element: DomElement) => {
    const source = sources.get(element);
    if (!source) return;
    unpaint(source);
    source.overlay?.element.remove();
    sources.delete(element);
    visible.delete(element);
    intersections.unobserve(element);
  };

  const processSent = (element: DomElement) => {
    if (styleOf("sent") === "off" || !element.isConnected) {
      clear(element);
      return;
    }
    const text = element.textContent ?? "";
    const existing = sources.get(element);
    if (existing?.text !== text && findMagicKeywords(text).length === 0) {
      clear(element);
      return;
    }
    let agent = agents.get(element);
    if (!agent) {
      agent = agentOf(element);
      agents.set(element, agent);
    }
    const words = wordsFor(agent);
    if (existing?.text === text && existing.words === words) return;
    clear(element);

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
    const source: Source = { kind: "sent", text, words, glyphs: glyphsFor(text, words, nodes, starts) };
    sources.set(element, source);
    syncScheme(element);
    paint(source);
    intersections.observe(element);
  };

  /** Lays the overlay over its textarea and shows it only where its lines wrap like the textarea's. */
  const place = (textarea: TextArea, source: Source) => {
    const overlay = source.overlay!;
    let shown = false;
    if (source.glyphs.length > 0) {
      // Re-read every time: Paseo restyles the composer per keystroke, and rows above it (attachments)
      // move it without resizing it. clientWidth leaves out the scrollbar gutter Paseo always reserves.
      const rect = textarea.getBoundingClientRect();
      const computed = getComputedStyle(textarea);
      let css = `${OVERLAY_CSS}left:${rect.left + textarea.clientLeft}px;top:${rect.top + textarea.clientTop}px;`
        + `width:${textarea.clientWidth}px;height:${textarea.clientHeight}px;`;
      for (const name of COPIED) css += `${name}:${computed.getPropertyValue(name)};`;
      if (css !== overlay.css) {
        overlay.element.setAttribute("style", css);
        overlay.css = css;
        overlay.shown = false;
      }
      if (overlay.element.scrollTop !== textarea.scrollTop) overlay.element.scrollTop = textarea.scrollTop;
      // A different height means different line breaks: never draw colours over the wrong words.
      shown = overlay.element.scrollHeight === textarea.scrollHeight;
    }
    if (shown === overlay.shown) return;
    overlay.element.style.visibility = shown ? "visible" : "hidden";
    overlay.shown = shown;
  };

  const processComposer = (textarea: TextArea) => {
    if (styleOf("composer") === "off" || !textarea.isConnected || textarea.getClientRects().length === 0) {
      clear(textarea);
      return;
    }
    let source = sources.get(textarea);
    if (!source) {
      const element = document.createElement("div");
      element.setAttribute("data-plugin", PREFIX);
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("style", OVERLAY_CSS);
      const node = document.createTextNode("");
      element.appendChild(node);
      document.body.appendChild(element);
      source = { kind: "composer", text: "", words: -1, glyphs: [], overlay: { element, node, css: "", shown: false } };
      sources.set(textarea, source);
      intersections.observe(textarea);
    }
    const text = textarea.value;
    const words = wordsFor(agentOf(textarea));
    if (text !== source.text || words !== source.words) {
      unpaint(source);
      source.text = text;
      source.words = words;
      const { node } = source.overlay!;
      // A textarea shows an empty last line after a trailing newline; a div needs a character there.
      node.data = text.endsWith("\n") ? `${text} ` : text;
      source.glyphs = glyphsFor(text, words, [node], [0]);
      syncScheme(textarea);
      paint(source);
    }
    place(textarea, source);
    if (source.glyphs.length > 0) schedule();
  };

  const onComposerEvent: DomListener = ({ target }) => {
    if (!preferences || target?.nodeType !== ELEMENT_NODE) return;
    const element = target as DomElement;
    if (element.matches(COMPOSER)) processComposer(element as TextArea);
  };
  document.addEventListener("input", onComposerEvent, true);
  document.addEventListener("scroll", onComposerEvent, true);

  // Preferences, providers and OMP's flags change which sources show what. Sources skipped while
  // off are not tracked, so the whole page is scanned again, once per frame at most.
  let rescanFrame: number | undefined;
  const rescan = () => {
    rescanFrame = undefined;
    if (!preferences) return;
    for (const [element, source] of [...sources]) if (styleOf(source.kind) === "off") clear(element);
    for (const element of Array.from(document.querySelectorAll(SENT))) processSent(element);
    for (const element of Array.from(document.querySelectorAll(COMPOSER))) processComposer(element as TextArea);
    // A switch between moving and still colours keeps the glyphs and only repaints them.
    for (const source of sources.values()) paint(source);
    schedule();
  };
  const invalidate = () => {
    rescanFrame ??= requestAnimationFrame(rescan);
  };

  // The chat list is virtualized: messages mount and unmount as it scrolls. Changes are collected
  // and handled once per frame.
  let mutationFrame: number | undefined;
  const pending = new Set<DomElement>();
  const mutations = new MutationObserver((records) => {
    if (styleOf("sent") === "off") return;
    for (const record of records) {
      const target = record.target.nodeType === ELEMENT_NODE ? (record.target as DomElement) : record.target.parentElement;
      const sent = target?.closest(SENT);
      if (sent) pending.add(sent);
      if (record.type !== "childList") continue;
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType !== ELEMENT_NODE) continue;
        const element = node as DomElement;
        if (element.matches(SENT)) pending.add(element);
        for (const inner of Array.from(element.querySelectorAll(SENT))) pending.add(inner);
      }
    }
    if (pending.size === 0) return;
    mutationFrame ??= requestAnimationFrame(() => {
      mutationFrame = undefined;
      for (const element of pending) processSent(element);
      pending.clear();
    });
  });
  mutations.observe(document.body, { childList: true, characterData: true, subtree: true });

  // Unmounted sources, composers shown or hidden by a tab switch, values Paseo set without an event
  // while no overlay was showing, and theme switches change nothing this module observes.
  const poll = setInterval(() => {
    if (!preferences) return;
    for (const element of [...sources.keys()]) if (!element.isConnected) clear(element);
    if (styleOf("composer") !== "off") {
      for (const element of Array.from(document.querySelectorAll(COMPOSER))) processComposer(element as TextArea);
    }
    syncScheme(sources.keys().next().value);
  }, POLL_MS);

  return {
    setPreferences(values) {
      preferences = values;
      invalidate();
    },
    agent(id, provider) {
      if (directory.get(id) === provider) return;
      directory.set(id, provider);
      invalidate();
    },
    setEnabledWords(byProvider) {
      enabledWords.clear();
      for (const [provider, words] of Object.entries(byProvider)) {
        enabledWords.set(provider, MAGIC_KEYWORDS.reduce((mask, { word }, keyword) => (words.includes(word) ? mask | (1 << keyword) : mask), 0));
      }
      invalidate();
    },
    dispose() {
      clearInterval(poll);
      mutations.disconnect();
      intersections.disconnect();
      document.removeEventListener("input", onComposerEvent, true);
      document.removeEventListener("scroll", onComposerEvent, true);
      reducedMotion.removeEventListener("change", schedule);
      for (const handle of [frame, mutationFrame, rescanFrame]) if (handle !== undefined) cancelAnimationFrame(handle);
      for (const element of [...sources.keys()]) clear(element);
      for (const { word } of MAGIC_KEYWORDS) for (let stop = 0; stop < STOPS; stop++) registry.delete(`${PREFIX}-${word}-${stop}`);
      style.remove();
    },
  };
}

/**
 * The agent a chat element belongs to, from the props of the React components above it: the
 * message's `UserMessage` and the `Composer` carry `agentId`, and an `agent` object with `provider`
 * sits further up. Read only; Paseo exposes no DOM marker for the agent.
 */
function agentOf(element: DomElement): AgentRef {
  const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
  let fiber: Fiber | null | undefined = key ? (element as unknown as Record<string, Fiber | undefined>)[key] : undefined;
  const agent: AgentRef = {};
  for (let depth = 0; fiber && depth < FIBER_DEPTH; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (!props || typeof fiber.type === "string") continue;
    if (agent.id === undefined && typeof props.agentId === "string") agent.id = props.agentId;
    const owner = props.agent;
    if (owner && typeof owner.provider === "string" && (agent.id === undefined || owner.id === agent.id)) {
      agent.id ??= typeof owner.id === "string" ? owner.id : undefined;
      agent.provider = owner.provider;
      break;
    }
  }
  return agent;
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
