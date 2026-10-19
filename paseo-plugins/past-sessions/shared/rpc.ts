import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** `workspace`: this workspace's archived agents; `folder`: its folder; `project`: the whole project. */
export const ScopeSchema = z.enum(["workspace", "folder", "project"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const PastSessionSchema = z.object({
  /** Stable list key: `paseo:<agentId>` or `omp:<sessionId>`. */
  key: z.string(),
  source: z.enum(["paseo", "omp"]),
  title: z.string(),
  cwd: z.string(),
  /** Last activity, ISO timestamp. Entries are sorted by this, newest first. */
  at: z.string(),
  provider: z.string(),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  file: z.string().optional(),
});
export type PastSession = z.infer<typeof PastSessionSchema>;

export const listPastSessions = defineRpc({
  name: "past-sessions.list",
  input: z.object({ workspaceId: z.string(), scope: ScopeSchema }),
  output: z.object({
    workspaceName: z.string(),
    /** The daemon user's home, so paths can be shown as `~/…`. */
    home: z.string(),
    folder: z.string(),
    projectRoot: z.string(),
    projectName: z.string(),
    scope: ScopeSchema,
    /** The main list, newest first. */
    entries: z.array(PastSessionSchema),
    /** Workspace scope only: OMP sessions in the folder that Paseo never opened. */
    sameFolder: z.array(PastSessionSchema),
    stats: z.object({
      elapsedMs: z.number(),
      ompDirsScanned: z.number(),
      ompFilesSeen: z.number(),
      ompFilesRead: z.number(),
      hiddenKnownToPaseo: z.number(),
    }),
    warnings: z.array(z.string()),
  }),
});

export type PastSessionsListing = z.output<typeof listPastSessions.output>;

export const reopenPastSession = defineRpc({
  name: "past-sessions.reopen",
  input: z.discriminatedUnion("source", [
    z.object({ source: z.literal("paseo"), agentId: z.string() }),
    z.object({
      source: z.literal("omp"),
      file: z.string(),
      cwd: z.string(),
      provider: z.string(),
    }),
  ]),
  output: z.object({ agentId: z.string() }),
});
