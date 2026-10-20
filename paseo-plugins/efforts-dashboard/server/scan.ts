import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Counts, EffortSummary, TicketState } from "../shared/rpc";
import {
  bucketOf,
  firstParagraph,
  headFields,
  mapStatusShort,
  parseBlockedBy,
  shortNames,
  statusWord,
  sections,
  ticketNum,
  ticketQuestion,
  type BlockedBy,
  type Bucket,
} from "../shared/parse";

/** Folders inside an effort that never hold planning docs. */
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage"]);
/** Effort-level folders that are not efforts. `_to_organize_` holds strays (AGENTS.md rule). */
const NOT_EFFORTS = new Set(["_to_organize_", "node_modules"]);
const MAX_TEXT = 512 * 1024;

export async function realOrNull(target: string): Promise<string | null> {
  try {
    return await realpath(target);
  } catch {
    return null;
  }
}

/**
 * Default exclusions: `__share__` holds frozen copies of nilo-wayfinder's efforts, and
 * `~/tmp-archive` holds fixtures. A folder listed in the settings is scanned anyway.
 */
export function excludedByDefault(root: string, home: string): boolean {
  return root.includes(`${path.sep}__share__${path.sep}`) || root.startsWith(path.join(home, "tmp-archive") + path.sep);
}

/** `.scratch` folder for a settings entry: the folder itself, or the `.scratch` inside it. */
export async function scratchFor(folder: string, home: string): Promise<string | null> {
  const expanded = folder.trim().replace(/^~(?=$|\/)/, home);
  if (!expanded || !path.isAbsolute(expanded)) return null;
  if (path.basename(expanded) === ".scratch") return realOrNull(expanded);
  return realOrNull(path.join(expanded, ".scratch"));
}

interface CachedText {
  mtimeMs: number;
  size: number;
  text: string;
}
const texts = new Map<string, CachedText>();

/** File text, cached by mtime and size; capped at 512 KB. */
export async function readText(file: string): Promise<{ text: string; mtimeMs: number; truncated: boolean }> {
  const info = await stat(file);
  const cached = texts.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
    return { text: cached.text, mtimeMs: info.mtimeMs, truncated: info.size > MAX_TEXT };
  }
  let text: string;
  if (info.size > MAX_TEXT) {
    const handle = await open(file, "r");
    try {
      const buffer = Buffer.alloc(MAX_TEXT);
      const { bytesRead } = await handle.read(buffer, 0, MAX_TEXT, 0);
      text = buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  } else {
    text = await readFile(file, "utf8");
  }
  texts.set(file, { mtimeMs: info.mtimeMs, size: info.size, text });
  return { text, mtimeMs: info.mtimeMs, truncated: info.size > MAX_TEXT };
}

export interface ParsedTicket {
  num: string;
  rel: string;
  title: string;
  type: string | null;
  statusRaw: string | null;
  statusWord: string;
  bucket: Bucket;
  blockedByRaw: string | null;
  blockedBy: BlockedBy;
  question: string | null;
  mtimeMs: number;
}

const ticketCache = new Map<string, { mtimeMs: number; ticket: ParsedTicket }>();

async function parseTicket(effortDir: string, file: string, num: string, mtimeMs: number): Promise<ParsedTicket> {
  const abs = path.join(effortDir, "issues", file);
  const cached = ticketCache.get(abs);
  if (cached && cached.mtimeMs === mtimeMs) return cached.ticket;
  let ticket: ParsedTicket;
  try {
    const { text } = await readText(abs);
    const head = headFields(text);
    const statusRaw = head.fields.get("status") ?? null;
    const word = statusWord(statusRaw);
    const blockedByRaw = head.fields.get("blocked by") ?? null;
    ticket = {
      num,
      rel: `issues/${file}`,
      // Some titles repeat the number: `# 04 — Slice-1 spec`.
      title: (head.title ?? file.replace(/\.md$/, "")).replace(/^#?\d{1,3}\s*[—–:.)-]\s*/, ""),
      type: head.fields.get("type")?.replace(/^wayfinder:/i, "").split(/[\s,;(]/)[0].toLowerCase() || null,
      statusRaw,
      statusWord: word,
      bucket: bucketOf(word),
      blockedByRaw,
      blockedBy: parseBlockedBy(blockedByRaw),
      question: ticketQuestion(text),
      mtimeMs,
    };
  } catch {
    ticket = {
      num,
      rel: `issues/${file}`,
      title: `${file} (couldn't read)`,
      type: null,
      statusRaw: null,
      statusWord: "open",
      bucket: "open",
      blockedByRaw: null,
      blockedBy: { own: [], elsewhere: [], note: null },
      question: null,
      mtimeMs,
    };
  }
  ticketCache.set(abs, { mtimeMs, ticket });
  return ticket;
}

export interface FolderListing {
  name: string;
  files: { name: string; mtimeMs: number }[];
}

/** One effort folder, read one level deep (two for `issues/` and other first-level folders). */
export interface EffortScan {
  key: string;
  root: string;
  slug: string;
  hasMap: boolean;
  topFiles: { name: string; mtimeMs: number; size: number }[];
  folders: FolderListing[];
  tickets: ParsedTicket[];
  touchedMs: number;
}

async function listFolder(dir: string): Promise<{ name: string; mtimeMs: number }[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith(".") && (entry.isFile() || entry.isSymbolicLink()))
      .map(async (entry) => {
        try {
          const info = await stat(path.join(dir, entry.name));
          return info.isFile() ? { name: entry.name, mtimeMs: info.mtimeMs } : null;
        } catch {
          return null;
        }
      }),
  );
  return files.filter((file): file is { name: string; mtimeMs: number } => file !== null);
}

