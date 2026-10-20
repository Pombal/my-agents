// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULTS, type Preferences } from "../shared/preferences";
import type { AgentInfo } from "./model";
import { startTabDots, type TabDots } from "./web";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

const PREFS: Preferences = { ...DEFAULTS, enabled: true, show: "unread" };

/** A sidebar row with Paseo's structure: button > content > main > column > title row. */
function addRow(key: string, parent: Element = document.body): HTMLElement {
  const row = document.createElement("button");
  row.setAttribute("data-testid", `sidebar-workspace-row-${key}`);
  row.innerHTML = `<div><div><div></div><div><div><div style="color: rgb(249, 248, 251)">${key}</div>`
    + `<div><div><div data-testid="sidebar-workspace-timestamp">2h</div></div></div></div></div></div></div>`;
  parent.appendChild(row);
  return row;
}

function unread(id: string, workspaceId: string, extra: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id, workspaceId, parentId: null, title: `Tab ${id}`, status: "idle", requiresAttention: true,
    attentionReason: "finished", pendingPermissions: 0, at: null, ...extra,
  };
}
const agentsOf = (...list: AgentInfo[]) => new Map(list.map((agent) => [agent.id, agent]));

const dotsIn = (row: Element) => [...row.querySelectorAll("[data-tab-dots] > i")].map((dot) => dot.getAttribute("data-agent"));
const tip = () => document.querySelector<HTMLElement>("[data-tab-dots-tip]")!;
const tipShown = () => tip().style.display === "flex";
const hover = (target: Element, from: Element | null = null) =>
  target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: from }));
const leave = (target: Element, to: Element | null) =>
  target.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: to }));
/** Runs pending animation frames and MutationObserver callbacks. */
const frames = async (count = 3) => { for (let i = 0; i < count; i += 1) await vi.advanceTimersByTimeAsync(20); };

let started: TabDots[] = [];
const start = (agents: Map<string, AgentInfo>, prefs = PREFS) => {
  const dots = startTabDots(prefs);
  dots.setAgents(agents);
  started.push(dots);
  return dots;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  document.body.innerHTML = "";
  localStorage.clear();
});
afterEach(() => {
  for (const dots of started) dots.dispose();
  started = [];
  vi.useRealTimers();
});

describe("two hosts in one window", () => {
  // One installation runs per connected host. Each used to clear the other host's rows, which
  // the other re-added: both rows rebuilt every frame, and a dot click navigated twice.
  test("each host draws only its own rows, the page settles, and a click navigates once", async () => {
    const rowA = addRow("srv_A:wks_a");
    const rowB = addRow("srv_B:wks_b");
    start(agentsOf(unread("a1", "wks_a")));
    start(agentsOf(unread("b1", "wks_b")));
    await frames();
    expect(dotsIn(rowA)).toEqual(["a1"]);
    expect(dotsIn(rowB)).toEqual(["b1"]);

    let mutations = 0;
    const counter = new MutationObserver((records) => { mutations += records.length; });
    counter.observe(document.body, { childList: true, subtree: true });
    await frames(10);
    counter.disconnect();
    expect(mutations).toBe(0);

    const pushState = vi.spyOn(history, "pushState");
    rowA.querySelector("[data-tab-dots] > i")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await frames(2);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState.mock.calls[0]?.[2]).toBe("/h/srv_A/workspace/wks_a?open=agent%3Aa1");
  });
});

describe("tooltip", () => {
  // The tooltip used to stay on screen when the hovered dot went away (row unmounted, or the
  // pointer moved on after the dot vanished), for minutes.
  test("hides when the pointer moves to something that isn't a dot", async () => {
    const row = addRow("srv_A:wks_a");
    start(agentsOf(unread("a1", "wks_a")));
    await frames();
    hover(row.querySelector("[data-tab-dots] > i")!);
    expect(tipShown()).toBe(true);
    hover(document.body);
    expect(tipShown()).toBe(false);
  });

  test("hides when the hovered dot's row unmounts", async () => {
    const row = addRow("srv_A:wks_a");
    start(agentsOf(unread("a1", "wks_a")));
    await frames();
    hover(row.querySelector("[data-tab-dots] > i")!);
    row.remove();
    await frames();
    expect(tipShown()).toBe(false);
  });
});

describe("dots under the pointer", () => {
  test("don't change while hovered, and catch up when the pointer leaves", async () => {
    const row = addRow("srv_A:wks_a");
    const dots = start(agentsOf(unread("a1", "wks_a"), unread("a2", "wks_a")));
    await frames();
    const dot = row.querySelector("[data-tab-dots] > i")!;
    hover(dot);
    dots.setAgents(agentsOf(unread("a2", "wks_a")));
    await frames();
    expect(dotsIn(row)).toEqual(["a1", "a2"]);
    leave(dot, document.body);
    await frames();
    expect(dotsIn(row)).toEqual(["a2"]);
  });
});

describe("clicking an unread dot", () => {
  test("hides it at once, before the daemon confirms the read", async () => {
    const row = addRow("srv_A:wks_a");
    const dots = start(agentsOf(unread("a1", "wks_a"), unread("a2", "wks_a")));
    await frames();
    row.querySelector('[data-agent="a1"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Drawn in the click itself, before the navigation that follows the next paint.
    expect(dotsIn(row)).toEqual(["a2"]);
    // The daemon confirms: still hidden, and nothing comes back later.
    dots.setAgents(agentsOf(unread("a1", "wks_a", { requiresAttention: false, attentionReason: null }), unread("a2", "wks_a")));
    await vi.advanceTimersByTimeAsync(6000);
    expect(dotsIn(row)).toEqual(["a2"]);
  });

  test("comes back if the daemon never marks it read", async () => {
    const row = addRow("srv_A:wks_a");
    start(agentsOf(unread("a1", "wks_a")));
    await frames();
    row.querySelector('[data-agent="a1"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await frames(1);
    expect(dotsIn(row)).toEqual([]);
    await vi.advanceTimersByTimeAsync(6000);
    expect(dotsIn(row)).toEqual(["a1"]);
  });

  test("a permission dot stays: opening the tab doesn't answer the request", async () => {
    const row = addRow("srv_A:wks_a");
    start(agentsOf(unread("a1", "wks_a", { attentionReason: "permission", pendingPermissions: 1 })));
    await frames();
    row.querySelector('[data-agent="a1"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await frames(1);
    expect(dotsIn(row)).toEqual(["a1"]);
  });
});

describe("rows Paseo mounts later", () => {
  // Rows remount on project expand, grouping switch and plugin load; they must get their dots.
  test("a row added after start gets its dots, also inside a newly added list", async () => {
    start(agentsOf(unread("a1", "wks_a"), unread("b1", "wks_b")));
    await frames();
    const row = addRow("srv_A:wks_a");
    await frames();
    expect(dotsIn(row)).toEqual(["a1"]);
    const list = document.createElement("div");
    const nested = addRow("srv_A:wks_b", list);
    document.body.appendChild(list);
    await frames();
    expect(dotsIn(nested)).toEqual(["b1"]);
  });
});
