import { describe, expect, it } from "vitest";
import type { Link, LinkKind } from "../shared/links";
import { effectiveFilter, kindCounts } from "./store";

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
