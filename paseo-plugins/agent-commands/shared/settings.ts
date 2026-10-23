import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Everything is off by default: only `.agents/commands` (project, then `~`) is read, the list is
 * one alphabetical run, and the `/` menu is left alone.
 * A new field with a default needs no version bump: older documents parse unchanged.
 */
export const settings = defineSettings({
  id: "commands",
  scope: "host",
  version: 1,
  schema: z.object({
    /** `.claude/commands` in the project and `~/.claude/commands`. */
    claude: z.boolean().default(false),
    /** `.cursor/commands` in the project and `~/.cursor/commands`. */
    cursor: z.boolean().default(false),
    /** `.omp/commands` in the project and `~/.omp/agent/commands`. */
    omp: z.boolean().default(false),
    /** `~/.codex/prompts`. */
    codex: z.boolean().default(false),
    /** "Project" and "User" headings in the list. */
    groups: z.boolean().default(false),
    /** Each command also as a plugin slash command: `/name args` sends the expanded file. */
    slashMenu: z.boolean().default(false),
  }),
});
export type Settings = z.output<typeof settings.schema>;
export const DEFAULTS: Settings = settings.schema.parse({});
