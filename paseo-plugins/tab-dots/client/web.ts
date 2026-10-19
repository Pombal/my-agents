import { Platform } from "react-native";
import type { Preferences } from "../shared/preferences";
import { type AgentInfo, type DotState, orderTabs, readLayoutOrder, rootsByWorkspace, rowDots } from "./model";

// Sanctioned web-only globals: the rest of the plugin has no DOM library.
interface Rect { left: number; top: number; right: number; bottom: number; width: number }
interface El {
  readonly firstElementChild: El | null;
  readonly lastElementChild: El | null;
  readonly nextSibling: El | null;
  readonly parentElement: El | null;
  readonly childElementCount: number;
  className: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;
  querySelector(selector: string): El | null;
  querySelectorAll(selector: string): { forEach(callback: (element: El) => void): void };
  closest(selector: string): El | null;
  insertBefore(node: El, reference: El | null): void;
  appendChild(node: El): void;
  remove(): void;
  getBoundingClientRect(): Rect;
  style: { left: string; top: string };
}
interface PointerLike { target: El | null; relatedTarget: El | null }
declare const document: {
  head: El;
  body: El;
  createElement(tag: string): El;
  querySelectorAll(selector: string): { forEach(callback: (element: El) => void): void };
  addEventListener(type: "mouseover" | "mouseout", listener: (event: PointerLike) => void): void;
  removeEventListener(type: "mouseover" | "mouseout", listener: (event: PointerLike) => void): void;
};
declare const window: {
  innerWidth: number;
  addEventListener(type: "storage" | "focus", listener: () => void): void;
  removeEventListener(type: "storage" | "focus", listener: () => void): void;
  getComputedStyle(element: El): { color: string };
};
declare const localStorage: { getItem(key: string): string | null };
declare function requestAnimationFrame(callback: () => void): number;
declare function cancelAnimationFrame(handle: number): void;
declare function setInterval(callback: () => void, ms: number): number;
declare function clearInterval(handle: number): void;
declare class MutationObserver {
  constructor(callback: () => void);
  observe(target: El, options: { childList: boolean; subtree: boolean }): void;
  disconnect(): void;
}

const ROW_PREFIX = "sidebar-workspace-row-";
const ROWS = `[data-testid^="${ROW_PREFIX}"]`;
const LAYOUT_KEY = "workspace-layout-state";
const DOTS = "data-tab-dots";
const REPLACE = "data-tab-dots-replace";
const MAX_DOTS = { regular: 5, small: 8 } as const;

const LABEL: Record<DotState, string> = {
  permission: "Waiting for permission",
  error: "Error",
  running: "Running",
  finished: "Finished · unread",
  read: "Read",
};

