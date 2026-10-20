import { describe, expect, it, vi } from "vitest";
import { ompConfigCommand, parseOmpFlags, resolveProviders } from "./omp-flags";

const listed = (settings: Record<string, boolean>) =>
  JSON.stringify(Object.fromEntries(Object.entries(settings).map(([key, value]) => [`magicKeywords.${key}`, { value, type: "boolean" }])));

describe("resolveProviders", () => {
  it("roots derived providers at their base and built-ins and unknown bases at themselves", () => {
    const { roots } = resolveProviders({
      omp: { command: ["/bin/omp"] },
      "omp-nilo": { extends: "omp", env: { OMP_PROFILE: "nilo" } },
      deep: { extends: "omp-nilo" },
      claude: {},
      zai: { extends: "claude" },
      cursor: { extends: "acp", command: ["cursor-agent", "acp"] },
    });
    expect(roots).toEqual({ omp: "omp", "omp-nilo": "omp", deep: "omp", claude: "claude", zai: "claude", cursor: "acp" });
  });

  it("finds OMP providers whose chain ends at a built-in omp missing from the config", () => {
    const { roots, omp } = resolveProviders({ nilo: { extends: "omp", env: { OMP_PROFILE: "nilo" } } });
    expect(roots).toEqual({ nilo: "omp" });
    expect(omp).toEqual([{ id: "nilo", chain: [{ extends: "omp", env: { OMP_PROFILE: "nilo" } }] }]);
  });

  it("lists chains base first, so the derived entry comes last", () => {
    const { omp } = resolveProviders({ "omp-nilo": { extends: "omp", command: ["b"] }, omp: { command: ["a"] } });
    expect(omp.map(({ id, chain }) => [id, chain.map((entry) => entry.command?.[0])])).toEqual([
      ["omp-nilo", ["a", "b"]],
      ["omp", ["a"]],
    ]);
  });

  it("skips disabled providers but still reports their root", () => {
    const { roots, omp } = resolveProviders({ omp: { enabled: false }, "omp-nilo": { extends: "omp" } });
    expect(roots).toEqual({ omp: "omp", "omp-nilo": "omp" });
    expect(omp.map(({ id }) => id)).toEqual(["omp-nilo"]);
  });

  it("maps providers in an extends loop to themselves and never treats them as OMP", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { roots, omp } = resolveProviders({ a: { extends: "b" }, b: { extends: "a" }, c: { extends: "c" }, d: { extends: "a" }, omp: {} });
    expect(roots).toEqual({ a: "a", b: "b", c: "c", d: "d", omp: "omp" });
    expect(omp.map(({ id }) => id)).toEqual(["omp"]);
    expect(error).toHaveBeenCalledTimes(4);
    error.mockRestore();
  });
});

describe("ompConfigCommand", () => {
  it("keeps the configured argv and appends the config call", () => {
    const { file, args } = ompConfigCommand([{ command: ["/usr/bin/env", "OMP_X=1", "omp"] }], {});
    expect(file).toBe("/usr/bin/env");
    expect(args).toEqual(["OMP_X=1", "omp", "config", "list", "--json"]);
  });

  it("uses the nearest command along the chain", () => {
    expect(ompConfigCommand([{ command: ["base-omp"] }, { command: ["derived-omp"] }], {}).file).toBe("derived-omp");
    expect(ompConfigCommand([{ command: ["base-omp"] }, { env: { A: "1" } }], {}).file).toBe("base-omp");
  });

  it("falls back to $OMP_COMMAND, then omp, when no provider sets a command", () => {
    expect(ompConfigCommand([{ extends: "omp" }], { OMP_COMMAND: "/opt/omp" })).toMatchObject({ file: "/opt/omp", args: ["config", "list", "--json"] });
    expect(ompConfigCommand([], {}).file).toBe("omp");
  });

  it("layers env as process, then base, then derived", () => {
    const { env } = ompConfigCommand(
      [{ env: { PATH: "/base", OMP_PROFILE: "base", BASE_ONLY: "b" } }, { env: { OMP_PROFILE: "nilo" } }],
      { PATH: "/usr/bin", HOME: "/home/x", OMP_PROFILE: "process" },
    );
    expect(env).toEqual({ PATH: "/base", HOME: "/home/x", OMP_PROFILE: "nilo", BASE_ONLY: "b" });
  });
});

describe("parseOmpFlags", () => {
  it("drops words OMP disabled and maps the workflow setting to workflowz", () => {
    expect(parseOmpFlags(listed({ enabled: true, ultrathink: true, orchestrate: false, workflow: true, jevify: true }))).toEqual([
      "ultrathink",
      "workflowz",
      "jevify",
    ]);
    expect(parseOmpFlags(listed({ enabled: true, workflow: false }))).toEqual(["ultrathink", "orchestrate", "jevify"]);
  });

  it("returns no words when magic keywords are off as a whole", () => {
    expect(parseOmpFlags(listed({ enabled: false, ultrathink: true, orchestrate: true, workflow: true, jevify: true }))).toEqual([]);
  });

  it("returns null when OMP reports none of the magic-keyword settings", () => {
    expect(parseOmpFlags(JSON.stringify({ "theme.name": { value: "dark" }, "magicKeywords.ultrathink": { value: "yes" } }))).toBeNull();
  });

  it("throws on output that is not a JSON object, so the caller marks the provider failed", () => {
    expect(() => parseOmpFlags("omp: unknown command")).toThrow();
    expect(() => parseOmpFlags("[]")).toThrow();
  });
});
