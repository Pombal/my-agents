import { describe, expect, it } from "vitest";
import type { PastSession } from "../shared/rpc";
import { buildListItems, matchesQuery, type ListItem } from "./model";

function session(key: string, title: string, cwd = "/home/cx/agentspace/index"): PastSession {
  return { key, source: key.startsWith("omp:") ? "omp" : "paseo", title, cwd, at: "2026-10-19T00:00:00.000Z", provider: "omp", preview: null };
}

const shape = (items: ListItem[]) =>
  items.map((item) => (item.kind === "row" ? item.key : item.kind === "same-folder-header" ? `header:${item.count}:${item.open}` : item.kind));

describe("buildListItems", () => {
  const data = {
    entries: [session("paseo:a", "Diff highlight"), session("paseo:b", "Kick off")],
    sameFolder: [session("omp:1", "Cuneiform."), session("omp:2", "Fix diff colors")],
  };

  it("keeps the same-folder section collapsed below the main list until opened", () => {
    expect(shape(buildListItems(data, { query: "", sameFolderOpen: false }))).toEqual([
      "paseo:a",
      "paseo:b",
      "header:2:false",
    ]);
    expect(shape(buildListItems(data, { query: "", sameFolderOpen: true }))).toEqual([
      "paseo:a",
      "paseo:b",
      "header:2:true",
      "omp:1",
      "omp:2",
    ]);
  });

  it("opens the section for a search and counts only matches", () => {
    expect(shape(buildListItems(data, { query: "diff", sameFolderOpen: false }))).toEqual([
      "paseo:a",
      "header:1:true",
      "omp:2",
    ]);
  });

  it("puts an empty placeholder before the section when the main list has nothing", () => {
    expect(shape(buildListItems({ entries: [], sameFolder: data.sameFolder }, { query: "", sameFolderOpen: false }))).toEqual([
      "empty",
      "header:2:false",
    ]);
    expect(shape(buildListItems({ entries: [], sameFolder: [] }, { query: "", sameFolderOpen: false }))).toEqual(["empty"]);
  });
});

describe("matchesQuery", () => {
  it("needs every word, in title or folder, ignoring case", () => {
    const entry = session("paseo:a", "Diff highlight tint", "/home/cx/agentspace/index/.scratch");
    expect(matchesQuery(entry, "TINT scratch")).toBe(true);
    expect(matchesQuery(entry, "tint nilo")).toBe(false);
    expect(matchesQuery(entry, "   ")).toBe(true);
  });
});