// Colours are Paseo's statusDot* tokens (app `styles/theme.ts`), dark and light.
const CSS = `
[${DOTS}] { display: inline-flex; align-items: center; flex: none; gap: 3px; height: 20px;
  --td-ok: #35c264; --td-err: #f7796d; --td-warn: #db932e; --td-run: #5caaf6; }
[${DOTS}][data-tone="light"] { --td-ok: #299f51; --td-err: #f12e2f; --td-warn: #b37824; --td-run: #268ae0; }
[${DOTS}][data-size="small"] { gap: 2px; }
[${DOTS}] > i { display: block; flex: none; width: 5px; height: 5px; border-radius: 50%; }
[${DOTS}][data-size="small"] > i { width: 4px; height: 4px; }
[${DOTS}] > i[data-state="finished"], [data-tab-dots-tip] i[data-state="finished"] { background: var(--td-ok); }
[${DOTS}] > i[data-state="error"], [data-tab-dots-tip] i[data-state="error"] { background: var(--td-err); }
[${DOTS}] > i[data-state="permission"], [data-tab-dots-tip] i[data-state="permission"] { background: var(--td-warn); }
[${DOTS}] > i[data-state="running"], [data-tab-dots-tip] i[data-state="running"] { background: var(--td-run); animation: tab-dots-pulse 1.8s ease-in-out infinite; }
[${DOTS}] > i[data-state="read"], [data-tab-dots-tip] i[data-state="read"] { background: currentColor; opacity: .35; }
[${DOTS}] > span { font-size: 11px; line-height: 20px; opacity: .7; margin-left: 1px; font-variant-numeric: tabular-nums; }
@keyframes tab-dots-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) { [${DOTS}] > i, [data-tab-dots-tip] i { animation: none !important; } }
/* The time's slot keeps 18 px for the hover menu; the dots take it until the row is hovered. */
[${REPLACE}] [data-testid="sidebar-workspace-timestamp"] { display: none !important; }
[${REPLACE}]:not(:hover):not(:focus-within) [${DOTS}] + div:has([data-testid="sidebar-workspace-timestamp"]) { display: none !important; }
[data-tab-dots-tip] { position: fixed; z-index: 2147483000; pointer-events: none; display: none; align-items: center; gap: 6px;
  max-width: 280px; padding: 3px 8px; border-radius: 6px; font: 12px/18px system-ui, sans-serif; white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,.25); --td-ok: #35c264; --td-err: #f7796d; --td-warn: #db932e; --td-run: #5caaf6; }
[data-tab-dots-tip][data-tone="light"] { --td-ok: #299f51; --td-err: #f12e2f; --td-warn: #b37824; --td-run: #268ae0; }
[data-tab-dots-tip] i { display: block; flex: none; width: 6px; height: 6px; border-radius: 50%; }
[data-tab-dots-tip] b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
[data-tab-dots-tip] em { font-style: normal; opacity: .6; }
`;

/** Title row inside a workspace row: button > rowContent > rowMain > content column > titleRow. No testid of its own. */
function findTitleRow(row: El): El | null {
  const titleRow = row.firstElementChild?.firstElementChild?.lastElementChild?.firstElementChild ?? null;
  const title = titleRow?.firstElementChild;
  return title && !title.hasAttribute(DOTS) ? titleRow : null;
}

/** The title's computed text colour, and the theme tone it implies: light text means a dark theme. */
function inkOf(title: El): { color: string; tone: "dark" | "light" } {
  const color = window.getComputedStyle(title).color;
  const [r = 0, g = 0, b = 0] = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return { color, tone: 0.2126 * r + 0.7152 * g + 0.0722 * b > 128 ? "dark" : "light" };
}

export interface TabDots {
  setAgents(agents: ReadonlyMap<string, AgentInfo>): void;
  setPreferences(preferences: Preferences): void;
  dispose(): void;
}

