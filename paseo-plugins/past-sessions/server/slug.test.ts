import { describe, expect, it } from "vitest";
import { ompDirNames, subtreeDirMatcher } from "./slug";

// Expected names are real directories under ~/.omp/agent/sessions on axalon.
const roots = { home: "/home/cx", tmp: "/tmp" };

describe("ompDirNames", () => {
  it("encodes folders under home relative to home", () => {
    expect(ompDirNames("/home/cx/agentspace/index", roots).current).toBe("-agentspace-index");
    expect(ompDirNames("/home/cx/.herdr/worktrees/nilo/pr-10438", roots).current).toBe(
      "-.herdr-worktrees-nilo-pr-10438",
    );
    expect(ompDirNames("/home/cx", roots).current).toBe("-");
  });

  it("wraps folders outside home in double dashes and keeps spaces", () => {
    expect(ompDirNames("/mnt/obsidian-vault/Infra - Ofis", roots).current).toBe(
      "--mnt-obsidian-vault-Infra - Ofis--",
    );
  });

  it("encodes the temp dir before home, so /tmp/x and ~/tmp/x can share a name", () => {
    expect(ompDirNames("/tmp/paseo-side-full-spike", roots).current).toBe("-tmp-paseo-side-full-spike");
    expect(ompDirNames("/home/cx/tmp", roots).current).toBe("-tmp");
    expect(ompDirNames("/tmp", roots).current).toBe("-tmp");
  });

  it("lists the legacy hashed name OMP has not migrated yet", () => {
    const names = ompDirNames("/home/cx/.herdr/worktrees/nilo/design-token-overhaul", roots).all;
    expect(names).toContain(
      "home-design-token-overhaul-5d4f2f85513b13be342c2403b0e3ecf912894d16746322647355f48f25f55a04",
    );
    expect(ompDirNames("/home/cx/workspace/nilo-copy-2", roots).all).toContain(
      "home-nilo-copy-2-d35df0fda98eb7954f2c7208bccec64895fb89106e826079fb62a2f95d007af3",
    );
  });

  it("lists the legacy absolute name for home folders", () => {
    expect(ompDirNames("/home/cx/agentspace/index", roots).all).toContain("--home-cx-agentspace-index--");
  });
});

describe("subtreeDirMatcher", () => {
  const underIndex = subtreeDirMatcher(["/home/cx/agentspace/index"], roots);
  const underVault = subtreeDirMatcher(["/mnt/obsidian-vault"], roots);

  it("accepts the folder itself and folders below it", () => {
    expect(underIndex("-agentspace-index")).toBe(true);
    expect(underIndex("-agentspace-index-.scratch-glossary-shadow")).toBe(true);
    expect(underVault("--mnt-obsidian-vault-Clawlikes--")).toBe(true);
  });

  it("rejects siblings whose names only share a prefix without a separator", () => {
    expect(underIndex("-agentspace-indexer")).toBe(false);
    expect(underIndex("-agentspace-hub")).toBe(false);
    expect(underVault("--mnt-obsidian-vaults--")).toBe(false);
  });

  it("matches any of several roots, e.g. a repo and its worktrees", () => {
    const nilo = subtreeDirMatcher(["/home/cx/workspace/nilo", "/home/cx/.herdr/worktrees/nilo/pr-10438"], roots);
    expect(nilo("-workspace-nilo-worktrees-pr-8810-review")).toBe(true);
    expect(nilo("-.herdr-worktrees-nilo-pr-10438")).toBe(true);
    expect(nilo("-.herdr-worktrees-nilo-pr-10454")).toBe(false);
  });

  it("keeps hashed legacy names as candidates since their path is only in the files", () => {
    expect(
      underIndex("home-pwa-installable-c96411d2cdd110343e97635c7e2c47b7a78ba77121dee021107b7204c3b3d3a7"),
    ).toBe(true);
  });
});
