// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Preferences } from "../shared/preferences";
import { keywordColor } from "./color";
import { MAGIC_KEYWORDS, STOPS } from "./keywords";
import { type Engine, startKeywordShimmer } from "./web";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

// jsdom has no Custom Highlight API, IntersectionObserver, matchMedia or checkVisibility. These stand-ins
// keep the parts the engine reads: highlight membership, which elements are observed, media listeners.
class FakeHighlight extends Set<Range> {
  priority = 0;
}
const registry = new Map<string, FakeHighlight>();

class FakeIntersectionObserver {
  static all = new Set<FakeIntersectionObserver>();
  readonly targets = new Set<Element>();
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.all.add(this);
  }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); FakeIntersectionObserver.all.delete(this); }
  report(target: Element, isIntersecting: boolean) {
    if (!this.targets.has(target)) return;
    this.callback([{ target, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}
/** What the browser reports once the element enters or leaves the viewport (and the margin around it). */
const view = (target: Element, isIntersecting: boolean) => {
  for (const observer of [...FakeIntersectionObserver.all]) observer.report(target, isIntersecting);
};
const observed = (target: Element) => [...FakeIntersectionObserver.all].some((observer) => observer.targets.has(target));

const mediaListeners = new Map<string, Set<() => void>>();
const fakeMatchMedia = (query: string) => ({
  matches: false,
  media: query,
  addEventListener: (_: string, listener: () => void) => {
    if (!mediaListeners.has(query)) mediaListeners.set(query, new Set());
    mediaListeners.get(query)!.add(listener);
  },
  removeEventListener: (_: string, listener: () => void) => mediaListeners.get(query)?.delete(listener),
});

/** The engine's delay before dropping rules nobody needs (RULES_OFF_MS in web.ts). */
const RULES_OFF_MS = 300;
const PREFS: Preferences = { sent: "still", composer: "still", scope: "all" };
const LIGHT_TEXT = "rgb(240, 240, 240)";
const DARK_TEXT = "rgb(20, 20, 20)";

function addMessage(text: string): { wrapper: HTMLElement; element: HTMLElement } {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-testid", "user-message");
  const element = document.createElement("div");
  element.setAttribute("data-message-text", "");
  element.style.color = LIGHT_TEXT;
  element.textContent = text;
  wrapper.appendChild(element);
  document.body.appendChild(wrapper);
  return { wrapper, element };
}

function addComposer(value = ""): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.setAttribute("data-composer-input", "true");
  // The overlay's line check compares heights plus padding; jsdom lays nothing out, so padding must be 0.
  textarea.style.padding = "0px";
  textarea.style.color = LIGHT_TEXT;
  textarea.value = value;
  document.body.appendChild(textarea);
  return textarea;
}

const sheet = () => document.head.querySelector<HTMLStyleElement>('style[data-plugin="omp-magic-keywords"]')!;
/** The words that currently have `::highlight()` rules, each with its rule count. */
const ruled = () => {
  const counts: Record<string, number> = {};
  for (const [, word] of sheet().textContent!.matchAll(/::highlight\(omp-magic-keywords-(\w+)-\d+\)/g)) counts[word!] = (counts[word!] ?? 0) + 1;
  return counts;
};
const ranges = (word: string) => [...registry].filter(([name]) => name.startsWith(`omp-magic-keywords-${word}-`)).reduce((sum, [, highlight]) => sum + highlight.size, 0);
const overlays = () => document.querySelectorAll('body > div[data-plugin="omp-magic-keywords"]');
/** Runs pending animation frames, observer callbacks and timers due within `ms`. */
const frames = async (ms = 60) => { await vi.advanceTimersByTimeAsync(ms); };

let engine: Engine | undefined;
const start = async (prefs = PREFS) => {
  engine = startKeywordShimmer();
  engine.setPreferences(prefs);
  await frames();
  return engine;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  registry.clear();
  mediaListeners.clear();
  vi.stubGlobal("CSS", { highlights: registry });
  vi.stubGlobal("Highlight", FakeHighlight);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.stubGlobal("matchMedia", fakeMatchMedia);
  HTMLElement.prototype.checkVisibility = () => true;
  document.body.innerHTML = "";
  document.documentElement.className = "";
});
afterEach(() => {
  engine?.dispose();
  engine = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("highlight rules follow the keywords in view", () => {
  test("no rules until a keyword is on the page, then only the shown word's", async () => {
    await start();
    addMessage("plain prompt");
    await frames();
    expect(sheet().textContent).toBe("");

    const { element } = addMessage("please ultrathink about it");
    await frames();
    view(element, true);
    expect(ruled()).toEqual({ ultrathink: STOPS });
    expect(ranges("ultrathink")).toBe("ultrathink".length);
  });

  test("a message's rules go 300 ms after it leaves the view and come back the moment it returns", async () => {
    await start();
    const { element } = addMessage("orchestrate this");
    await frames();
    view(element, true);
    view(element, false);
    await frames(RULES_OFF_MS - 1);
    expect(ruled()).toEqual({ orchestrate: STOPS });
    await frames(1);
    expect(sheet().textContent).toBe("");
    // The glyphs keep their colours' ranges, so a return needs only the rules.
    expect(ranges("orchestrate")).toBe("orchestrate".length);

    view(element, true);
    expect(ruled()).toEqual({ orchestrate: STOPS });
  });

  test("a message bobbing at the viewport edge does not rewrite the rules", async () => {
    await start();
    const { element } = addMessage("orchestrate this");
    await frames();
    view(element, true);
    const writes = vi.fn();
    new MutationObserver(writes).observe(sheet(), { childList: true, characterData: true, subtree: true });
    for (let i = 0; i < 5; i++) {
      view(element, false);
      await frames(100);
      view(element, true);
      await frames(100);
    }
    expect(writes).not.toHaveBeenCalled();
    expect(ruled()).toEqual({ orchestrate: STOPS });
  });

  test("a message mounted out of view loses the rules it was given before the first report", async () => {
    await start();
    const { element } = addMessage("jevify the list");
    await frames();
    // Until the observer reports, a new message counts as in view so its first frame is coloured.
    expect(ruled()).toEqual({ jevify: STOPS });
    view(element, false);
    await frames(RULES_OFF_MS);
    expect(sheet().textContent).toBe("");
  });

  test("rules cover the union of the words in view", async () => {
    await start();
    const first = addMessage("ultrathink first");
    const second = addMessage("then workflowz and jevify");
    await frames();
    view(first.element, true);
    view(second.element, true);
    expect(ruled()).toEqual({ ultrathink: STOPS, workflowz: STOPS, jevify: STOPS });
    view(second.element, false);
    await frames(RULES_OFF_MS);
    expect(ruled()).toEqual({ ultrathink: STOPS });
  });

  test("a shown composer overlay keeps its words' rules; a tab switch removes overlay and rules", async () => {
    await start();
    const textarea = addComposer("orchestrate the fix");
    await frames();
    view(textarea, true);
    await frames();
    expect(overlays()).toHaveLength(1);
    expect((overlays()[0] as HTMLElement).style.visibility).toBe("visible");
    expect(ruled()).toEqual({ orchestrate: STOPS });

    // Paseo hides an inactive tab with display: none; its composer stops intersecting.
    view(textarea, false);
    expect(overlays()).toHaveLength(0);
    expect(ranges("orchestrate")).toBe(0);
    await frames(RULES_OFF_MS);
    expect(sheet().textContent).toBe("");

    view(textarea, true);
    await frames();
    expect(overlays()).toHaveLength(1);
    expect(ruled()).toEqual({ orchestrate: STOPS });
  });

  test("a composer hidden by its own styles keeps its draft and shows the colours again", async () => {
    await start();
    const textarea = addComposer("ultrathink harder");
    await frames();
    view(textarea, true);
    await frames();
    let shown = true;
    HTMLElement.prototype.checkVisibility = () => shown;
    // Dictation fades the text box to opacity 0 and may write the transcript while it is hidden.
    shown = false;
    textarea.value = "ultrathink harder and jevify";
    await frames(RULES_OFF_MS + 60);
    expect((overlays()[0] as HTMLElement).style.visibility).toBe("hidden");
    expect(sheet().textContent).toBe("");
    shown = true;
    await frames();
    expect((overlays()[0] as HTMLElement).style.visibility).toBe("visible");
    expect(ruled()).toEqual({ ultrathink: STOPS, jevify: STOPS });
  });
});

describe("changes Paseo makes without an event", () => {
  test("a value written straight to the textarea is coloured, and clearing it removes the overlay", async () => {
    await start();
    const textarea = addComposer();
    await frames();
    view(textarea, true);
    await frames();
    expect(overlays()).toHaveLength(0);

    textarea.value = "jevify the draft";
    expect(textarea.value).toBe("jevify the draft");
    await frames();
    expect(overlays()).toHaveLength(1);
    expect(overlays()[0]!.textContent).toContain("jevify the draft");
    expect(ruled()).toEqual({ jevify: STOPS });

    textarea.value = "";
    await frames();
    expect(overlays()).toHaveLength(0);
  });

  test("React's value tracker on the element still sees every write, and gets its property back on dispose", async () => {
    await start();
    const textarea = document.createElement("textarea");
    textarea.setAttribute("data-composer-input", "true");
    textarea.style.padding = "0px";
    // React defines an own `value` property at mount that records each write, then calls the native setter.
    const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!;
    const tracked: string[] = [];
    const tracker: PropertyDescriptor = {
      configurable: true,
      get(this: HTMLTextAreaElement) { return native.get!.call(this); },
      set(this: HTMLTextAreaElement, value: string) { tracked.push(value); native.set!.call(this, value); },
    };
    Object.defineProperty(textarea, "value", tracker);
    document.body.appendChild(textarea);
    await frames();
    view(textarea, true);
    await frames();
    textarea.value = "workflowz now";
    await frames();
    expect(tracked).toEqual(["workflowz now"]);
    expect(overlays()[0]!.textContent).toContain("workflowz now");

    engine!.dispose();
    engine = undefined;
    expect(Object.getOwnPropertyDescriptor(textarea, "value")!.set).toBe(tracker.set);
  });

  test("a message leaving the page drops its ranges at once and its rules shortly after", async () => {
    await start();
    const { wrapper, element } = addMessage("ultrathink then");
    await frames();
    view(element, true);
    expect(ranges("ultrathink")).toBeGreaterThan(0);

    wrapper.remove();
    await Promise.resolve();
    expect(ranges("ultrathink")).toBe(0);
    expect(observed(element)).toBe(false);
    await frames(RULES_OFF_MS);
    expect(sheet().textContent).toBe("");
  });

  test("a composer leaving the page takes its overlay with it", async () => {
    await start();
    const textarea = addComposer("orchestrate");
    await frames();
    view(textarea, true);
    await frames();
    expect(overlays()).toHaveLength(1);
    textarea.remove();
    await Promise.resolve();
    expect(overlays()).toHaveLength(0);
    expect(observed(textarea)).toBe(false);
  });

  test("a theme switch on <html> re-colours the rules for the new background", async () => {
    await start();
    const { element } = addMessage("ultrathink");
    await frames();
    view(element, true);
    const firstStop = () => sheet().textContent!.match(/::highlight\(omp-magic-keywords-ultrathink-0\) \{ color: ([^;]+);/)![1];
    const [from] = MAGIC_KEYWORDS[0]!.hue;
    expect(firstStop()).toBe(keywordColor(from, "dark"));

    element.style.color = DARK_TEXT;
    document.documentElement.className = "light";
    await frames();
    expect(firstStop()).toBe(keywordColor(from, "light"));
  });

  test("a system light/dark switch re-colours the rules (Paseo's auto theme)", async () => {
    await start();
    const { element } = addMessage("ultrathink");
    await frames();
    view(element, true);
    element.style.color = DARK_TEXT;
    for (const listener of mediaListeners.get("(prefers-color-scheme: dark)") ?? []) listener();
    await frames();
    const [from] = MAGIC_KEYWORDS[0]!.hue;
    expect(sheet().textContent).toContain(`color: ${keywordColor(from, "light")};`);
  });

  test("leaves no timer running while nothing moves", async () => {
    await start();
    const { element } = addMessage("ultrathink, still colours");
    addComposer("no keyword here");
    await frames();
    view(element, false);
    await frames(1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
