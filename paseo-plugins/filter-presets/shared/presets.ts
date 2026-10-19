import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const ruleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("folderPrefix"), value: z.string().min(1) }).strict(),
  z.object({ type: z.literal("pathGlob"), value: z.string().min(1) }).strict(),
  z.object({ type: z.literal("pathRegex"), value: z.string().min(1).refine((value) => {
    try { new RegExp(value); return true; } catch { return false; }
  }, "Invalid regular expression") }).strict(),
  z.object({ type: z.literal("remoteGlob"), value: z.string().min(1) }).strict(),
]);
export const presetsSchema = z.array(z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/).refine((id) => id !== "all" && id !== "other", "all and other are reserved"),
  name: z.string().trim().min(1),
  rules: z.array(ruleSchema).min(1),
}).strict()).refine((presets) => new Set(presets.map((preset) => preset.id)).size === presets.length, "Preset IDs must be unique");

export const defaultPresets = [{
  id: "nilo",
  name: "Nilo",
  rules: [
    { type: "remoteGlob" as const, value: "nilo-technologies/*" },
    { type: "pathRegex" as const, value: "^/home/cx/workspace/nilo(?:-[^/]+)?(?:/|$)" },
  ],
}];

export const preferences = defineSettings({
  id: "presets",
  scope: "host",
  version: 1,
  schema: z.object({ presets: presetsSchema.default(defaultPresets) }),
});
export type Preset = z.infer<typeof presetsSchema>[number];

export interface Project {
  projectId: string;
  projectKey?: string;
  projectRootPath: string;
  projectDisplayName: string;
}

// Globs are anchored, case-sensitive: * excludes /, ** includes /, ? is one non-/ character.
function glob(pattern: string): RegExp {
  let expression = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*" && pattern[i + 1] === "*") { expression += ".*"; i++; }
    else if (char === "*") expression += "[^/]*";
    else if (char === "?") expression += "[^/]";
    else expression += char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(expression + "$");
}

export function compilePreset(preset: Preset): (project: Project) => boolean {
  const rules = preset.rules.map((rule) => {
    if (rule.type === "folderPrefix") {
      const prefix = rule.value.replace(/\/+$/, "");
      return (project: Project) => project.projectRootPath === prefix || project.projectRootPath.startsWith(prefix + "/");
    }
    if (rule.type === "pathRegex") {
      const regex = new RegExp(rule.value);
      return (project: Project) => regex.test(project.projectRootPath);
    }
    if (rule.type === "pathGlob") {
      const regex = glob(rule.value);
      return (project: Project) => regex.test(project.projectRootPath);
    }
    const pattern = rule.value.replace(/^remote:/, "");
    const regex = glob(pattern);
    // org/repo patterns are GitHub shortcuts. Full host/org/repo patterns work on other forges.
    const githubShortcut = !pattern.split("/")[0].includes(".");
    return (project: Project) => {
      if (!project.projectKey?.startsWith("remote:")) return false;
      const remote = project.projectKey.slice(7).split("#subdir:")[0];
      return regex.test(githubShortcut ? remote.replace(/^github\.com\//, "") : remote);
    };
  });
  return (project) => rules.some((matches) => matches(project));
}
