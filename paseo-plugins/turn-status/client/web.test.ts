// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULTS, type Preferences } from "../shared/preferences";
import { type Indicator, LiveLabel, startIndicator, warmth } from "./web";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

/** Paseo 0.12's running-turn footer: slot > content row > [loader wrapper > dots, elapsed]. */
function addFooter(elapsed: string): { footer: HTMLElement; elapsed: HTMLElement } {
  const scroll = document.createElement("div");
  scroll.setAttribute("data-testid", "agent-chat-scroll");
  scroll.innerHTML = '<div data-testid="turn-working-indicator"><div>'
    + '<div><div><div style="background-color: rgb(250, 250, 250)"></div></div></div>'
    + `<div data-testid="turn-working-elapsed" style="color: rgb(140, 140, 140)">${elapsed}</div>`
    + "</div></div>";
  document.body.appendChild(scroll);
  return {
    footer: scroll.querySelector<HTMLElement>('[data-testid="turn-working-indicator"]')!,
    elapsed: scroll.querySelector<HTMLElement>('[data-testid="turn-working-elapsed"]')!,
  };
}

/** Runs pending animation frames and MutationObserver callbacks. */
const frames = async (count = 3) => { for (let i = 0; i < count; i += 1) await vi.advanceTimersByTimeAsync(20); };

/** Paseo's LiveElapsed re-renders the text node in place every second. */
const tickTo = (elapsed: HTMLElement, text: string) => { (elapsed.firstChild as Text).data = text; };

let indicator: Indicator | null = null;
const start = (prefs: Partial<Preferences>) => {
  indicator = startIndicator();
  indicator.setPreferences({ ...DEFAULTS, ...prefs });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  document.body.innerHTML = "";
});

afterEach(() => {
  indicator?.dispose();
  indicator = null;
  vi.useRealTimers();
});

describe("warming", () => {
  test("holds still within a 10 s step and moves at the next one", () => {
    expect(warmth(129.9, false)).toEqual(warmth(120, false));
    expect(warmth(130, false).opacity).toBeGreaterThan(warmth(129.9, false).opacity);
    expect(warmth(359, true)).toEqual(warmth(350, true));
    expect(warmth(360, true).color).not.toBe(warmth(359, true).color);
  });

  test("keeps its landmarks: hidden for a minute, faint at 1 min, full at 5 min, amber at 10 min", () => {
    expect(warmth(59, false).opacity).toBe(0);
    expect(warmth(60, false).opacity).toBe(0.15);
    expect(warmth(299, false).opacity).toBeLessThan(1);
    expect(warmth(300, false).opacity).toBe(1);
    expect(warmth(600, false).color).toBe("color-mix(in srgb, #e8a64a 100%, var(--spn-muted))");
  });

  test("a footer whose elapsed text ticks within one step gets no style writes", async () => {
    const { footer, elapsed } = addFooter("2m 1s");
    start({ spinner: "typing-dots", live: "off", time: "warming" });
    await frames();
    expect(footer.style.getPropertyValue("--spn-warm-opacity")).toBe(String(warmth(120, false).opacity));

    const writes: string[] = [];
    const watcher = new MutationObserver((records) => { for (const r of records) writes.push(r.attributeName ?? ""); });
    watcher.observe(footer, { attributes: true });
    for (const text of ["2m 2s", "2m 5s", "2m 9s"]) {
      tickTo(elapsed, text);
      await frames();
    }
    await Promise.resolve();
    expect(writes).toEqual([]);

    tickTo(elapsed, "2m 10s");
    await frames();
    expect([...new Set(writes)]).toEqual(["style"]);
    watcher.disconnect();
    expect(footer.style.getPropertyValue("--spn-warm-opacity")).toBe(String(warmth(130, false).opacity));
  });
});

/** What a sheen host shows: its own text (not the copy's) and the text of its bright copy. */
const sheenOf = (host: Element) => ({
  text: [...host.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(""),
  copy: host.querySelector(".spn-gl .c")?.textContent,
});

describe("sheen", () => {
  test("the shimmer time replaces Paseo's elapsed text and its bright copy keeps up with every tick", async () => {
    const { footer, elapsed } = addFooter("1m 5s");
    start({ spinner: "off", live: "off", time: "shimmer" });
    await frames();
    const time = footer.querySelector(".spn-stime")!;
    expect(time.previousElementSibling).toBe(elapsed);
    expect(getComputedStyle(elapsed).display).toBe("none");
    expect(sheenOf(time)).toEqual({ text: "1m 5s", copy: "1m 5s" });

    tickTo(elapsed, "1m 6s");
    await frames();
    expect(sheenOf(time)).toEqual({ text: "1m 6s", copy: "1m 6s" });

    indicator!.setPreferences({ ...DEFAULTS, time: "plain" });
    await frames();
    expect(footer.querySelector(".spn-stime")).toBeNull();
    expect(getComputedStyle(elapsed).display).not.toBe("none");
  });

  /** The label's element, attached to the page (the plugin types it without the DOM library). */
  const domOf = (label: LiveLabel) => document.body.appendChild(label.el as unknown as HTMLElement);

  test.each(["shimmer", "rolling"] as const)("a %s label's bright copy changes with the label", async (style) => {
    const label = new LiveLabel(style);
    const el = domOf(label);
    label.set("Reading a.ts");
    const text = el.querySelector(".t")!;
    expect(sheenOf(text)).toEqual({ text: "Reading a.ts", copy: "Reading a.ts" });

    label.set("Running git status");
    await vi.advanceTimersByTimeAsync(300);
    expect(sheenOf(text)).toEqual({ text: "Running git status", copy: "Running git status" });
    label.dispose();
  });

  test("the icon label's bright copy repeats both the icon and the text", async () => {
    const label = new LiveLabel("icon");
    const el = domOf(label);
    const icons = () => [...el.querySelectorAll<HTMLElement>(".ico")].map((icon) => icon.style.getPropertyValue("--icon"));
    const texts = () => [...el.querySelectorAll(".t")].map((text) => text.textContent);
    label.set("Reading a.ts", 'url("read.svg")');
    expect(icons()).toEqual(['url("read.svg")', 'url("read.svg")']);
    expect(texts()).toEqual(["Reading a.ts", "Reading a.ts"]);

    label.set("Thinking", null);
    await vi.advanceTimersByTimeAsync(300);
    expect(icons()).toEqual(["", ""]);
    expect(texts()).toEqual(["Thinking", "Thinking"]);
    label.dispose();
  });
});

describe("every animation runs on the compositor", () => {
  /** The CSS the plugin puts on the page: catalog (spinners, labels, time) and footer rules. */
  const pluginCss = () => [...document.querySelectorAll('style[data-plugin^="turn-status"]')].map((style) => style.textContent).join("\n");

  test("keyframes and transitions change only transform and opacity", () => {
    start({});
    const css = pluginCss();
    const animated = new Set<string>();
    for (const match of css.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
      let depth = 0, i = match.index + match[0].length - 1;
      const from = i;
      for (; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) break;
      }
      for (const [, property] of css.slice(from, i).matchAll(/[{;]\s*([a-z-]+)\s*:/g)) animated.add(property!);
    }
    for (const [, value] of css.matchAll(/(?:^|[{;\s])transition\s*:\s*([^;}]+)/g)) {
      for (const part of value!.split(/,(?![^(]*\))/)) animated.add(part.trim().split(/\s+/)[0]!);
    }
    animated.delete("animation-timing-function");
    animated.delete("none");
    expect([...animated].sort()).toEqual(["opacity", "transform"]);
  });
});
