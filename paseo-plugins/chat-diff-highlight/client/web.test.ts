// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { diffPalette } from "./palette";
import { startDiffHighlighting } from "./web";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

// jsdom has no CSS Custom Highlight API, ResizeObserver, matchMedia or Range layout.
class FakeHighlight extends Set<StaticRange> {
  priority = 0;
}
const registry = new Map<string, FakeHighlight>();
Object.assign(globalThis, {
  CSS: { highlights: registry },
  Highlight: FakeHighlight,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
let schemeListeners: Array<() => void> = [];
Object.assign(globalThis, {
  matchMedia: () => ({
    addEventListener: (_: string, listener: () => void) => schemeListeners.push(listener),
    removeEventListener: (_: string, listener: () => void) => (schemeListeners = schemeListeners.filter((l) => l !== listener)),
  }),
});

const LIGHT_TEXT = "rgb(20, 20, 20)";
const DARK_TEXT = "rgb(240, 240, 240)";

// Paseo's theme: Unistyles swaps a class on <html>; colors come from its stylesheet in <head>.
const themeSheet = () => document.head.querySelector<HTMLStyleElement>("#unistyles-web")!;

/** A chat code block with Paseo's markers: one span per line, newlines in spans of their own. */
function addDiffBlock(lines: string[]): HTMLElement {
  const pre = document.createElement("div");
  pre.setAttribute("data-paseo-markdown-tag", "pre");
  pre.setAttribute("data-paseo-markdown-language", "diff");
  const code = document.createElement("span");
  code.setAttribute("data-paseo-markdown-tag", "code");
  lines.forEach((line, index) => {
    if (index > 0) code.append(Object.assign(document.createElement("span"), { textContent: "\n" }));
    code.append(Object.assign(document.createElement("span"), { textContent: line }));
  });
  pre.append(code);
  document.body.append(pre);
  return pre;
}
const DIFF = ["@@ -1 +1 @@", "-const a = 1;", "+const a = 2;", " return a;"];

/** The color the plugin's stylesheet gives one of its highlights. */
function ruleColor(name: string): string | undefined {
  const sheet = document.head.querySelector('style[data-plugin="chat-diff-highlight"]')?.textContent ?? "";
  return sheet.match(new RegExp(`::highlight\\(chat-diff-highlight-${name}\\) \\{ color: ([^;]+);`))?.[1];
}
const rangeCount = () => [...registry.values()].reduce((sum, highlight) => sum + highlight.size, 0);
const settle = () => vi.advanceTimersByTimeAsync(20);

let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  localStorage.clear();
  document.body.innerHTML = "";
  document.head.innerHTML = `<style id="unistyles-web">
    :root.light [data-paseo-markdown-tag="code"] { color: ${LIGHT_TEXT}; }
    :root.dark [data-paseo-markdown-tag="code"] { color: ${DARK_TEXT}; }
  </style>`;
  document.documentElement.className = "light";
});
afterEach(() => {
  stop?.();
  stop = undefined;
  registry.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("theme and syntax theme switches", () => {
  test("a theme switch recolors diff blocks at once", async () => {
    addDiffBlock(DIFF);
    stop = startDiffHighlighting();
    expect(ruleColor("keyword")).toBe(diffPalette("one", "light").tokens.keyword);

    document.documentElement.className = "dark";
    await Promise.resolve();
    expect(ruleColor("keyword")).toBe(diffPalette("one", "dark").tokens.keyword);
    expect(ruleColor("text-add")).toContain(DARK_TEXT);
  });

  test("a syntax theme picked in Settings applies when Paseo rewrites its theme stylesheet", async () => {
    addDiffBlock(DIFF);
    stop = startDiffHighlighting();
    expect(ruleColor("keyword")).toBe(diffPalette("one", "light").tokens.keyword);

    localStorage.setItem("@paseo:app-settings", JSON.stringify({ syntaxTheme: "dracula" }));
    themeSheet().append("/* syntax colors */");
    await Promise.resolve();
    expect(ruleColor("keyword")).toBe(diffPalette("dracula", "light").tokens.keyword);
  });

  test("a settings change nothing reported still applies within 10 seconds", async () => {
    addDiffBlock(DIFF);
    stop = startDiffHighlighting();
    localStorage.setItem("@paseo:app-settings", JSON.stringify({ syntaxTheme: "dracula" }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ruleColor("keyword")).toBe(diffPalette("dracula", "light").tokens.keyword);
  });

  test("theme colors that changed while the window was in the background apply on focus", async () => {
    addDiffBlock(DIFF);
    stop = startDiffHighlighting();
    // A theme plugin updated in place: same theme name, so no class change, and no settings change.
    themeSheet().textContent = `[data-paseo-markdown-tag="code"] { color: ${DARK_TEXT}; }`;
    await settle();
    window.dispatchEvent(new Event("focus"));
    expect(ruleColor("keyword")).toBe(diffPalette("one", "dark").tokens.keyword);
  });

  test("the system light/dark switch recolors blocks in Paseo's automatic theme", async () => {
    addDiffBlock(DIFF);
    stop = startDiffHighlighting();
    themeSheet().textContent = `[data-paseo-markdown-tag="code"] { color: ${DARK_TEXT}; }`;
    await settle();
    for (const listener of schemeListeners) listener();
    expect(ruleColor("keyword")).toBe(diffPalette("one", "dark").tokens.keyword);
  });
});

describe("cost while nothing changes", () => {
  test("an idle chat with a diff block reads no computed style", async () => {
    addDiffBlock(DIFF);
    stop = startDiffHighlighting();
    await settle();
    const reads = vi.spyOn(globalThis, "getComputedStyle");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reads).not.toHaveBeenCalled();
  });

  test("Paseo adding its own styles while streaming reads no computed style", async () => {
    addDiffBlock(DIFF);
    stop = startDiffHighlighting();
    await settle();
    const reads = vi.spyOn(globalThis, "getComputedStyle");
    for (let i = 0; i < 5; i += 1) {
      themeSheet().append(`.css-${i} { color: red; }`);
      await settle();
    }
    expect(reads).not.toHaveBeenCalled();
  });

  test("an unmounted diff block releases its highlight ranges without waiting for a frame", async () => {
    const pre = addDiffBlock(DIFF);
    stop = startDiffHighlighting();
    expect(rangeCount()).toBeGreaterThan(0);
    pre.remove();
    await Promise.resolve();
    expect(rangeCount()).toBe(0);
  });
});
