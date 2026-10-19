import { describe, expect, test } from "bun:test";
import { hostFromPath, hostFromScopes, ownerFromTestId, providerFromScopes } from "../shared/identity";

const NILO_AGENT = "22291c4d-d81d-4f81-b611-59e3f7ff5543";
const CLAUDE_AGENT = "12239e3f-0419-4b11-9214-74e1ce6673af";
const directory = {
  agents: new Map([[NILO_AGENT, "omp-nilo"], [CLAUDE_AGENT, "claude"]]),
  providers: new Set(["claude", "omp", "omp-nilo"]),
  labels: new Map([["Oh My Pi (nilo)", "omp-nilo"], ["Oh My Pi", "omp"]]),
};

// Test ids below are copied from the live Paseo 0.12.0 web app (app.paseo.sh), 2026-10-19.
describe("tier 1: data-testid owners", () => {
  test("agent tabs resolve through the agent's exact provider, so identical Bot glyphs differ", () => {
    expect(ownerFromTestId(`workspace-tab-agent_${NILO_AGENT}`, directory)).toEqual({ provider: "omp-nilo", host: undefined });
    expect(ownerFromTestId(`workspace-tab-agent_${CLAUDE_AGENT}`, directory)?.provider).toBe("claude");
    expect(ownerFromTestId("workspace-tab-agent_00000000-0000-0000-0000-000000000000", directory)).toBeUndefined();
    expect(ownerFromTestId("workspace-tab-terminal_f1826bf9-b489-46e2-aee8-49c289e9bb69", directory)).toBeUndefined();
  });
  test("history rows carry their host, which matters on host-less routes like /sessions", () => {
    expect(ownerFromTestId(`agent-row-srv_uD_D9G5KCzqY-${NILO_AGENT}`, directory)).toEqual({ provider: "omp-nilo", host: "srv_uD_D9G5KCzqY" });
  });
  test("model rows pick the longest provider id prefix: omp-nilo is not omp", () => {
    expect(ownerFromTestId("model-row-omp-nilo-anthropic/claude-fable-5.1", directory)?.provider).toBe("omp-nilo");
    expect(ownerFromTestId("model-row-omp-anthropic/claude-fable-5.1", directory)?.provider).toBe("omp");
    expect(ownerFromTestId("model-row-unknown-model", directory)).toBeUndefined();
  });
  test("picker provider rows require a provider the daemon knows", () => {
    expect(ownerFromTestId("model-provider-omp-nilo", directory)?.provider).toBe("omp-nilo");
    expect(ownerFromTestId("model-provider-search", directory)).toBeUndefined();
  });
  test("command-center model choices carry host and provider, including model ids with colons", () => {
    expect(ownerFromTestId("command-center-model-srv_1:omp-nilo:model:variant", directory)).toEqual({ provider: "omp-nilo", host: "srv_1" });
    expect(ownerFromTestId("command-center-thinking-srv_1:omp-nilo:high", directory)).toBeUndefined();
  });
  test("catalog tiles and the import filter trigger", () => {
    expect(ownerFromTestId("provider-catalog-tile-goose", directory)?.provider).toBe("goose");
    expect(ownerFromTestId("import-session-filter-trigger", directory, "Filter: Oh My Pi (nilo)")?.provider).toBe("omp-nilo");
    expect(ownerFromTestId("import-session-filter-trigger", directory, "Filter: All providers")).toBeUndefined();
    expect(ownerFromTestId("other-filter", directory, "Filter: Oh My Pi (nilo)")).toBeUndefined();
  });
  test("containers that merely hold glyphs are not owners", () => {
    for (const id of ["combined-model-selector", "host-page-providers-card", "subagents-track-row-PrAuditOpus", "tool-call-badge", "settings-host-section-agents"]) {
      expect(ownerFromTestId(id, directory)).toBeUndefined();
    }
  });
});

describe("tier 2: component props", () => {
  test("each provider-icon consumer's prop shape resolves", () => {
    // model-browser/schedules, terminal profiles, settings rows, agent list, import rows, sub-agent rows.
    for (const scope of [{ provider: "omp-nilo" }, { iconKey: "omp-nilo" }, { def: { id: "omp-nilo" } }, { agent: { provider: "omp-nilo" } }, { entry: { providerId: "omp-nilo" } }, { row: { provider: "omp-nilo" } }]) {
      expect(providerFromScopes([scope], directory)).toBe("omp-nilo");
    }
  });
  test("tab targets: agent, provider-native sub-agent via its parent, draft setup; never terminals", () => {
    expect(providerFromScopes([{ tab: { target: { kind: "agent", agentId: CLAUDE_AGENT } } }], directory)).toBe("claude");
    expect(providerFromScopes([{ item: { target: { kind: "provider_subagent", parentAgentId: NILO_AGENT } } }], directory)).toBe("omp-nilo");
    expect(providerFromScopes([{ tab: { target: { kind: "draft", setup: { provider: "claude" } } } }], directory)).toBe("claude");
    expect(providerFromScopes([{ tab: { target: { kind: "terminal", agentId: NILO_AGENT } } }], directory)).toBeUndefined();
  });
  test("the nearest owner wins over an enclosing selection", () => {
    expect(providerFromScopes([{ size: 16 } as object, { provider: "claude" }, { selectedProvider: "omp-nilo" }], directory)).toBe("claude");
  });
  test("labels count only in an icon slot and only when they are an exact provider label", () => {
    expect(providerFromScopes([{ label: "Oh My Pi (nilo)", leadingSlot: {} }], directory)).toBe("omp-nilo");
    expect(providerFromScopes([{ label: "Oh My Pi (nilo)" }], directory)).toBeUndefined();
    expect(providerFromScopes([{ label: "Checks passed", leadingSlot: {} }], directory)).toBeUndefined();
  });
  test("non-string props are ignored rather than coerced", () => {
    expect(providerFromScopes([{ provider: { id: "omp-nilo" } }, { provider: "" }], directory)).toBeUndefined();
  });
});

describe("host ownership", () => {
  test("glyph owner's serverId, then an agent's serverId, then the route", () => {
    expect(hostFromScopes([{}, { serverId: "other-host" }])).toBe("other-host");
    expect(hostFromScopes([{ agent: { provider: "claude", serverId: "srv_a" } }])).toBe("srv_a");
    expect(hostFromScopes([{ provider: "claude" }])).toBeUndefined();
    expect(hostFromPath("/settings/hosts/this-host/providers")).toBe("this-host");
    expect(hostFromPath("/h/this-host/workspace/w")).toBe("this-host");
    expect(hostFromPath("/sessions")).toBeUndefined();
  });
});
