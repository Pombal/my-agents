import { describe, expect, it } from "vitest";
import type { Link, LinkKind } from "../shared/links";
import { effectiveFilter, kindCounts, whereLabel, withSubagents } from "./store";

const link = (kind: LinkKind, n: number): Link => ({ key: `${kind}:${n}`, kind, title: `${kind} ${n}`, where: "", glyph: "File", lastAt: n });

describe("type filter", () => {
  it("lists only the types a chat has, in chip order", () => {
    expect(kindCounts([link("file", 1), link("image", 2), link("file", 3)])).toEqual([
      { kind: "image", count: 1 },
      { kind: "file", count: 2 },
    ]);
  });

  it("shows web alone by default when the chat also has other types", () => {
    expect(effectiveFilter([link("image", 1), link("web", 2), link("file", 3)], undefined)).toBe("web");
  });

  it("shows everything when the chat has a single type or no web links", () => {
    expect(effectiveFilter([link("file", 1), link("file", 2)], undefined)).toBe("all");
    expect(effectiveFilter([link("image", 1), link("file", 2)], undefined)).toBe("all");
  });

  it("keeps the user's choice while its type is still present, else falls back", () => {
    const chat = [link("web", 1), link("image", 2)];
    expect(effectiveFilter(chat, "image")).toBe("image");
    expect(effectiveFilter(chat, "all")).toBe("all");
    expect(effectiveFilter(chat, "file")).toBe("web");
  });
});

describe("sub-agent links", () => {
  it("merge into the chat's links newest first only when shown, marked with their sub-agent", () => {
    const chat = [link("web", 9), link("image", 3)];
    const extra: Link[] = [{ ...link("web", 5), via: "LinksPillBuild" }, { ...link("file", 1), via: "Scout" }];
    expect(withSubagents(chat, extra, false)).toBe(chat);
    const shown = withSubagents(chat, extra, true);
    expect(shown.map((row) => [row.lastAt, whereLabel({ ...row, where: "host" })])).toEqual([
      [9, "host"],
      [5, "↳ LinksPillBuild"],
      [3, "host"],
      [1, "↳ Scout"],
    ]);
    // They obey the type filter like any other link: Web alone now has two rows.
    expect(kindCounts(shown)).toEqual([
      { kind: "web", count: 2 },
      { kind: "image", count: 1 },
      { kind: "file", count: 1 },
    ]);
  });
});
