import { execFileSync } from "node:child_process";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sectionChanges } from "./git";
import { readText, TEXTS_CAP } from "./scan";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "efforts-cache-test-"));
  dirs.push(dir);
  return dir;
}
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

/** Every file gets this mtime, so a rewrite of the same size looks unchanged to the cache. */
const AT = new Date("2026-01-01T00:00:00Z");
async function put(file: string, text: string): Promise<string> {
  await writeFile(file, text);
  await utimes(file, AT, AT);
  return file;
}

/**
 * Rewrites the file with other bytes of the same size and mtime: a cached read still returns
 * `old`, a read from disk returns the new text.
 */
async function cachedText(file: string, old: string): Promise<string> {
  await put(file, old.replace(/^old/, "new"));
  return (await readText(file)).text.slice(0, 3);
}

describe("file text cache", () => {
  it("drops the least recently read file past the entry cap; a recently read unchanged one still comes from memory", async () => {
    const dir = await tempDir();
    const files: string[] = [];
    for (let index = 0; index <= TEXTS_CAP.entries; index++) files.push(await put(path.join(dir, `${index}.md`), `old ${index}`));
    for (const file of files.slice(0, TEXTS_CAP.entries)) await readText(file);
    // Reading the oldest again makes the second-oldest the least recently used.
    await readText(files[0]);
    await readText(files[TEXTS_CAP.entries]);

    expect(await cachedText(files[0], "old 0")).toBe("old");
    expect(await cachedText(files[TEXTS_CAP.entries], `old ${TEXTS_CAP.entries}`)).toBe("old");
    expect(await cachedText(files[1], "old 1")).toBe("new");
  });

  it("drops the oldest texts once they pass the byte cap, though under the entry cap", async () => {
    const dir = await tempDir();
    // Each holds 512 KiB of characters, cached at 2 bytes each: 1 MiB.
    const text = `old${"x".repeat(600 * 1024)}`;
    const count = TEXTS_CAP.bytes / (1024 * 1024) + 8;
    const files: string[] = [];
    for (let index = 0; index < count; index++) files.push(await put(path.join(dir, `${index}.md`), text));
    for (const file of files) await readText(file);

    expect(await cachedText(files[count - 1], text)).toBe("old");
    expect(await cachedText(files[0], text)).toBe("new");
  });
});

describe("section changes cache", () => {
  it("drops the oldest diff once the added lines pass the byte cap; the newest is reused", async () => {
    const repo = await tempDir();
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
    const a = path.join(repo, "a.md");
    const b = path.join(repo, "b.md");
    await writeFile(a, "# A\n");
    await writeFile(b, "# B\n");
    git("init", "-q");
    git("add", "-A");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
    // 70,000 added lines each: together past the 4 MiB cap, each alone well under it.
    const lines = "- line\n".repeat(70_000);
    await writeFile(a, `# A\n${lines}`);
    await writeFile(b, `# B\n${lines}`);

    const first = sectionChanges(repo, a, "a1");
    expect((await first).added.size).toBe(70_000);
    const second = sectionChanges(repo, b, "b1");
    await second;

    expect(sectionChanges(repo, b, "b1")).toBe(second);
    expect(sectionChanges(repo, a, "a1")).not.toBe(first);
  });
});
