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
});
export type Link = z.infer<typeof LinkSchema>;

export const linksForAgent = defineRpc({
  name: "links.for-agent",
  input: z.object({ agentId: z.string() }),
  output: z.object({
    /** `transcript`: read from the provider's file; `timeline`: fetched from the daemon. */
    source: z.enum(["transcript", "timeline", "none"]),
    /** Newest mention first, one row per link. */
    links: z.array(LinkSchema),
  }),
});
