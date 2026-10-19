import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** `workspace`: this workspace's archived agents; `folder`: its folder; `project`: the whole project. */
export const ScopeSchema = z.enum(["workspace", "folder", "project"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const PastSessionSchema = z.object({
  /** Stable list key: `paseo:<agentId>`, `omp:<sessionId>` or `ext:<provider>:<sessionId>`. */
  key: z.string(),
  /**
   * `paseo`: archived Paseo agent. `omp`: OMP session file never opened in Paseo (file scan).
   * `external`: another provider's session never opened in Paseo (Claude Code, Codex), listed by
   * the daemon on request.
   */
  source: z.enum(["paseo", "omp", "external"]),
  title: z.string(),
  cwd: z.string(),
  /** Last activity, ISO timestamp. Entries are sorted by this, newest first. */
  at: z.string(),
  provider: z.string(),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  /** OMP session file, or the transcript an archived agent or Claude Code session was read from. */
  file: z.string().optional(),
  /** A `paseo-recap` summary, else the last assistant reply as plain text; null when neither exists. */
  preview: z.object({ kind: z.enum(["recap", "reply"]), text: z.string() }).nullable(),
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

export const ExternalProviderSchema = z.enum(["claude", "codex"]);

/** Claude Code and Codex sessions never opened in Paseo, for the Folder and Project scopes. */
export const listExternalSessions = defineRpc({
  name: "past-sessions.external",
  input: z.object({
    workspaceId: z.string(),
    scope: z.enum(["folder", "project"]),
    /** Ask the daemon again instead of using the plugin's cached listing. */
    refresh: z.boolean(),
  }),
  output: z.object({
    entries: z.array(PastSessionSchema),
    providers: z.array(ExternalProviderSchema),
    /** When the cached daemon listing was taken. */
    fetchedAt: z.string(),
    elapsedMs: z.number(),
    warnings: z.array(z.string()),
  }),
});

export type ExternalSessionsListing = z.output<typeof listExternalSessions.output>;

export const reopenPastSession = defineRpc({
  name: "past-sessions.reopen",
  input: z.discriminatedUnion("source", [
    z.object({ source: z.literal("paseo"), agentId: z.string() }),
    z.object({
      source: z.literal("import"),
      provider: z.string(),
      cwd: z.string(),
      /** What `paseo import` takes: the OMP session file, or the provider's session id. */
      handle: z.string(),
    }),
  ]),
  output: z.object({ agentId: z.string() }),
});
