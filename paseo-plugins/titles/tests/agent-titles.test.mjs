import test from "node:test";
import assert from "node:assert/strict";
import { defaultTitle, isDefaultTitle, observeTitle, parseDecision, conversationContext, metadataAgent } from "../shared/agent-titles.mjs";

test("default title follows Paseo's first nonblank normalized line, including CRLF and 60-char clamp", () => {
  const prompt = "\r\n  \r\n  Explain\t  caching  \r\nIgnore this second line";
  assert.equal(defaultTitle(prompt), "Explain caching");
  assert.equal(defaultTitle("  " + "x".repeat(70) + "\nSecond"), "x".repeat(60));
  assert.equal(defaultTitle("x".repeat(59) + " y"), "x".repeat(59));
  assert.equal(defaultTitle("\n \t \n"), null);
});
test("manual names are not default names, and generation-time renames invalidate the original", () => {
  const prompt = "Explain database indexes\nWith examples";
  assert.equal(isDefaultTitle("Explain database indexes", prompt), true);
  assert.equal(isDefaultTitle("My Database Notes", prompt), false);
  assert.equal(isDefaultTitle("Explain Database Indexes", prompt), false);
  assert.equal(isDefaultTitle(null, ""), false);
  const state = { initial: undefined, renamed: false };
  observeTitle(state, null); // Empty composer before its first prompt is not a rename.
  observeTitle(state, "Explain database indexes");
  observeTitle(state, "Explain database indexes");
  assert.equal(state.renamed, false);
  observeTitle(state, "My Database Notes");
  observeTitle(state, "Explain database indexes"); // A rename back must not restore eligibility.
  assert.equal(state.renamed, true);
});
test("keep decision cannot accidentally rename using a stray title field", () => {
  assert.deepEqual(parseDecision('{"action":"keep","title":"Unwanted"}'), { action: "keep" });
  assert.deepEqual(parseDecision('```json\n{"action":"rename","title":"caching"}\n```'), { action: "rename", title: "Caching" });
  assert.deepEqual(parseDecision('{"action":"rename","title":"cache invalidation"}'), { action: "rename", title: "Cache Invalidation" });
  assert.deepEqual(parseDecision('{"action":"rename","title":"OAuth"}'), { action: "rename", title: "OAuth" });
});
test("rejects verbose, malformed, decorative or ambiguous outputs rather than truncating meaning", () => {
  for (const value of ['{"action":"rename","title":"Fix The Cache"}', '{"action":"rename","title":""}', '{"action":"rename","title":"* Cache"}', '{"action":"rename","title":"Cache!"}', '{"action":"rename","title":"' + "x".repeat(61) + '"}', '{"action":"maybe","title":"Cache"}', '{"action":"rename"}', 'Here is your title: Cache']) {
    assert.throws(() => parseDecision(value));
  }
});
test("recent conversation includes both roles but ignores tools, reasoning and plugin notices", () => {
  const context = conversationContext([
    { type: "user_message", text: "Old database topic" },
    { type: "tool_call", text: "Wrong subject" },
    { type: "reasoning", text: "Private thinking" },
    ...Array.from({ length: 18 }, (_, i) => ({ type: i % 2 ? "assistant_message" : "user_message", text: `Recent ${i}` })),
    { type: "plugin", text: "Renamed: Wrong" },
  ]);
  assert(!context.includes("Old database") && !context.includes("Wrong") && !context.includes("Private"));
  assert(context.startsWith("User: Recent 2") && context.endsWith("Assistant: Recent 17"));
  assert.equal(conversationContext([{ type: "user_message", text: "x".repeat(500) }], 80).length, 80);
});
test("a verbose assistant cannot push the newest user subject out of the context", () => {
  const context = conversationContext([
    { type: "user_message", text: "Now discuss Volcanoes" },
    { type: "assistant_message", text: "Beginning " + "x".repeat(30000) + " Ending" },
  ]);
  assert(context.includes("User: Now discuss Volcanoes"));
  assert(context.includes("Beginning") && context.endsWith("Ending"));
  assert(context.length < 1700);
});
test("known metadata generators are excluded without excluding ordinary subjects", () => {
  assert(metadataAgent("Branch name generator"));
  assert(metadataAgent("Agent title generator"));
  assert(!metadataAgent("Branch cleanup"));
});
