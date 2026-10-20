import { describe, expect, it } from "vitest";
import { linkPage, ticketBody } from "./format";

describe("ticket body", () => {
  it("drops the head's Status/Type/Blocked by lines, never lines further down", () => {
    // Shape of thinking-with-portals/issues/01: a code sample with a `type:` field below the head.
    const text = [
      "# 01 — Portal shape",
      "",
      "**Status:** open",
      "Type: research",
      "Blocked by: 02",
      "",
      "Question: what does a portal carry?",
      "",
      "## Sketch",
      "",
      "```ts",
      'const portal = { type: "boundingBox",',
      '  status: "pending" };',
      "```",
    ].join("\n");
    expect(ticketBody(text)).toBe(
      ["Question: what does a portal carry?", "", "## Sketch", "", "```ts", 'const portal = { type: "boundingBox",', '  status: "pending" };', "```"].join("\n"),
    );
  });
});

describe("links inside an effort", () => {
  const docs = [
    { kind: "map" as const, rel: "map.md" },
    { kind: "folder" as const, rel: "research" },
    { kind: "folder" as const, rel: "handoffs" },
  ];

  it("open a listed folder as its file list", () => {
    expect(linkPage(docs, "map.md", "research/")).toEqual({ kind: "folder", rel: "research" });
    expect(linkPage(docs, "issues/03-x.md", "../handoffs")).toEqual({ kind: "folder", rel: "handoffs" });
  });

  it("open files as docs, and ignore malformed escapes instead of throwing", () => {
    expect(linkPage(docs, "map.md", "research/notes.md")).toEqual({ kind: "doc", rel: "research/notes.md" });
    expect(linkPage(docs, "map.md", "research/100%.md")).toBeNull();
  });
});
