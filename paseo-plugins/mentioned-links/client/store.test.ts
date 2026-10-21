import { describe, expect, it } from "vitest";
import type { Link, LinkKind } from "../shared/links";
import { kindCounts, shownKinds, toggleKind, whereLabel, withSubagents } from "./store";

const link = (kind: LinkKind, n: number): Link => ({ key: `${kind}:${n}`, kind, title: `${kind} ${n}`, where: "", glyph: "File", lastAt: n });

describe("type chips", () => {
  it("lists only the types a chat has, in chip order", () => {
    expect(kindCounts([link("file", 1), link("image", 2), link("file", 3)])).toEqual([
      { kind: "image", count: 1 },
      { kind: "file", count: 2 },
    ]);
  });

  it("show only web by default when the chat also has other types, else everything", () => {
    expect(shownKinds([link("image", 1), link("web", 2), link("file", 3)], undefined)).toEqual(["web"]);
    expect(shownKinds([link("image", 1), link("file", 2)], undefined)).toEqual(["image", "file"]);
    expect(shownKinds([link("file", 1), link("file", 2)], ["image"])).toEqual(["file"]);
  });

  it("keep the chips the user switched on while those types are present, else fall back", () => {
    const chat = [link("web", 1), link("image", 2), link("file", 3)];
    expect(shownKinds(chat, ["image", "file"])).toEqual(["image", "file"]);
    expect(shownKinds([link("web", 1), link("image", 2)], ["file"])).toEqual(["web"]);
  });

  it("switch one type on or off, in chip order, but never the last one off", () => {
    expect(toggleKind(["file"], "web")).toEqual(["web", "file"]);
    expect(toggleKind(["web", "file"], "web")).toEqual(["file"]);
    const last = ["image"] as const;
    expect(toggleKind(last, "image")).toBe(last);
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

  it("mark a missing path in the muted column, keeping the sub-agent", () => {
    expect(whereLabel({ ...link("file", 1), where: "~/tmp", missing: true })).toBe("missing");
    expect(whereLabel({ ...link("file", 1), where: "~/tmp", missing: true, via: "Scout" })).toBe("missing · ↳ Scout");
  });
});