export async function scanEffort(root: string, slug: string): Promise<EffortScan | null> {
  const dir = path.join(root, slug);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const topFiles: { name: string; mtimeMs: number; size: number }[] = [];
  const folders: FolderListing[] = [];
  let hasIssues = false;
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith(".")) return;
      const abs = path.join(dir, entry.name);
      let info;
      try {
        info = await stat(abs);
      } catch {
        return;
      }
      if (info.isFile()) topFiles.push({ name: entry.name, mtimeMs: info.mtimeMs, size: info.size });
      else if (info.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        if (entry.name === "issues") hasIssues = true;
        folders.push({ name: entry.name, files: await listFolder(abs) });
      }
    }),
  );
  const hasMap = topFiles.some((file) => file.name === "map.md");
  const hasMarkdown = topFiles.some((file) => file.name.endsWith(".md"));
  if (!hasMap && !hasIssues && !hasMarkdown) return null;
  topFiles.sort((a, b) => a.name.localeCompare(b.name));
  folders.sort((a, b) => a.name.localeCompare(b.name));
  const issues = folders.find((folder) => folder.name === "issues");
  const tickets = (
    await Promise.all(
      (issues?.files ?? []).map((file) => {
        const num = file.name.endsWith(".md") ? ticketNum(file.name) : null;
        return num ? parseTicket(dir, file.name, num, file.mtimeMs) : null;
      }),
    )
  )
    .filter((ticket): ticket is ParsedTicket => ticket !== null)
    .sort((a, b) => Number(a.num) - Number(b.num) || a.rel.localeCompare(b.rel));
  const touchedMs = Math.max(
    0,
    ...topFiles.map((file) => file.mtimeMs),
    ...folders.flatMap((folder) => folder.files.map((file) => file.mtimeMs)),
  );
  return {
    key: dir,
    root,
    slug,
    hasMap,
    topFiles,
    folders,
    tickets,
    touchedMs,
  };
}

/** Every effort in a `.scratch` folder; folders with no map, issues or Markdown are skipped. */
export async function scanRoot(root: string): Promise<EffortScan[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const scans = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith(".") && !NOT_EFFORTS.has(entry.name))
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => scanEffort(root, entry.name)),
  );
  return scans.filter((scan): scan is EffortScan => scan !== null);
}

export interface Resolved {
  state: Map<string, TicketState>;
  /** Not-done own blockers per ticket. */
  after: Map<string, string[]>;
  afterElsewhere: Map<string, string[]>;
  blocks: Map<string, string[]>;
  counts: Counts;
  next: { num: string; title: string } | null;
}

/** Looks up `chat-widgets` in `02, chat-widgets 08`: exact slug, short name or slug suffix. */
export function findSibling(scans: readonly EffortScan[], shorts: Map<string, string>, name: string): EffortScan | null {
  return (
    scans.find((scan) => scan.slug === name) ??
    scans.find((scan) => shorts.get(scan.slug) === name) ??
    scans.find((scan) => scan.slug.endsWith(`-${name}`)) ??
    null
  );
}

/**
 * Ticket states: `ready` when open and every own `Blocked by` ticket is done (numbers that name
 * no ticket are ignored); `blocked` otherwise; cross-effort references block while the other
 * effort's ticket is not done.
 */
export function resolveTickets(scan: EffortScan, siblings: readonly EffortScan[], shorts: Map<string, string>): Resolved {
  const byNum = new Map(scan.tickets.map((ticket) => [ticket.num, ticket]));
  const state = new Map<string, TicketState>();
  const after = new Map<string, string[]>();
  const afterElsewhere = new Map<string, string[]>();
  const blocks = new Map<string, string[]>();
  for (const ticket of scan.tickets) {
    if (ticket.bucket !== "open") {
      state.set(ticket.num, ticket.bucket === "claimed" ? "claimed" : ticket.bucket);
      continue;
    }
    const own = ticket.blockedBy.own.filter((num) => num !== ticket.num && byNum.has(num) && byNum.get(num)!.bucket !== "done");
    const elsewhere = ticket.blockedBy.elsewhere
      .filter(({ effort, num }) => {
        const other = findSibling(siblings, shorts, effort);
        const blocker = other?.tickets.find((candidate) => candidate.num === num);
        return blocker ? blocker.bucket !== "done" : false;
      })
      .map(({ effort, num }) => `${effort} ${num}`);
    after.set(ticket.num, own);
    afterElsewhere.set(ticket.num, elsewhere);
    state.set(ticket.num, own.length || elsewhere.length ? "blocked" : "ready");
    for (const num of own) blocks.set(num, [...(blocks.get(num) ?? []), ticket.num]);
  }
  const counts: Counts = { total: scan.tickets.length, done: 0, ready: 0, claimed: 0, blocked: 0, parked: 0 };
  for (const value of state.values()) counts[value]++;
  const first = scan.tickets.find((ticket) => state.get(ticket.num) === "ready");
  return { state, after, afterElsewhere, blocks, counts, next: first ? { num: first.num, title: first.title } : null };
}

