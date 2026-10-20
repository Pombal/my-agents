import test from "node:test";
import assert from "node:assert/strict";
import { LABEL_NAMED, LABEL_UNNAMED, conversationContext, defaultTitle, parseDecision, siblingEntry, titleOwnership } from "../shared/agent-titles.mjs";

test("default title matches Paseo's first-prompt rule: first nonblank line, collapsed, 60 chars", () => {
  assert.equal(defaultTitle("\r\n  \r\n  Explain\t  caching  \r\nIgnore this second line"), "Explain caching");
  assert.equal(defaultTitle("  " + "x".repeat(70) + "\nSecond"), "x".repeat(60));
  assert.equal(defaultTitle("x".repeat(59) + " y"), "x".repeat(59));
  assert.equal(defaultTitle("\n \t \n"), null);
});

test("automatic titling touches only the placeholder or a title it chose itself; any other name is hand-chosen", () => {
  const labels = { [LABEL_NAMED]: "Cache", [LABEL_UNNAMED]: "hi there" };
  assert.equal(titleOwnership("Cache", labels), "named");
  assert.equal(titleOwnership("hi there", labels), "unnamed");
  assert.equal(titleOwnership("Fix the cache please", {}, "Fix the cache please"), "unnamed");
  // Renamed by hand after Titles named it, or never touched by Titles at all.
  assert.equal(titleOwnership("My Cache Notes", labels), "hand");
  assert.equal(titleOwnership("Fix the cache please", {}), "hand");
  assert.equal(titleOwnership(null, labels, "x"), "hand");
});

test("siblings: Titles' own titles go in bare; placeholders and hand names carry a note", () => {
  const placeholder = { title: "Why does the inventory page jump?", note: "placeholder: first prompt line, not a title" };
  assert.equal(siblingEntry("Inventory", { [LABEL_NAMED]: "Inventory" }), "Inventory");
  assert.deepEqual(siblingEntry("Why does the inventory page jump?", {}, ["Why does the inventory page jump?"]), placeholder);
  // A placeholder Titles already recorded needs no prompt lines.
  assert.deepEqual(siblingEntry("Why does the inventory page jump?", { [LABEL_UNNAMED]: "Why does the inventory page jump?" }), placeholder);
  // Titles named it, then Stefan renamed it: his name now.
  assert.deepEqual(siblingEntry("Stock UI", { [LABEL_NAMED]: "Inventory" }, ["Fix the stock page"]), { title: "Stock UI", note: "named by hand" });
  // Only the whole first-prompt line is the placeholder, not a name that starts like it.
  assert.deepEqual(siblingEntry("Inventory notes", {}, ["Inventory notes for Q3"]), { title: "Inventory notes", note: "named by hand" });
  assert.equal(siblingEntry(null, { [LABEL_NAMED]: "Inventory" }), null);
});

test("keep wins over a stray title; a title comes back as Haiku wrote it, fence and outer whitespace aside", () => {
  assert.deepEqual(parseDecision('{"keep":true,"title":"Unwanted"}'), { kind: "keep" });
  assert.deepEqual(parseDecision('```json\n{"title":" dark mode "}\n```'), { kind: "rename", title: "dark mode" });
  assert.deepEqual(parseDecision('{"title":"Opus Thinking Levels"}'), { kind: "rename", title: "Opus Thinking Levels" });
});

test("answers that are not JSON or carry no title are malformed", () => {
  for (const answer of ['{"title":""}', '{"title":42}', '{"keep":false}', "{}", "Here is your title: Cache"]) {
    assert.throws(() => parseDecision(answer), answer);
  }
});

test("context keeps both roles, drops tools/reasoning/plugin items, and keeps the newest turns", () => {
  const context = conversationContext([
    { type: "user_message", text: "Old database topic" },
    { type: "tool_call", text: "Wrong subject" },
    { type: "reasoning", text: "Private thinking" },
    ...Array.from({ length: 14 }, (_, i) => ({ type: i % 2 ? "assistant_message" : "user_message", text: `Recent ${i}` })),
    { type: "plugin", text: "Renamed: Wrong" },
  ]);
  assert(!context.includes("Old database") && !context.includes("Wrong") && !context.includes("Private"));
  assert(context.startsWith("User: Recent 2") && context.endsWith("Assistant: Recent 13"));
});

test("an agentic turn's many assistant messages cannot push the user's request out", () => {
  const context = conversationContext([
    { type: "user_message", text: "Why does the sidebar flicker?" },
    ...Array.from({ length: 30 }, (_, i) => [{ type: "tool_call" }, { type: "assistant_message", text: `Step ${i}` }]).flat(),
  ]);
  assert(context.startsWith("User: Why does the sidebar flicker?"));
  assert.equal(context.split("\n\n").length, 2);
  assert(context.includes("Step 0") && context.endsWith("Step 29"));
});

test("a long reply keeps its beginning and end but stays bounded", () => {
  const context = conversationContext([
    { type: "user_message", text: "Now discuss Volcanoes" },
    { type: "assistant_message", text: "Beginning " + "x".repeat(30000) + " Ending" },
  ]);
  assert(context.includes("User: Now discuss Volcanoes") && context.includes("Beginning") && context.endsWith("Ending"));
  assert(context.length < 1400);
});
