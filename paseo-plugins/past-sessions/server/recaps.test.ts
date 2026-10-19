import { describe, expect, it } from "vitest";
import { parseRecaps } from "./recaps";

describe("parseRecaps", () => {
  it("maps agents to their latest summary and skips entries without one", () => {
    // Shape of ~/.paseo/plugin-data/paseo-recap/recaps.json (version 1).
    const json = JSON.stringify({
      version: 1,
      agents: {
        a: { latest: { summary: " Diff colours shipped. ", revision: 14 }, previous: [] },
        b: { latest: null },
        c: { latest: { summary: "" } },
        d: "garbage",
      },
    });
    expect([...parseRecaps(json)]).toEqual([["a", "Diff colours shipped."]]);
  });

  it("is empty for unreadable files", () => {
    expect(parseRecaps("{not json").size).toBe(0);
    expect(parseRecaps(JSON.stringify({ version: 2 })).size).toBe(0);
  });
});
