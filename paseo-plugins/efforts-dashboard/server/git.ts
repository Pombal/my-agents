import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { sections } from "../shared/parse";
import { readText } from "./scan";

const run = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", cwd, ...args], { timeout: 8_000, maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

const tops = new Map<string, Promise<string | null>>();

/** Top folder of the git repo that owns a real path, null when it isn't in one. */
export function repoTop(dir: string): Promise<string | null> {
  let top = tops.get(dir);
  if (!top) {
    top = git(dir, ["rev-parse", "--show-toplevel"]).then(
      (out) => out.trim() || null,
      () => null,
    );
    tops.set(dir, top);
  }
  return top;
}

export interface Change {
  /** Path relative to the effort folder. */
  rel: string;
  kind: "new" | "modified" | "deleted";
}

const statusCache = new Map<string, { at: number; result: Promise<Map<string, Change["kind"]>> }>();

/**
 * `git status` for one `.scratch` folder, at most every 2 s per folder: absolute path → change.
 * Untracked folders are listed file by file.
 */
function scratchStatus(top: string, root: string): Promise<Map<string, Change["kind"]>> {
  const cached = statusCache.get(root);
  if (cached && Date.now() - cached.at < 2_000) return cached.result;
  const result = git(top, ["status", "--porcelain=v1", "-z", "-uall", "--", path.relative(top, root) || "."]).then(
    (out) => {
      const changes = new Map<string, Change["kind"]>();
      const records = out.split("\0");
      for (let index = 0; index < records.length; index++) {
        const record = records[index];
        if (record.length < 4) continue;
        const code = record.slice(0, 2);
        const file = path.join(top, record.slice(3));
        // Renames carry the old path as the next record.
        if (code[0] === "R" || code[0] === "C") index++;
        changes.set(file, code === "??" || code.includes("A") ? "new" : code.includes("D") ? "deleted" : "modified");
      }
      return changes;
    },
    () => new Map<string, Change["kind"]>(),
  );
  statusCache.set(root, { at: Date.now(), result });
  return result;
}

export async function effortChanges(effortDir: string, root: string): Promise<{ top: string; changes: Change[] } | null> {
  const top = await repoTop(effortDir);
  if (!top) return null;
  const all = await scratchStatus(top, root);
  const prefix = effortDir + path.sep;
  const changes: Change[] = [];
  for (const [file, kind] of all) {
    if (file.startsWith(prefix)) changes.push({ rel: file.slice(prefix.length), kind });
  }
  changes.sort((a, b) => a.rel.localeCompare(b.rel));
  return { top, changes };
}

/** Added/removed line counts of tracked changes under the effort, by path relative to it. */
export async function numstat(top: string, effortDir: string): Promise<Map<string, { added: number; removed: number }>> {
  const out = new Map<string, { added: number; removed: number }>();
  try {
    const text = await git(top, ["diff", "--numstat", "HEAD", "--", path.relative(top, effortDir)]);
    for (const line of text.split("\n")) {
      const [added, removed, file] = line.split("\t");
      if (!file) continue;
      out.set(path.relative(effortDir, path.join(top, file)), { added: Number(added) || 0, removed: Number(removed) || 0 });
    }
  } catch {
    // Unborn HEAD or a broken repo: no line counts.
  }
  return out;
}

export interface SectionChanges {
  /** Added lines per `## ` section, in file order: `[["Decisions so far", 8], ["Notes", 3]]`. */
  sections: [string, number][];
  /** 0-based lines of the current file that are added. */
  added: Set<number>;
}

/** Where a changed Markdown file gained lines since the last commit. */
export async function sectionChanges(top: string, file: string): Promise<SectionChanges> {
  let diff: string;
  let text: string;
  try {
    [diff, { text }] = await Promise.all([git(top, ["diff", "-U0", "HEAD", "--", path.relative(top, file)]), readText(file)]);
  } catch {
    return { sections: [], added: new Set() };
  }
  const heads = sections(text);
  const counts = new Map<string, number>();
  const added = new Set<number>();
  for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]) - 1;
    const length = match[2] === undefined ? 1 : Number(match[2]);
    for (let line = start; line < start + length; line++) {
      added.add(line);
      const owner = [...heads].reverse().find((section) => section.line <= line);
      const name = owner?.heading ?? "head";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return {
    sections: heads.filter((section) => counts.has(section.heading)).map((section) => [section.heading, counts.get(section.heading)!]),
    added,
  };
}

const logCache = new Map<string, { at: number; result: Promise<{ hash: string; atMs: number; subject: string }[]> }>();

/** Newest commits touching the effort (100 at most), cached for 20 s. */
export function commits(top: string, effortDir: string): Promise<{ hash: string; atMs: number; subject: string }[]> {
  const cached = logCache.get(effortDir);
  if (cached && Date.now() - cached.at < 20_000) return cached.result;
  const result = git(top, ["log", "-n", "101", "--format=%h%x1f%ct%x1f%s", "--", path.relative(top, effortDir)]).then(
    (out) =>
      out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, at, subject] = line.split("\x1f");
          return { hash, atMs: Number(at) * 1000, subject: subject ?? "" };
        }),
    () => [],
  );
  logCache.set(effortDir, { at: Date.now(), result });
  return result;
}
