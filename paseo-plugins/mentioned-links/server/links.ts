import { statSync } from "node:fs";
import path from "node:path";
import type { Link } from "../shared/links";
import { extractMentions, type Mention } from "./extract";

/** Stefan's webshare: `~/www/webshare/X` is served at `http://axalon:8080/X` (skill `webshare`). */
export interface Site {
  home: string;
  webshareDir: string;
  webshareOrigin: string;
}

export function siteFor(home: string): Site {
  return { home, webshareDir: path.join(home, "www", "webshare"), webshareOrigin: "http://axalon:8080" };
}

/** A message's prose as one transcript record or timeline row gives it. */
export interface Prose {
  role: "user" | "assistant";
  text: string;
  /** Epoch ms. */
  at: number;
}

/** A link plus what merging needs: whether the title came from the message, and a file's path and line. */
interface Entry extends Omit<Link, "copy"> {
  titled: boolean;
  file?: string;
  line?: string;
}

/** Links of one chat by dedupe key. */
export type LinkMap = Map<string, Entry>;

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico|heic)$/i;
const CODE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml|toml|sh|py|rs|go|css|html?|lua|sql)$/i;
const TEXT_EXT = /\.(?:md|txt|jsonl|log|csv)$/i;

/** `~/…/a/b` once a folder is longer than the row can show. */
export function shortDir(dir: string, home: string): string {
  const shown = dir === home || dir.startsWith(`${home}/`) ? `~${dir.slice(home.length)}` : dir;
  if (shown.length <= 34) return shown;
  const parts = shown.split("/");
  return `${shown.startsWith("~") ? "~/…/" : "…/"}${parts.slice(-2).join("/")}`;
}

/** Scheme + host lowercased, no trailing `/`, no fragment. */
function urlKey(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}${url.search}`;
}

/** The last path segment (`pull/12` for numeric ones), else the host. */
function urlTitle(url: URL): string {
  const segments = url.pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  const last = segments.at(-1);
  if (!last) return url.host;
  return /^\d+$/.test(last) && segments.length > 1 ? `${segments.at(-2)}/${last}` : last;
}

function isDirectory(file: string): boolean {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

/** What a mention is in the popover: web/image (opens a URL) or file (copies the path). */
export function classify(mention: Mention, site: Site): Omit<Entry, "lastAt"> | null {
  if (mention.kind === "url") {
    let url: URL;
    try {
      url = new URL(mention.target);
    } catch {
      return null;
    }
    const image = IMAGE_EXT.test(url.pathname);
    return {
      key: urlKey(url),
      kind: image ? "image" : "web",
      title: mention.title ?? urlTitle(url),
      titled: !!mention.title,
      where: url.host,
      glyph: image ? "Image" : url.origin === site.webshareOrigin ? "AppWindow" : "Globe",
      url: url.href,
    };
  }
  const file = mention.target;
  const dir = mention.dirHint || isDirectory(file);
  const name = `${path.posix.basename(file)}${dir ? "/" : ""}`;
  const where = shortDir(path.posix.dirname(file), site.home);
  if (file === site.webshareDir || file.startsWith(`${site.webshareDir}/`)) {
    const url = new URL(`${site.webshareOrigin}${encodeURI(file.slice(site.webshareDir.length) || "/")}${dir && file !== site.webshareDir ? "/" : ""}`);
    const image = IMAGE_EXT.test(file);
    return {
      key: urlKey(url),
      kind: image ? "image" : "web",
      title: mention.title ?? name,
      titled: !!mention.title,
      where,
      glyph: image ? "Image" : "AppWindow",
      url: url.href,
    };
  }
  return {
    key: `file:${file}`,
    kind: "file",
    title: mention.title ?? name,
    titled: !!mention.title,
    where,
    file,
    ...(mention.line ? { line: mention.line } : {}),
    glyph: dir ? "Folder" : IMAGE_EXT.test(file) ? "Image" : CODE_EXT.test(file) ? "FileCode" : TEXT_EXT.test(file) ? "FileText" : "File",
  };
}

/**
 * Folds one mention in: the newest mention sets the row (where, URL, time); a title from link
 * text beats a derived one; a file keeps the newest `:line` seen.
 */
export function merge(links: LinkMap, link: Omit<Entry, "lastAt">, at: number): void {
  const prev = links.get(link.key);
  if (!prev) {
    links.set(link.key, { ...link, lastAt: at });
    return;
  }
  const [newer, older] = at >= prev.lastAt ? [{ ...link, lastAt: at }, prev] : [prev, link];
  const titleFrom = !newer.titled && older.titled ? older : newer;
  links.set(link.key, {
    ...newer,
    title: titleFrom.title,
    titled: titleFrom.titled,
    ...(newer.line ?? older.line ? { line: newer.line ?? older.line } : {}),
  });
}

export function addProse(links: LinkMap, prose: Prose, site: Site): void {
  const exists = (file: string) => {
    try {
      statSync(file);
      return true;
    } catch {
      return false;
    }
  };
  for (const mention of extractMentions(prose.text, prose.role, { home: site.home, exists })) {
    const link = classify(mention, site);
    if (link) merge(links, link, prose.at);
  }
}

/** Newest first, as the popover shows them. */
export function listLinks(links: LinkMap): Link[] {
  return [...links.values()]
    .sort((a, b) => b.lastAt - a.lastAt)
    .map(({ titled: _titled, file, line, ...link }) => (file ? { ...link, copy: `${file}${line ?? ""}` } : link));
}

/**
 * What the chat's sub-agents add: their links whose key the chat itself never mentioned, one row
 * per link, marked `via` the sub-agent that mentioned it last. Newest first.
 */
export function subagentLinks(chat: LinkMap, subagents: readonly { name: string; links: LinkMap }[]): Link[] {
  const added = new Map<string, Link>();
  for (const subagent of subagents) {
    for (const link of listLinks(subagent.links)) {
      if (chat.has(link.key)) continue;
      const prev = added.get(link.key);
      if (!prev || link.lastAt > prev.lastAt) added.set(link.key, { ...link, via: subagent.name });
    }
  }
  return [...added.values()].sort((a, b) => b.lastAt - a.lastAt);
}
