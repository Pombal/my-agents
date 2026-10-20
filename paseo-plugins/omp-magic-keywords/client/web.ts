import { Platform } from "react-native";
import type { Preferences, Style } from "../shared/preferences";
import { keywordColor, type Tone } from "./color";
import { findClaudeUltrathink, findMagicKeywords, type KeywordMatch, MAGIC_KEYWORDS, SHIMMER_PERIOD_MS, STOPS, stopFor } from "./keywords";

// Web and desktop only. The engine colours keywords with the CSS Custom Highlight API: every keyword
// character is its own Range, and each frame moves it to the highlight of its current gradient stop,
// so the colours run across the word as in OMP's editor. It never adds, removes or edits React-owned
// nodes, so copy, selection and Find see the plain text. Three kinds of text are coloured (markers
// seen in Paseo 0.12.0):
// - a sent message: one React Native Web Text marked data-message-text inside a user-message;
// - the chat outline's hover preview: one text node, mounted only while a tick is hovered;
// - the composer: a plain textarea with no text nodes for a Range to address. Each visible one holding a
//   keyword gets a see-through copy of its text laid exactly over it, and the copy's keywords are
//   highlighted, so coloured glyphs paint over the textarea's own.

export const isWeb = Platform.OS === "web" && typeof document !== "undefined";

export interface Engine {
  setPreferences(values: Preferences): void;
  /** Records which provider runs an agent, for the "only where the words act" scope. */
  agent(id: string, provider: string): void;
  dispose(): void;
}

/** Sent messages and the outline preview both follow the `sent` preference. */
const SENT = '[data-testid="user-message"] [data-message-text], [data-testid="chat-outline-preview"] [dir="auto"]';
const COMPOSER = "textarea[data-composer-input]";
const PREFIX = "omp-magic-keywords";
const POLL_MS = 500;
/** How far up React's tree to look for the chat's agent before giving up. */
const FIBER_DEPTH = 80;
/** Bit `i` set: keyword `i` of {@link MAGIC_KEYWORDS} may be coloured. */
const ALL_WORDS = (1 << MAGIC_KEYWORDS.length) - 1;
/** Bit above the words: match with Claude Code's looser `ultrathink` rule instead of OMP's. */
const CLAUDE_RULE = 1 << MAGIC_KEYWORDS.length;
const CLAUDE_WORDS = (1 << MAGIC_KEYWORDS.findIndex(({ word }) => word === "ultrathink")) | CLAUDE_RULE;
/** The textarea's text-layout properties the overlay copies, so its lines wrap at the same places. */
const COPIED = [
  "font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant", "font-kerning",
  "font-feature-settings", "font-variation-settings", "font-optical-sizing", "font-size-adjust", "font-synthesis",
  "text-rendering", "line-height", "letter-spacing", "word-spacing", "text-transform", "text-indent", "text-align",
  "tab-size", "white-space", "overflow-wrap", "word-break", "line-break", "hyphens", "direction", "unicode-bidi",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
];
// Hidden until a check shows its lines wrap like the textarea's. z-index: auto keeps it under
// Paseo's later popovers and modals, which mount after it at the end of the body.
const OVERLAY_CSS = "position:fixed;margin:0;border:0;box-sizing:border-box;overflow:hidden;pointer-events:none;"
  + "user-select:none;-webkit-user-select:none;color:transparent;background:transparent;visibility:hidden;";
// The overlay's hidden twin for that check: a textarea wraps the draft exactly as the composer does,
// and at height 0 its scrollHeight is the draft's height plus padding.
const MIRROR_CSS = "position:fixed;left:0;top:0;height:0;min-height:0;margin:0;border:0;box-sizing:border-box;"
  + "overflow:hidden;resize:none;visibility:hidden;pointer-events:none;";

type Kind = "sent" | "composer";

/** One keyword character: its Range and the gradient stop whose highlight currently holds it. */
interface Glyph {
  range: Range;
  keyword: number;
  index: number;
  length: number;
  stop: number;
}

interface Overlay {
  /** Fixed over the textarea, clipped to its box and scrolled with it. */
  element: HTMLElement;
  /** Block holding the copied text; its height is the copy's line count times the line height. */
  inner: HTMLElement;
  node: Text;
  /** Hidden textarea holding the draft at the composer's width, for the line check. */
  mirror: HTMLTextAreaElement;
  /** The textarea's text style as CSS, read on input, scroll, poll and rescan rather than every frame. */
  textCss: string;
  /** The textarea's vertical padding in px. */
  padding: number;
  /** Last styles written to the overlay and the mirror, to skip unchanged writes. */
  css: string;
  mirrorCss: string;
  /** Whether the copy has as many lines as the textarea; unset until measured for the current text and style. */
  fits?: boolean;
  shown: boolean;
}

