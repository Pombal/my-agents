import test from "node:test";
import assert from "node:assert/strict";
import * as labelHelpers from "@getpaseo/protocol/agent-labels";
import { isTab, readable } from "../shared/agent-titles.mjs";
import { exclusiveRuns } from "../shared/exclusive.mjs";

test("a side agent counts as a tab where Paseo shows it as one", () => {
  const parent = { id: "parent", workspaceId: "main", labels: {} };
  const agents = [
    parent,
    // Opened in a workspace of its own (Stefan's "Widgets" workspaces): a tab there.
    { id: "side", workspaceId: "widgets", labels: { "paseo.parent-agent-id": "parent" } },
    // A sub-agent inside its parent's workspace: not a tab.
    { id: "helper", workspaceId: "main", labels: { "paseo.parent-agent-id": "parent" } },
    // ...unless a client opened it as a tab.
    { id: "opened", workspaceId: "main", labels: { "paseo.parent-agent-id": "parent", [labelHelpers.getOpenAgentTabLabel("web-1")]: "true" } },
    // Its parent is gone: Paseo detaches it.
    { id: "orphan", workspaceId: "main", labels: { "paseo.parent-agent-id": "deleted" } },
    { id: "generator", workspaceId: "main", internal: true, labels: {} },
  ];
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  assert.deepEqual(agents.filter(agent => isTab(agent, byId, labelHelpers)).map(agent => agent.id), ["parent", "side", "opened", "orphan"]);
});

test("only loaded or archived agents have timelines that can be read without starting them", () => {
  assert.equal(readable({ capabilities: { supportsStreaming: true } }), true);
  assert.equal(readable({ capabilities: { supportsStreaming: false } }), false); // stored, would be resumed
  assert.equal(readable({ archivedAt: "2026-10-20T09:00:00Z", capabilities: { supportsStreaming: false } }), true);
});

const later = () => { let release; const gate = new Promise(resolve => { release = resolve; }); return { gate, release }; };

test("a manual retitle waits for an automatic check of the same tab, then runs", async () => {
  const { run } = exclusiveRuns("Already retitling this tab");
  const order = [];
  const automatic = later();
  const auto = run("tab", false, async () => { await automatic.gate; order.push("automatic"); return "kept"; });
  const manual = run("tab", true, async () => { order.push("manual"); return "renamed"; });
  automatic.release();
  assert.equal(await auto, "kept");
  assert.equal(await manual, "renamed");
  assert.deepEqual(order, ["automatic", "manual"]);
});

test("while a retitle runs, a second one is refused and an automatic check skipped", async () => {
  const { run, busy } = exclusiveRuns("Already retitling this tab");
  const first = later();
  const manual = run("tab", true, () => first.gate);
  assert.equal(busy("tab"), true);
  await assert.rejects(run("tab", true, async () => "again"), /Already retitling this tab/);
  assert.equal(await run("tab", false, async () => "automatic"), null);
  assert.equal(await run("other", true, async () => "other tab"), "other tab");
  first.release("done");
  assert.equal(await manual, "done");
  assert.equal(busy("tab"), false);
});
