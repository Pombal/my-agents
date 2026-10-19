import type { PastSession } from "../shared/rpc";

export type ListItem =
  | { kind: "row"; key: string; entry: PastSession }
  | { kind: "empty"; key: "empty" }
  | { kind: "same-folder-header"; key: "same-folder-header"; count: number; open: boolean };

/** Case-insensitive match on every word of `query` against title and folder. */
export function matchesQuery(entry: PastSession, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${entry.title}\n${entry.cwd}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * Flattens the main list and the optional "same folder" section into one virtualized list.
 * The main list always yields at least one item (an `empty` placeholder), so the section header
 * never floats alone. A search opens the section, since hiding matches would read as "no results".
 */
export function buildListItems(
  data: { entries: PastSession[]; sameFolder: PastSession[] },
  view: { query: string; sameFolderOpen: boolean },
): ListItem[] {
  const main = data.entries.filter((entry) => matchesQuery(entry, view.query));
  const extra = data.sameFolder.filter((entry) => matchesQuery(entry, view.query));
  const items: ListItem[] =
    main.length > 0
      ? main.map((entry) => ({ kind: "row", key: entry.key, entry }))
      : [{ kind: "empty", key: "empty" }];
  if (extra.length === 0) return items;
  const open = view.sameFolderOpen || view.query.trim() !== "";
  items.push({ kind: "same-folder-header", key: "same-folder-header", count: extra.length, open });
  if (open) items.push(...extra.map((entry): ListItem => ({ kind: "row", key: entry.key, entry })));
  return items;
}