interface EffortHead {
  status: string | null;
  title: string | null;
  destination: string | null;
}
const headCache = new Map<string, { mtimeMs: number; head: EffortHead }>();

/**
 * Title, Status and Destination from map.md; without a map, the title is the first `# ` of the
 * biggest top-level Markdown file (`paseo-grievances/paseo-grievances.md`).
 */
async function effortHead(scan: EffortScan): Promise<EffortHead> {
  const source = scan.hasMap
    ? scan.topFiles.find((file) => file.name === "map.md")
    : [...scan.topFiles].filter((file) => file.name.endsWith(".md")).sort((a, b) => b.size - a.size)[0];
  if (!source) return { status: null, title: null, destination: null };
  const file = path.join(scan.key, source.name);
  const cached = headCache.get(file);
  if (cached && cached.mtimeMs === source.mtimeMs) return cached.head;
  try {
    const text = (await readText(file)).text;
    const fields = headFields(text);
    const destination = scan.hasMap ? sections(text).find((section) => /^destination$/i.test(section.heading)) : undefined;
    const head = {
      status: scan.hasMap ? (fields.fields.get("status") ?? null) : null,
      title: fields.title,
      destination: destination ? firstParagraph(destination.body) : null,
    };
    headCache.set(file, { mtimeMs: source.mtimeMs, head });
    return head;
  } catch {
    return { status: null, title: null, destination: null };
  }
}

/** What the Next column says when no ticket is ready. */
function stateWordOf(counts: Counts, hasMap: boolean, mapStatus: string | null): string {
  if (!counts.total) return `no tickets · ${mapStatus ?? (hasMap ? "map only" : "no map")}`;
  if (counts.ready) return "";
  if (counts.done === counts.total) return "all done";
  const left = counts.total - counts.done;
  if (counts.parked === left) return "all parked";
  if (counts.claimed === left) return "all claimed";
  if (counts.blocked === left) return "all blocked";
  return "nothing ready";
}

export async function summarize(
  scan: EffortScan,
  siblings: readonly EffortScan[],
  shorts: Map<string, string>,
): Promise<EffortSummary> {
  const resolved = resolveTickets(scan, siblings, shorts);
  const head = await effortHead(scan);
  const mapStatus = mapStatusShort(head.status);
  const stateWord = stateWordOf(resolved.counts, scan.hasMap, mapStatus);
  return {
    key: scan.key,
    root: scan.root,
    slug: scan.slug,
    short: shorts.get(scan.slug) ?? scan.slug,
    title: head.title,
    mapStatus,
    destination: head.destination,
    counts: resolved.counts,
    next: resolved.next,
    touchedMs: scan.touchedMs,
    hasMap: scan.hasMap,
    stateWord,
  };
}

export function shortsFor(scans: readonly EffortScan[]): Map<string, string> {
  return shortNames(scans.map((scan) => scan.slug));
}

/** The effort's sibling artefact folder: `<repo>/.artifacts/<slug>/`. */
export function artifactsDir(root: string, slug: string): string {
  return path.join(path.dirname(root), ".artifacts", slug);
}

const ARTIFACT_COUNT_CAP = 999;
const ARTIFACT_LIST_CAP = 200;

/**
 * Files under `.artifacts/<slug>/`, newest first, hidden folders and node_modules skipped.
 * Counting stops at 999 (one effort's has ~14,000 files); 200 are listed.
 */
export async function listArtifacts(dir: string): Promise<{ count: number; more: boolean; files: { rel: string; mtimeMs: number }[] }> {
  const files: { rel: string; mtimeMs: number }[] = [];
  let count = 0;
  const walk = async (folder: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (count > ARTIFACT_COUNT_CAP) return;
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(folder, entry.name), rel);
      else if (entry.isFile()) {
        count++;
        if (files.length < ARTIFACT_LIST_CAP * 4) {
          const info = await stat(path.join(folder, entry.name)).catch(() => null);
          if (info) files.push({ rel, mtimeMs: info.mtimeMs });
        }
      }
    }
  };
  await walk(dir, "");
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { count: Math.min(count, ARTIFACT_COUNT_CAP), more: count > ARTIFACT_COUNT_CAP, files: files.slice(0, ARTIFACT_LIST_CAP) };
}