/** Draws the dots into every sidebar workspace row and keeps them in sync. No-op off the web. */
export function startTabDots(initial: Preferences): TabDots {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return { setAgents() {}, setPreferences() {}, dispose() {} };
  }
  let preferences = initial;
  let roots = new Map<string, AgentInfo[]>();
  let layoutRaw: string | null = null;
  let layout = new Map<string, string[]>();
  let frame = 0;
  let disposed = false;

  const style = document.createElement("style");
  style.setAttribute("data-plugin", "tab-dots");
  style.textContent = CSS;
  document.head.appendChild(style);
  const tip = document.createElement("div");
  tip.setAttribute("data-tab-dots-tip", "");
  document.body.appendChild(tip);

  const clearRow = (row: El) => {
    row.querySelector(`[${DOTS}]`)?.remove();
    row.removeAttribute(REPLACE);
  };

  const renderRow = (row: El) => {
    const key = (row.getAttribute("data-testid") ?? "").slice(ROW_PREFIX.length);
    const workspaceId = key.slice(key.lastIndexOf(":") + 1);
    const titleRow = findTitleRow(row);
    const tabs = orderTabs(roots.get(workspaceId) ?? [], layout.get(key));
    const { dots, more } = rowDots(tabs, preferences.show, MAX_DOTS[preferences.size]);
    if (!titleRow || dots.length === 0) {
      clearRow(row);
      return;
    }
    const title = titleRow.firstElementChild as El;
    const { color, tone } = inkOf(title);
    const signature = JSON.stringify([color, preferences.size, more, dots]);
    if (preferences.replaceTime) row.setAttribute(REPLACE, "");
    else row.removeAttribute(REPLACE);
    const existing = row.querySelector(`[${DOTS}]`);
    if (existing && existing.parentElement === titleRow && existing.getAttribute(DOTS) === signature) return;
    existing?.remove();
    const container = document.createElement("div");
    container.setAttribute(DOTS, signature);
    container.setAttribute("data-tone", tone);
    // Read dots and "+N" are drawn in the title's own colour, faded.
    container.setAttribute("style", `color: ${color}`);
    container.setAttribute("data-size", preferences.size);
    container.setAttribute("aria-hidden", "true");
    for (const dot of dots) {
      const element = document.createElement("i");
      element.setAttribute("data-state", dot.state);
      element.setAttribute("data-title", dot.title);
      container.appendChild(element);
    }
    if (more > 0) {
      const count = document.createElement("span");
      count.textContent = `+${more}`;
      container.appendChild(count);
    }
    titleRow.insertBefore(container, title.nextSibling);
  };

  const render = () => {
    frame = 0;
    if (disposed) return;
    document.querySelectorAll(ROWS).forEach(preferences.enabled ? renderRow : clearRow);
  };
  const schedule = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(render);
  };

  // Same-window layout writes fire no `storage` event, so poll the raw string as well.
  const reloadLayout = () => {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw === layoutRaw) return;
    layoutRaw = raw;
    layout = readLayoutOrder(raw);
    schedule();
  };
  reloadLayout();
  const poll = setInterval(reloadLayout, 2000);
  window.addEventListener("storage", reloadLayout);

  // Paseo remounts rows (plugin load, grouping switch, expanding a project); re-add dots then.
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });

  const onOver = (event: PointerLike) => {
    const dot = event.target?.closest(`[${DOTS}] > i`);
    if (!dot) return;
    const state = (dot.getAttribute("data-state") ?? "read") as DotState;
    const container = dot.parentElement;
    tip.setAttribute("data-tone", container?.getAttribute("data-tone") ?? "dark");
    tip.textContent = "";
    const swatch = document.createElement("i");
    swatch.setAttribute("data-state", state);
    const name = document.createElement("b");
    name.textContent = dot.getAttribute("data-title");
    const label = document.createElement("em");
    label.textContent = LABEL[state];
    tip.appendChild(swatch);
    tip.appendChild(name);
    tip.appendChild(label);
    // Text in the row title's colour (the dots container carries it); surface by theme tone.
    const light = container?.getAttribute("data-tone") === "light";
    tip.setAttribute(
      "style",
      `display:flex;color:${container ? window.getComputedStyle(container).color : "inherit"};`
        + `background:${light ? "#ffffff" : "#232027"};border:1px solid rgba(127,127,127,.25)`,
    );
    const box = dot.getBoundingClientRect();
    const width = tip.getBoundingClientRect().width;
    tip.style.left = `${Math.max(4, Math.min(box.left - 10, window.innerWidth - width - 4))}px`;
    tip.style.top = `${box.bottom + 8}px`;
  };
  const onOut = (event: PointerLike) => {
    if (event.target?.closest(`[${DOTS}] > i`) && !event.relatedTarget?.closest(`[${DOTS}] > i`)) {
      tip.setAttribute("style", "display:none");
    }
  };
  document.addEventListener("mouseover", onOver);
  document.addEventListener("mouseout", onOut);

  return {
    setAgents(agents) {
      roots = rootsByWorkspace(agents);
      schedule();
    },
    setPreferences(next) {
      preferences = next;
      schedule();
    },
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      clearInterval(poll);
      window.removeEventListener("storage", reloadLayout);
      observer.disconnect();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.querySelectorAll(ROWS).forEach(clearRow);
      tip.remove();
      style.remove();
    },
  };
}
