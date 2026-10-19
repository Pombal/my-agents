import test from "node:test";
import assert from "node:assert/strict";
import { conversationContext, defaultTitle, isShortTitle, parseDecision } from "../shared/agent-titles.mjs";

test("default title matches Paseo's first-prompt rule: first nonblank line, collapsed, 60 chars", () => {
  assert.equal(defaultTitle("\r\n  \r\n  Explain\t  caching  \r\nIgnore this second line"), "Explain caching");
  assert.equal(defaultTitle("  " + "x".repeat(70) + "\nSecond"), "x".repeat(60));
  assert.equal(defaultTitle("x".repeat(59) + " y"), "x".repeat(59));
  assert.equal(defaultTitle("\n \t \n"), null);
});

test("only one- or two-word titles count as already short (and so can be kept)", () => {
  for (const title of ["Volcanoes", "Dark Mode", "OAuth", "C++", "Node.js"]) assert(isShortTitle(title), title);
  for (const title of [null, "", "Explain database indexes", "My Galaxy Notes", "* Cache", "Cache!"]) assert(!isShortTitle(title), String(title));
});

test("keep wins over a stray title; renames are Title Cased without flattening identifiers", () => {
  assert.deepEqual(parseDecision('{"keep":true,"title":"Unwanted"}'), { kind: "keep" });
  assert.deepEqual(parseDecision('```json\n{"title":"caching"}\n```'), { kind: "rename", title: "Caching" });
  assert.deepEqual(parseDecision('{"title":"dark mode"}'), { kind: "rename", title: "Dark Mode" });
  assert.deepEqual(parseDecision('{"title":"iOS"}'), { kind: "rename", title: "iOS" });
  assert.deepEqual(parseDecision('{"title":"eBPF maps"}'), { kind: "rename", title: "eBPF Maps" });
  assert.deepEqual(parseDecision('{"title":"Volcanoes."}'), { kind: "rename", title: "Volcanoes" });
});

test("verbose, decorated or malformed answers are rejected, never truncated into a title", () => {
  for (const answer of ['{"title":"Fix The Cache"}', '{"title":""}', '{"title":"* Cache"}', '{"title":"Cache!"}', '{"keep":false}', "{}", "Here is your title: Cache"]) {
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
