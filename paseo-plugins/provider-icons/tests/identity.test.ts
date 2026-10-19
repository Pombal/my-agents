import { expect, test } from "bun:test";
import { resolveHost, resolveProvider } from "../shared/identity";

const agents = new Map([["agent-1", "omp-nilo"], ["agent-2", "claude"]]);
const labels = new Map([["Oh My Pi (nilo)", "omp-nilo"]]);

test("finds provider glyph owners across model, settings, history, and subagent surfaces", () => {
  for (const scope of [{ provider: "omp-nilo", size: 16 }, { def: { id: "omp-nilo" } }, { agent: { provider: "omp-nilo" } }, { entry: { providerId: "omp-nilo" } }, { row: { provider: "omp-nilo" } }, { iconKey: "omp-nilo" }]) expect(resolveProvider([scope], agents, labels)).toBe("omp-nilo");
});
test("distinguishes identical fallback Bot icons in different agent tabs", () => {
  expect(resolveProvider([{ tab: { target: { kind: "agent", agentId: "agent-1" } } }], agents, labels)).toBe("omp-nilo");
  expect(resolveProvider([{ tab: { target: { kind: "agent", agentId: "agent-2" } } }], agents, labels)).toBe("claude");
  expect(resolveProvider([{ tab: { target: { kind: "agent", agentId: "unknown" } } }], agents, labels)).toBeUndefined();
  expect(resolveProvider([{ tab: { target: { kind: "terminal", agentId: "agent-1" } } }], agents, labels)).toBeUndefined();
});
test("nearest provider beats an enclosing selected-provider context", () => {
  expect(resolveProvider([{ provider: "claude" }, { selectedProvider: "omp-nilo" }], agents, labels)).toBe("claude");
});
test("recognizes model-command and catalog ids, including model ids containing colons", () => {
  expect(resolveProvider([{ testID: "command-center-model-srv_1:omp-nilo:model:variant" }], agents, labels)).toBe("omp-nilo");
  expect(resolveProvider([{ testID: "provider-catalog-tile-custom-provider" }], agents, labels)).toBe("custom-provider");
  expect(resolveProvider([{ testID: "command-center-thinking-srv_1:omp-nilo:high" }], agents, labels)).toBeUndefined();
});
test("only resolves an exact known provider label in an explicit leading icon slot", () => {
  expect(resolveProvider([{ label: "Oh My Pi (nilo)", leadingSlot: {} }], agents, labels)).toBe("omp-nilo");
  expect(resolveProvider([{ label: "Oh My Pi (nilo)" }], agents, labels)).toBeUndefined();
  expect(resolveProvider([{ label: "Oh My Pi (nilo) extra", leadingSlot: {} }], agents, labels)).toBeUndefined();
});
test("resolves draft and provider-native subagent tabs without touching terminal tabs", () => {
  expect(resolveProvider([{ tab: { target: { kind: "provider_subagent", parentAgentId: "agent-1" } } }], agents, labels)).toBe("omp-nilo");
  expect(resolveProvider([{ tab: { target: { kind: "draft", setup: { provider: "claude" } } } }], agents, labels)).toBe("claude");
  expect(resolveProvider([{ tab: { target: { kind: "terminal", parentAgentId: "agent-1" } } }], agents, labels)).toBeUndefined();
});
test("resolves the import filter trigger but ignores the same label on unrelated controls", () => {
  expect(resolveProvider([{ testID: "import-session-filter-trigger", accessibilityLabel: "Filter: Oh My Pi (nilo)" }], agents, labels)).toBe("omp-nilo");
  expect(resolveProvider([{ testID: "other-filter", accessibilityLabel: "Filter: Oh My Pi (nilo)" }], agents, labels)).toBeUndefined();
});
test("host identity comes from the glyph owner before route fallback", () => {
  expect(resolveHost([{ serverId: "other-host" }], "/h/this-host/workspace/w")).toBe("other-host");
  expect(resolveHost([{}], "/settings/hosts/this-host/providers")).toBe("this-host");
  expect(resolveHost([{}], "/h/this-host/workspace/w")).toBe("this-host");
  expect(resolveHost([{}], "/open-project")).toBeUndefined();
});
