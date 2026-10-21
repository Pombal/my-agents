// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULTS, type Preferences } from "../shared/preferences";
import { type Indicator, startIndicator, warmth } from "./web";

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
