import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bucketOf, headFields, parseBlockedBy, statusWord } from "../shared/parse";
import { scratchFor } from "./scan";

// Every value below is copied from a real ticket or map under nilo-wayfinder, index or
// nilo-observatory `.scratch` (2026-10-20).

describe("Status lines", () => {
  it.each([
    ["Status: open", "open", "open"],
    ["**Status:** resolved 2026-08-29", "resolved", "done"],
    ["**Status:** closed (2026-10-09)", "closed", "done"],
    ["Status: resolved, 2026-10-04. [spec.md](../spec.md) reviewed", "resolved", "done"],
    ["**Status:** open, follow-up to [03](03-x.md)", "open", "open"],
    ["**Status:** in progress — Opus (high) in worktree wa-ftue", "in progress", "claimed"],
    ["Status: ready-for-agent", "ready-for-agent", "open"],
    ["**Status**: parked", "parked", "parked"],
  ])("%s", (line, word, bucket) => {
    const raw = headFields(`# Title\n\n${line}\n`).fields.get("status");
    expect(statusWord(raw)).toBe(word);
    expect(bucketOf(statusWord(raw))).toBe(bucket);
  });

  it("ignores Status lines below the first ## heading", () => {
    expect(headFields("# T\n\nType: task\n\n## Answer\n\nStatus: resolved\n").fields.has("status")).toBe(false);
  });
});

describe("Blocked by", () => {
  it.each([
    ["none", [], [], null],
    ["—", [], [], null],
    ["None — can start immediately. Blocks ticket 09.", [], [], null],
    ["none (05 reconcile closed 2026-10-16). Stacks on 11.", [], [], null],
    ["04, 06", ["04", "06"], [], null],
    ["[02](02-export-real-threads.md) (needs the exported threads); uses the formatter", ["02"], [], null],
    ["[01](01-whats-wrong.md), [03](03-in-flight-work.md)", ["01", "03"], [], null],
    ["12 — Linked Teleporter behavior.", ["12"], [], null],
    ["03 (08 resolved 2026-09-04)", ["03"], [], null],
    ["10 — sensor host; 11 — entitySelector property.", ["10", "11"], [], null],
    ["01 Who owns the Google OAuth client; 06 Commercial terms and costs of the stack; 07 New name", ["01", "06", "07"], [], null],
    ["02, chat-widgets 08", ["02"], [{ effort: "chat-widgets", num: "08" }], null],
    ["v0 shipped and in real use (weights need real visits; the dev seed has none)", [], [], "v0 shipped and in real use (weights need real visits; the dev seed has none)"],
    ["PR #12895 merging", [], [], "PR #12895 merging"],
  ])("%s", (raw, own, elsewhere, note) => {
    expect(parseBlockedBy(raw)).toEqual({ own, elsewhere, note });
  });
});

describe("symlinked .scratch roots", () => {
  let dir = "";
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("resolves a worktree's .scratch symlink to the shared folder", async () => {
    // nilo and its worktrees link `.scratch` to nilo-wayfinder's.
    dir = await mkdtemp(path.join(tmpdir(), "efforts-"));
    const shared = path.join(dir, "nilo-wayfinder", ".scratch");
    await mkdir(path.join(shared, "wa-ftue"), { recursive: true });
    await writeFile(path.join(shared, "wa-ftue", "map.md"), "# wa-ftue\n");
    await mkdir(path.join(dir, "worktree"));
    await symlink(shared, path.join(dir, "worktree", ".scratch"));
    const real = await scratchFor(path.join(dir, "nilo-wayfinder"), dir);
    expect(await scratchFor(path.join(dir, "worktree"), dir)).toBe(real);
    expect(await scratchFor("~/worktree/.scratch", dir)).toBe(real);
  });
});
