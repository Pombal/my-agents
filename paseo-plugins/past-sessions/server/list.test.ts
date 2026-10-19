import { describe, expect, it } from "vitest";
import { sessionRootsFromProviders } from "./list";

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
