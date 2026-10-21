import type { Link, WorkspaceTab } from "../shared/links";
import { withSubagents } from "./store";

/** The links page's grouping (Settings menu → Grouping). */
export type Grouping = "flat" | "tab" | "site";

export const GROUPINGS: readonly { value: Grouping; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "tab", label: "By tab" },
  { value: "site", label: "By site" },
];

/** One row of the links page: a link as its newest mention has it and the tab that mentioned it last. */
export interface PageRow {
  link: Link;
  tab: WorkspaceTab;
  /** How many other tabs mention it too (Flat and By site only; 0 in By tab). */
  others: number;
}

export interface PageGroup {
  key: string;
  title: string;
  rows: PageRow[];
  /** By tab: the group's tab. */
  tab?: WorkspaceTab;
}

/**
 * Flat: one row per link across the workspace's tabs, newest mention first. A link several tabs
 * mention names the tab that mentioned it last and counts the others.
 */
export function flatRows(tabs: readonly WorkspaceTab[], subagentsShown: boolean): PageRow[] {
  const byKey = new Map<string, { row: PageRow; tabs: Set<string> }>();
  for (const tab of tabs) {
    for (const link of withSubagents(tab.links, tab.subagentLinks ?? null, subagentsShown)) {
      const seen = byKey.get(link.key);
      if (!seen) byKey.set(link.key, { row: { link, tab, others: 0 }, tabs: new Set([tab.agentId]) });
      else {
        seen.tabs.add(tab.agentId);
        if (link.lastAt > seen.row.link.lastAt) seen.row = { link, tab, others: 0 };
      }
    }
  }
  return [...byKey.values()].map(({ row, tabs: mentioned }) => ({ ...row, others: mentioned.size - 1 })).sort((a, b) => b.link.lastAt - a.link.lastAt);
}

/** `+N subagents`: links that only sub-agents mentioned, none of the workspace's tabs. */
export function subagentExtra(tabs: readonly WorkspaceTab[]): number {
  const own = new Set(tabs.flatMap((tab) => tab.links.map((link) => link.key)));
  return new Set(tabs.flatMap((tab) => (tab.subagentLinks ?? []).map((link) => link.key)).filter((key) => !own.has(key))).size;
}

/**
 * By tab: each tab with links that pass `keep`, open tabs first, then closed ones (shown after a
 * `Closed` separator); newest link first within each part.
 */
export function byTab(tabs: readonly WorkspaceTab[], subagentsShown: boolean, keep: (link: Link) => boolean): PageGroup[] {
  return tabs
    .map((tab) => ({
      key: `tab:${tab.agentId}`,
      title: tab.title,
      tab,
      rows: withSubagents(tab.links, tab.subagentLinks ?? null, subagentsShown)
        .filter(keep)
        .map((link) => ({ link, tab, others: 0 })),
    }))
    .filter((group) => group.rows.length)
    .sort((a, b) => Number(a.tab.closed) - Number(b.tab.closed) || (b.rows[0]?.link.lastAt ?? 0) - (a.rows[0]?.link.lastAt ?? 0));
}

/** The site a link belongs to: the host (`github.com/owner/repo` for GitHub), or a file's folder. */
export function siteOf(link: Link): string {
  if (link.kind === "file" || !link.url) return link.where;
  const url = new URL(link.url);
  if (url.host !== "github.com") return url.host;
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  return owner && repo ? `github.com/${owner}/${repo}` : url.host;
}

/** By site: Flat's rows grouped by site, the group with the newest link first. */
export function bySite(rows: readonly PageRow[]): PageGroup[] {
  const groups = new Map<string, PageGroup>();
  for (const row of [...rows].sort((a, b) => b.link.lastAt - a.link.lastAt)) {
    const site = siteOf(row.link);
    const group = groups.get(site);
    if (group) group.rows.push(row);
    else groups.set(site, { key: `site:${site}`, title: site, rows: [row] });
  }
  return [...groups.values()];
}

/** A search over name, folder or host, URL or path, sentence and sub-agent: every word must match. */
export function searchFilter(query: string): (link: Link) => boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return () => true;
  return (link) => {
    const text = [link.title, link.where, link.url, link.copy, link.snippet, link.via].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
  };
}
