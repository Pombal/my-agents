import { describe, expect, it } from "vitest";
import { sessionRootsFromProviders, transcriptFile } from "./list";

describe("sessionRootsFromProviders", () => {
  it("maps omp and profile-based omp providers to their session folders", () => {
    // Shape of Stefan's ~/.paseo/config.json agents.providers (2026-10-19).
    const roots = sessionRootsFromProviders(
      {
        claude: { enabled: true },
        "omp-nilo": { extends: "omp", env: { OMP_PROFILE: "nilo", PI_CONFIG_FILES: "/x.yml" } },
        omp: { env: { PI_CONFIG_FILES: "/x.yml" }, enabled: true },
        grok: { extends: "acp", command: ["grok"] },
      },
      "/home/cx",
    );
    expect(roots).toEqual([
      { dir: "/home/cx/.omp/agent/sessions", provider: "omp" },
      { dir: "/home/cx/.omp/profiles/nilo/agent/sessions", provider: "omp-nilo" },
    ]);
  });

  it("keeps the built-in omp folder without config and skips disabled providers", () => {
    expect(sessionRootsFromProviders({}, "/h")).toEqual([{ dir: "/h/.omp/agent/sessions", provider: "omp" }]);
    expect(
      sessionRootsFromProviders({ omp: { enabled: false }, "omp-b": { extends: "omp" } }, "/h"),
    ).toEqual([{ dir: "/h/.omp/agent/sessions", provider: "omp-b" }]);
  });
});

describe("transcriptFile", () => {
  it("uses OMP's file handle and derives Claude Code's project file; Codex has none", () => {
    const omp = "/home/cx/.omp/agent/sessions/-agentspace-index/2026-10-17_01a1.jsonl";
    expect(transcriptFile({ provider: "omp", sessionId: "01a1", nativeHandle: omp }, "/x", "/home/cx")).toBe(omp);
    // Claude Code replaces every non-alphanumeric in the cwd, e.g. ~/.paseo/plugin-data → -home-cx--paseo-plugin-data.
    expect(
      transcriptFile({ provider: "claude", sessionId: "015e", nativeHandle: "015e" }, "/home/cx/.paseo/plugin_data", "/home/cx"),
    ).toBe("/home/cx/.claude/projects/-home-cx--paseo-plugin-data/015e.jsonl");
    expect(transcriptFile({ provider: "codex", sessionId: "01a14", nativeHandle: "01a14" }, "/x", "/home/cx")).toBeNull();
    expect(transcriptFile(null, "/x", "/home/cx")).toBeNull();
  });
});
