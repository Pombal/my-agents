import { describe, expect, test } from "vitest";
import { compilePreset, presetsSchema, projectOnlyRule, ruleValueError, type Project } from "../shared/presets";

const project = (projectRootPath: string, projectKey?: string): Project => ({
  projectId: projectRootPath, projectRootPath, projectKey, projectDisplayName: projectRootPath.split("/").at(-1)!,
});

describe("Add to: this project only", () => {
  const vault = project("/mnt/obsidian-vault");
  const infra = project("/mnt/obsidian-vault/Infra - Ofis");
  const game = project("/home/cx/workspace/drimgar-game");
  const projects = [vault, infra, game];

  test("a project with another project inside its folder matches only itself", () => {
    const matches = compilePreset({ rules: [projectOnlyRule(vault, projects)] });
    expect(projects.filter(matches)).toEqual([vault]);
  });

  test("a project with nothing nested keeps the Inside folder rule", () => {
    expect(projectOnlyRule(game, projects)).toEqual({ type: "folderPrefix", value: game.projectRootPath });
    expect(projects.filter(compilePreset({ rules: [projectOnlyRule(infra, projects)] }))).toEqual([infra]);
  });

  test("a similarly named neighbour is not nested", () => {
    const neighbour = project("/mnt/obsidian-vault-2");
    expect(projectOnlyRule(vault, [vault, neighbour]).type).toBe("folderPrefix");
  });
});

describe("rules that could never match are rejected", () => {
  test.each([
    ["folderPrefix", "~/workspace/nilo"],
    ["folderPrefix", "workspace/nilo"],
    ["pathGlob", "~/workspace/nilo-*"],
  ] as const)("%s %s", (type, value) => {
    expect(ruleValueError(type, value)).toMatch(/absolute path/);
    expect(presetsSchema.safeParse([{ id: "nilo", name: "Nilo", rules: [{ type, value }] }]).success).toBe(false);
  });

  test("absolute paths stay valid", () => {
    expect(ruleValueError("folderPrefix", "/home/cx/workspace/nilo")).toBeUndefined();
    expect(ruleValueError("pathGlob", "/home/*/workspace/nilo-*")).toBeUndefined();
  });
});

describe("GitHub remote patterns ignore case", () => {
  // The daemon lower-cases GitHub owner/repo in project keys.
  const nilo = project("/home/cx/workspace/nilo", "remote:github.com/nilo-technologies/nilo");
  const gitlab = project("/home/cx/work/team", "remote:gitlab.com/Team/App");

  test.each(["Nilo-Technologies/*", "github.com/Nilo-Technologies/Nilo", "remote:GitHub.com/nilo-technologies/*"])("%s", (value) => {
    expect(compilePreset({ rules: [{ type: "remoteGlob", value }] })(nilo)).toBe(true);
  });

  test("other forges stay case-sensitive", () => {
    expect(compilePreset({ rules: [{ type: "remoteGlob", value: "gitlab.com/Team/*" }] })(gitlab)).toBe(true);
    expect(compilePreset({ rules: [{ type: "remoteGlob", value: "gitlab.com/team/*" }] })(gitlab)).toBe(false);
  });
});