/** A coloured element: a message or preview text, or a composer textarea with its overlay. */
interface Source {
  kind: Kind;
  text: string;
  /** Words this source may colour (bit mask), as decided when its glyphs were built. */
  words: number;
  /** Text nodes the glyphs' Ranges address; one leaving the page leaves the Ranges stale. */
  nodes: Text[];
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
  if (!isWeb || !registry || !HighlightClass) return { setPreferences() {}, agent() {}, dispose() {} };

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

  // Set first thing on dispose: observer callbacks and frames already queued must not start new work.
  let disposed = false;
  let preferences: Preferences | undefined;
  const directory = new Map<string, string>();
  let warned = false;
  const sources = new Map<HTMLElement, Source>();
  const visible = new Set<HTMLElement>();

  let tone: Tone | undefined;
  const syncScheme = (sample?: HTMLElement) => {
    // Light text means a dark theme. Without a sample the tone stays as it is: dark at startup.
    const color = sample ? getComputedStyle(sample).color : "";
    const next: Tone = color ? (luminance(color) < 0.5 ? "light" : "dark") : tone ?? "dark";
    if (next === tone) return;
    tone = next;
    style.textContent = MAGIC_KEYWORDS.flatMap(({ word, hue: [from, to] }) =>
      Array.from({ length: STOPS }, (_, stop) =>
        `::highlight(${PREFIX}-${word}-${stop}) { color: ${keywordColor(from + (stop / STOPS) * (to - from), next)}; }`),
    ).join("\n");
  };
  syncScheme();

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
   * Which words act in the chat `element` belongs to: all four for OMP (`omp` and the `omp-…`
   * profiles), ultrathink by Claude's rule for Claude Code, none elsewhere. The agent is read afresh
   * on every call, since React fills props in late and may reuse an element for another chat. A
   * provider seen in a message's props is kept for the chat's composer, whose props carry only the
   * agent id. A chat the lookup cannot place gets all four: colouring too much beats hiding the
   * colours everywhere when Paseo's internals change.
   */
  const wordsFor = (element: HTMLElement): number => {
    if (preferences?.scope === "all") return ALL_WORDS;
    const agent = agentOf(element);
    if (agent.id !== undefined && agent.provider !== undefined) directory.set(agent.id, agent.provider);
    const provider = agent.provider ?? (agent.id === undefined ? undefined : directory.get(agent.id));
    if (provider === undefined) {
      if (!warned && agent.id === undefined) {
        warned = true;
        console.warn("[omp-magic-keywords] found no agent for a chat element; colouring every keyword");
      }
      return ALL_WORDS;
    }
    if (provider === "omp" || provider.startsWith("omp-")) return ALL_WORDS;
    return provider === "claude" ? CLAUDE_WORDS : 0;
  };

  /** The keyword occurrences to colour in `text` under the `words` mask {@link wordsFor} gave. */
  const matchesFor = (text: string, words: number): KeywordMatch[] => {
    if (words & CLAUDE_RULE) return findClaudeUltrathink(text);
    if (words === 0) return [];
    return findMagicKeywords(text).filter(({ keyword }) => words & (1 << keyword));
  };

  const glyphsFor = (matches: KeywordMatch[], nodes: Text[], starts: number[]): Glyph[] => {
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
    return glyphs;
  };

  // Only on-screen sources run the loop: shimmering ones to animate, composers with keywords to
  // track their textarea. It stops when none are left.
  let frame: number | undefined;
  const tick = () => {
    frame = undefined;
    if (disposed) return;
    let again = false;
    for (const element of visible) {
      const source = sources.get(element);
      if (!source) continue;
      if (source.overlay) {
        // Paseo writes the value directly on send, clear and draft restore, without an input event.
        if ((element as HTMLTextAreaElement).value === source.text) place(element as HTMLTextAreaElement, source);
        else processComposer(element as HTMLTextAreaElement);
      }
      paint(source);
      const moving = styleOf(source.kind) === "shimmer" && !reducedMotion.matches;
      if (source.glyphs.length > 0 && (source.overlay || moving)) again = true;
    }
    // processComposer may already have asked for the next frame.
    if (again) frame ??= requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (!disposed) frame ??= requestAnimationFrame(tick);
  };
  reducedMotion.addEventListener("change", schedule);

  const intersections = new IntersectionObserver((entries) => {
    if (disposed) return;
    for (const { target, isIntersecting } of entries) {
      const element = target as HTMLElement;
      if (isIntersecting && sources.has(element)) visible.add(element);
      else visible.delete(element);
    }
    schedule();
  });

