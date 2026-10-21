import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * What a click does: `web` and `image` open `url` in the browser, `file` copies `copy`.
 * Webshare paths are `web`/`image` with their http://axalon:8080 URL.
 */
export const LinkKindSchema = z.enum(["web", "image", "file"]);
export type LinkKind = z.infer<typeof LinkKindSchema>;

export const LinkSchema = z.object({
  /** Dedupe key: a normalized URL, or `file:` + absolute path. */
  key: z.string(),
  kind: LinkKindSchema,
  /** Markdown link text or image alt; else the file name or the URL's last path segment. */
  title: z.string(),
  /** Muted: the host, or the folder shortened to `~/…/a/b`. */
  where: z.string(),
  /** Lucide icon name for the row. */
  glyph: z.string(),
  /** web/image: what opens. */
  url: z.string().optional(),
  /** file: the absolute path plus the newest `:line` suffix seen. */
  copy: z.string().optional(),
  /** Epoch ms of the newest message that mentioned it. */
  lastAt: z.number(),
  /** Sub-agent links only: the sub-agent whose message mentioned it last. */
  via: z.string().optional(),
  /** A local path (or webshare file) that no longer exists on the daemon machine. */
  missing: z.boolean().optional(),
  /** The newest mention's sentence as plain text, about 120 characters. */
  snippet: z.string().optional(),
});
export type Link = z.infer<typeof LinkSchema>;

export const linksForAgent = defineRpc({
  name: "links.for-agent",
  /** `subagents`: also list what the chat's sub-agents mentioned (costlier; the popover asks, the pill doesn't). */
  input: z.object({ agentId: z.string(), subagents: z.boolean().optional() }),
  output: z.object({
    /** `transcript`: read from the provider's file; `timeline`: fetched from the daemon. */
    source: z.enum(["transcript", "timeline", "none"]),
    /** Newest mention first, one row per link. */
    links: z.array(LinkSchema),
    /** Asked for only: links the sub-agents mentioned and this chat didn't, newest first, each with `via`. */
    subagentLinks: z.array(LinkSchema).optional(),
  }),
});

/** One tab (root agent) of a workspace and the links its chat mentioned. */
export const WorkspaceTabSchema = z.object({
  agentId: z.string(),
  /** The agent's title, else the first 8 characters of its id. */
  title: z.string(),
  /** Provider id (`omp`, `claude`, `omp-nilo` …), for the tab's provider mark. */
  provider: z.string(),
  /** A closed (archived) tab. */
  closed: z.boolean(),
  /** The tab's own links, newest first. */
  links: z.array(LinkSchema),
  /** Asked for only: links its sub-agents mentioned and the tab didn't, newest first, each with `via`. */
  subagentLinks: z.array(LinkSchema).optional(),
});
export type WorkspaceTab = z.infer<typeof WorkspaceTabSchema>;

export const linksForWorkspace = defineRpc({
  name: "links.for-workspace",
  /** `subagents`: also each tab's sub-agent links (the links page asks, the header button doesn't). */
  input: z.object({ workspaceId: z.string(), subagents: z.boolean().optional() }),
  output: z.object({
    /** The workspace's root agents, closed ones included; sub-agents are folded into their root. */
    tabs: z.array(WorkspaceTabSchema),
  }),
});
