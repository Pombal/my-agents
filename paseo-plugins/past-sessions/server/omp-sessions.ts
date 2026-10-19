import { open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { isSameOrInside, ompDirNames, subtreeDirMatcher, type PathRoots } from "./slug";

/** Bytes read from the start of a session file. The rest of the file is never read. */
export const HEAD_BYTES = 64 * 1024;

export interface SessionHead {
  sessionId: string;
  cwd: string;
  createdAt: string | null;
  title: string | null;
  firstPrompt: string | null;
}

export interface OmpSession extends SessionHead {
  file: string;
  /** Paseo provider that imports this session: `omp`, or a provider using that OMP profile. */
  provider: string;
  mtime: string;
}

export interface OmpSessionRoot {
  dir: string;
  provider: string;
}

function asRecord(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const value: unknown = JSON.parse(trimmed);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function messageText(content: unknown): string | null {
  if (typeof content === "string") return nonEmpty(content);
  if (!Array.isArray(content)) return null;
  const parts = content.flatMap((part) =>
    part && typeof part === "object" && part.type === "text" && typeof part.text === "string"
      ? [part.text]
      : [],
  );
  return nonEmpty(parts.join("\n"));
}

/**
 * Reads what the list needs from the start of an OMP session file. OMP keeps a padded
 * `title` record as the first line and rewrites it in place, so the head carries the
 * current title; older files only have `title_change` / `session_info` records.
 * A chunk cut mid-line just loses that last line.
 */
export function parseSessionHead(chunk: string): SessionHead | null {
  let header: { sessionId: string; cwd: string; createdAt: string | null } | null = null;
  let pinnedTitle: string | null = null;
  let laterTitle: string | null = null;
  let firstPrompt: string | null = null;
  for (const line of chunk.split("\n")) {
    const entry = asRecord(line);
    if (!entry) continue;
    switch (entry.type) {
      case "session": {
        const sessionId = nonEmpty(entry.id);
        const cwd = nonEmpty(entry.cwd);
        if (!header && sessionId && cwd) {
          header = { sessionId, cwd, createdAt: nonEmpty(entry.timestamp) };
        }
        break;
      }
      case "title":
        pinnedTitle = nonEmpty(entry.title) ?? pinnedTitle;
        break;
      case "title_change":
        laterTitle = nonEmpty(entry.title) ?? laterTitle;
        break;
      case "session_info":
        laterTitle = nonEmpty(entry.name) ?? laterTitle;
        break;
      case "message": {
        const message = entry.message as Record<string, unknown> | undefined;
        if (!firstPrompt && message?.role === "user") firstPrompt = messageText(message.content);
        break;
      }
    }
  }
  if (!header) return null;
  return { ...header, title: pinnedTitle ?? laterTitle, firstPrompt };
}

async function readHead(file: string): Promise<string> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/** OMP and the daemon compare realpaths; fall back to the plain path when it is gone. */
export async function resolvedOrSelf(target: string): Promise<string> {
  try {
    return await realpath(target);
  } catch {
    return path.resolve(target);
  }
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  head: SessionHead | null;
  resolvedCwd: string | null;
}

export interface ScanStats {
  dirsScanned: number;
  filesSeen: number;
  filesRead: number;
}

/**
 * Lists top-level OMP sessions (subagent transcripts live in nested folders and are skipped)
 * whose recorded cwd is `folder` (scope folder) or inside one of `roots` (scope project).
 * Only candidate directories are listed; each new or changed file costs one stat and one
 * HEAD_BYTES read, unchanged files only a stat.
 */
export class OmpSessionIndex {
  readonly #cache = new Map<string, CacheEntry>();

  constructor(private readonly pathRoots: PathRoots) {}

  async list(input: {
    sessionRoots: OmpSessionRoot[];
    targets: string[];
    includeSubfolders: boolean;
  }): Promise<{ sessions: OmpSession[]; stats: ScanStats }> {
    const stats: ScanStats = { dirsScanned: 0, filesSeen: 0, filesRead: 0 };
    const targets = await Promise.all(input.targets.map(resolvedOrSelf));
    const exactNames = new Set(targets.flatMap((target) => ompDirNames(target, this.pathRoots).all));
    const isCandidate = input.includeSubfolders
      ? subtreeDirMatcher(targets, this.pathRoots)
      : (name: string) => exactNames.has(name);
    const matches = (resolvedCwd: string) =>
      input.includeSubfolders
        ? targets.some((target) => isSameOrInside(target, resolvedCwd))
        : targets.includes(resolvedCwd);
    const sessions: OmpSession[] = [];
    for (const root of input.sessionRoots) {
      let dirNames: string[];
      try {
        dirNames = (await readdir(root.dir, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch {
        continue;
      }
      const candidates = dirNames.filter(isCandidate);
      for (const dirName of candidates) {
        stats.dirsScanned += 1;
        const dir = path.join(root.dir, dirName);
        let files: string[];
        try {
          files = (await readdir(dir, { withFileTypes: true }))
            .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
            .map((entry) => path.join(dir, entry.name));
        } catch {
          continue;
        }
        stats.filesSeen += files.length;
        const read = await Promise.all(files.map((file) => this.#read(file, stats)));
        for (const item of read) {
          if (!item?.entry.head || !item.entry.resolvedCwd) continue;
          if (!matches(item.entry.resolvedCwd)) continue;
          sessions.push({
            ...item.entry.head,
            file: item.file,
            provider: root.provider,
            mtime: new Date(item.entry.mtimeMs).toISOString(),
          });
        }
      }
    }
    return { sessions, stats };
  }

  async #read(file: string, stats: ScanStats): Promise<{ file: string; entry: CacheEntry } | null> {
    let info;
    try {
      info = await stat(file);
    } catch {
      return null;
    }
    const cached = this.#cache.get(file);
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      return { file, entry: cached };
    }
    stats.filesRead += 1;
    let head: SessionHead | null = null;
    try {
      head = parseSessionHead(await readHead(file));
    } catch {
      head = null;
    }
    const entry: CacheEntry = {
      mtimeMs: info.mtimeMs,
      size: info.size,
      head,
      resolvedCwd: head ? await resolvedOrSelf(head.cwd) : null,
    };
    this.#cache.set(file, entry);
    return { file, entry };
  }
}