  const clear = (element: HTMLElement) => {
    const source = sources.get(element);
    if (!source) return;
    unpaint(source);
    source.overlay?.element.remove();
    sources.delete(element);
    visible.delete(element);
    intersections.unobserve(element);
  };

  const processSent = (element: HTMLElement) => {
    if (styleOf("sent") === "off" || !element.isConnected) {
      clear(element);
      return;
    }
    const text = element.textContent ?? "";
    const existing = sources.get(element);
    const words = wordsFor(element);
    // React may swap a text node for one holding the same text; the Ranges would then address a detached node.
    if (existing && existing.text === text && existing.words === words && existing.nodes.every((node) => node.isConnected)) return;
    clear(element);
    const matches = matchesFor(text, words);
    if (matches.length === 0) return;

    const nodes: Text[] = [];
    const starts: number[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const textNode = node as Text;
      nodes.push(textNode);
      starts.push(offset);
      offset += textNode.data.length;
    }
    const source: Source = { kind: "sent", text, words, nodes, glyphs: glyphsFor(matches, nodes, starts) };
    sources.set(element, source);
    syncScheme(element);
    paint(source);
    intersections.observe(element);
  };

  /** Lays the overlay over its textarea and shows it only while it has as many lines as the textarea. */
  const place = (textarea: HTMLTextAreaElement, source: Source) => {
    const overlay = source.overlay!;
    let shown = false;
    if (isShown(textarea)) {
      // Geometry is read every frame: rows above the composer (attachments) move it without an event.
      // clientWidth leaves out the scrollbar gutter Paseo always reserves.
      const rect = textarea.getBoundingClientRect();
      const width = textarea.clientWidth;
      const css = `${OVERLAY_CSS}${overlay.textCss}left:${rect.left + textarea.clientLeft}px;`
        + `top:${rect.top + textarea.clientTop}px;width:${width}px;height:${textarea.clientHeight}px;`;
      if (css !== overlay.css) {
        overlay.element.setAttribute("style", css);
        overlay.css = css;
        overlay.shown = false;
      }
      const mirrorCss = `${MIRROR_CSS}${overlay.textCss}width:${width}px;`;
      if (mirrorCss !== overlay.mirrorCss) {
        overlay.mirror.setAttribute("style", mirrorCss);
        overlay.mirrorCss = mirrorCss;
        overlay.fits = undefined;
      }
      // The mirror's height gives the textarea's line count; a different count means different line breaks,
      // so colours would land on the wrong words. Both heights are rounded to whole pixels, while a line
      // more or less differs by a whole line height. Breaks at other places within the same count go unseen.
      overlay.fits ??= Math.abs(overlay.inner.offsetHeight + overlay.padding - overlay.mirror.scrollHeight) < 2;
      if (overlay.element.scrollTop !== textarea.scrollTop) overlay.element.scrollTop = textarea.scrollTop;
      shown = overlay.fits;
    }
    if (shown === overlay.shown) return;
    overlay.element.style.visibility = shown ? "visible" : "hidden";
    overlay.shown = shown;
  };

  const processComposer = (textarea: HTMLTextAreaElement) => {
    if (styleOf("composer") === "off" || !textarea.isConnected || !isShown(textarea)) {
      clear(textarea);
      return;
    }
    const text = textarea.value;
    const words = wordsFor(textarea);
    let source = sources.get(textarea);
    const matches = source?.text === text && source.words === words ? undefined : matchesFor(text, words);
    // The overlay holds a copy of the whole draft, so a composer without keywords gets none.
    if (matches?.length === 0) {
      clear(textarea);
      return;
    }
    if (!source) {
      const element = document.createElement("div");
      element.setAttribute("data-plugin", PREFIX);
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("style", OVERLAY_CSS);
      const inner = document.createElement("div");
      const node = document.createTextNode("");
      inner.appendChild(node);
      element.appendChild(inner);
      // Fixed and hidden, it stays out of the copy's layout.
      const mirror = document.createElement("textarea") as HTMLTextAreaElement;
      mirror.setAttribute("tabindex", "-1");
      mirror.setAttribute("style", MIRROR_CSS);
      element.appendChild(mirror);
      document.body.appendChild(element);
      source = {
        kind: "composer", text: "", words: -1, nodes: [node], glyphs: [],
        overlay: { element, inner, node, mirror, textCss: "", padding: 0, css: "", mirrorCss: "", shown: false },
      };
      sources.set(textarea, source);
      intersections.observe(textarea);
    }
    const overlay = source.overlay!;
    if (matches) {
      unpaint(source);
      source.text = text;
      source.words = words;
      // A textarea shows an empty last line after a trailing newline; a div needs a character there.
      overlay.node.data = text.endsWith("\n") ? `${text} ` : text;
      overlay.mirror.value = text;
      overlay.fits = undefined;
      source.glyphs = glyphsFor(matches, source.nodes, [0]);
      syncScheme(textarea);
      paint(source);
    }
    // Paseo restyles the composer per keystroke. Its text style is read here, on input, scroll, poll and
    // rescan, and not in the frame loop.
    const computed = getComputedStyle(textarea);
    overlay.textCss = COPIED.map((name) => `${name}:${computed.getPropertyValue(name)};`).join("");
    overlay.padding = parseFloat(computed.getPropertyValue("padding-top")) + parseFloat(computed.getPropertyValue("padding-bottom"));
    place(textarea, source);
    schedule();
  };

