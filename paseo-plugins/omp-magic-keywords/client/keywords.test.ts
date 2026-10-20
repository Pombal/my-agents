import { describe, expect, it } from "vitest";
import { findClaudeUltrathink, findMagicKeywords, MAGIC_KEYWORDS } from "./keywords";

const ULTRATHINK = MAGIC_KEYWORDS.findIndex(({ word }) => word === "ultrathink");
const spans = (text: string, matches: { start: number; end: number }[]) => matches.map(({ start, end }) => text.slice(start, end));

// Claude Code decides with /\bultrathink\b/i on the raw prompt; OMP wants the exact lowercase word
// standing alone in prose. Each chat is coloured by the rule its own agent applies.
describe("findClaudeUltrathink", () => {
  it.each([
    ["Ultrathink about this", ["Ultrathink"]],
    ["use `ultrathink` here", ["ultrathink"]],
    ["foo.ultrathink bar", ["ultrathink"]],
    ["<paseo-system>ultrathink</paseo-system>", ["ultrathink"]],
  ])("colours %j, which Claude acts on and OMP ignores", (text, expected) => {
    expect(spans(text, findClaudeUltrathink(text))).toEqual(expected);
    expect(findMagicKeywords(text).filter(({ keyword }) => keyword === ULTRATHINK)).toEqual([]);
  });

  it("leaves words Claude ignores plain, as OMP does", () => {
    for (const text of ["ultrathinking", "ultra think", "ultrathink_now"]) {
      expect(findClaudeUltrathink(text)).toEqual([]);
      expect(findMagicKeywords(text)).toEqual([]);
    }
  });

  it("reports every hit as the ultrathink keyword", () => {
    const text = "ultrathink, then ULTRATHINK";
    expect(findClaudeUltrathink(text)).toEqual([
      { keyword: ULTRATHINK, start: 0, end: 10 },
      { keyword: ULTRATHINK, start: 17, end: 27 },
    ]);
  });
});