  const onComposerEvent = ({ target }: Event) => {
    if (disposed || !preferences || !(target instanceof HTMLElement)) return;
    if (target.matches(COMPOSER)) processComposer(target as HTMLTextAreaElement);
  };
  document.addEventListener("input", onComposerEvent, true);
  document.addEventListener("scroll", onComposerEvent, true);

  // Preferences, providers and OMP's flags change which sources show what. Sources skipped while
  // off are not tracked, so the whole page is scanned again, once per frame at most.
  let rescanFrame: number | undefined;
  const rescan = () => {
    rescanFrame = undefined;
    if (disposed || !preferences) return;
    for (const [element, source] of [...sources]) if (styleOf(source.kind) === "off") clear(element);
    for (const element of document.querySelectorAll<HTMLElement>(SENT)) processSent(element);
    for (const element of document.querySelectorAll<HTMLTextAreaElement>(COMPOSER)) processComposer(element);
    // A switch between moving and still colours keeps the glyphs and only repaints them.
    for (const source of sources.values()) paint(source);
    schedule();
  };
  const invalidate = () => {
    if (!disposed) rescanFrame ??= requestAnimationFrame(rescan);
  };

  // The chat list is virtualized: messages mount and unmount as it scrolls. Changes are collected
  // and handled once per frame.
  let mutationFrame: number | undefined;
  const pending = new Set<HTMLElement>();
  const mutations = new MutationObserver((records) => {
    if (disposed || styleOf("sent") === "off") return;
    for (const record of records) {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? (record.target as HTMLElement) : record.target.parentElement;
      const sent = target?.closest<HTMLElement>(SENT);
      if (sent) pending.add(sent);
      if (record.type !== "childList") continue;
      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const element = node as HTMLElement;
        if (element.matches(SENT)) pending.add(element);
        for (const inner of element.querySelectorAll<HTMLElement>(SENT)) pending.add(inner);
      }
    }
    if (pending.size === 0) return;
    mutationFrame ??= requestAnimationFrame(() => {
      mutationFrame = undefined;
      if (disposed) return;
      for (const element of pending) processSent(element);
      pending.clear();
    });
  });
  mutations.observe(document.body, { childList: true, characterData: true, subtree: true });

  // Unmounted sources, composers shown or hidden by a tab switch, values Paseo set without an event
  // while no overlay was showing, and theme switches change nothing this module observes.
  const poll = setInterval(() => {
    if (disposed || !preferences) return;
    for (const element of [...sources.keys()]) if (!element.isConnected) clear(element);
    if (styleOf("composer") !== "off") {
      for (const element of Array.from(document.querySelectorAll(COMPOSER))) processComposer(element as HTMLTextAreaElement);
    }
    syncScheme(sources.keys().next().value);
  }, POLL_MS);

  return {
    setPreferences(values) {
      // Re-read on every window focus; the same values need no rescan.
      if (preferences?.sent === values.sent && preferences.composer === values.composer && preferences.scope === values.scope) return;
      preferences = values;
      invalidate();
    },
    agent(id, provider) {
      if (directory.get(id) === provider) return;
      directory.set(id, provider);
      invalidate();
    },
    dispose() {
      disposed = true;
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
function agentOf(element: HTMLElement): AgentRef {
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
function locate(nodes: Text[], starts: number[], offset: number): [Text, number] | undefined {
  if (nodes.length === 0) return undefined;
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  const node = nodes[lo]!;
  return [node, Math.min(offset - starts[lo]!, node.data.length)];
}

/**
 * Whether an element is on screen as far as its own styles go. Without checkVisibility only
 * `display: none` counts, though `visibility` and `opacity` also hide a composer the fixed overlay
 * would still paint over.
 */
function isShown(element: HTMLElement): boolean {
  return element.checkVisibility
    ? element.checkVisibility({ visibilityProperty: true, opacityProperty: true })
    : element.getClientRects().length > 0;
}

/** Relative luminance (0 dark … 1 light) of a computed `rgb()`/`rgba()` color. */
function luminance(color: string): number {
  const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
