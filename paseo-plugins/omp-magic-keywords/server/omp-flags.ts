import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { OMP_KEYWORD_WORDS, type OmpFlags } from "../shared/omp-flags";

const run = promisify(execFile);

// Settings change rarely; a client asks on every window focus.
const CACHE_MS = 60_000;
// `omp config list --json` prints every OMP setting (about 100 KB today), more than
// execFile's 1 MiB default would allow for once OMP grows.
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

const providerSchema = z.object({
  extends: z.string().optional(),
  enabled: z.boolean().optional(),
  command: z.array(z.string()).min(1).optional(),
  env: z.record(z.string(), z.string()).optional(),
});
export type ProviderEntry = z.output<typeof providerSchema>;
const configSchema = z.object({
  agents: z.object({ providers: z.record(z.string(), z.unknown()).optional() }).optional(),
});
const settingSchema = z.object({ value: z.boolean() });

/**
 * Follows `id` up its `extends` chain. The root is the first id that the config does not
 * define (a built-in such as `omp`, or the `acp` sentinel) or that extends nothing; `chain`
 * holds the configured entries on the way, base first. Null when the chain loops.
 */
function resolveChain(id: string, providers: ReadonlyMap<string, ProviderEntry>): { root: string; chain: ProviderEntry[] } | null {
  const chain: ProviderEntry[] = [];
  const seen = new Set<string>();
  for (let at = id; ; ) {
    if (seen.has(at)) return null;
    seen.add(at);
    const entry = providers.get(at);
    if (!entry) return { root: at, chain };
    chain.unshift(entry);
    if (entry.extends === undefined) return { root: at, chain };
    at = entry.extends;
  }
}

/**
 * Maps every configured provider (the raw `agents.providers` of Paseo's config) to its root,
 * and lists the enabled ones rooted at `omp` with their chains, in config order.
 */
export function resolveProviders(entries: Record<string, unknown>): { roots: Record<string, string>; omp: { id: string; chain: ProviderEntry[] }[] } {
  const providers = new Map<string, ProviderEntry>();
  for (const [id, entry] of Object.entries(entries)) {
    const parsed = providerSchema.safeParse(entry);
    if (parsed.success) providers.set(id, parsed.data);
  }
  const roots: Record<string, string> = {};
  const omp: { id: string; chain: ProviderEntry[] }[] = [];
  for (const id of Object.keys(entries)) {
    const resolved = resolveChain(id, providers);
    if (!resolved) {
      // Paseo refuses such a config; the provider counts as its own kind and is left alone.
      console.error(`[omp-magic-keywords] provider ${id} extends itself in a loop`);
      roots[id] = id;
      continue;
    }
    roots[id] = resolved.root;
    // A disabled provider runs no agents, so its flags are not worth spawning OMP for.
    if (resolved.root === "omp" && providers.get(id)?.enabled !== false) omp.push({ id, chain: resolved.chain });
  }
  return { roots, omp };
}

/**
 * The `omp config list --json` call for an OMP provider with this chain (base first), launched
 * the way Paseo launches the agent: the nearest `command` along the chain with its arguments
 * kept, else the built-in's `$OMP_COMMAND` or `omp`; each provider's env over its base's.
 */
export function ompConfigCommand(chain: readonly ProviderEntry[], baseEnv: NodeJS.ProcessEnv): { file: string; args: string[]; env: NodeJS.ProcessEnv } {
  const [file, ...args] = chain.findLast((entry) => entry.command)?.command ?? [baseEnv.OMP_COMMAND ?? "omp"];
  const env: NodeJS.ProcessEnv = Object.assign({}, baseEnv, ...chain.map((entry) => entry.env));
  return { file, args: [...args, "config", "list", "--json"], env };
}

/**
 * The words enabled in `omp config list --json` output. Null when the output has none of the
 * magic-keyword settings: an OMP that predates or renamed them, whose words are unknown.
 */
export function parseOmpFlags(stdout: string): string[] | null {
  const listed = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
  const flag = (key: string) => settingSchema.safeParse(listed[`magicKeywords.${key}`]).data?.value;
  const words = Object.entries(OMP_KEYWORD_WORDS).map(([key, word]) => ({ word, on: flag(key) }));
  const enabled = flag("enabled");
  if (enabled === undefined && words.every(({ on }) => on === undefined)) return null;
  return enabled === false ? [] : words.filter(({ on }) => on !== false).map(({ word }) => word);
}

/** Reads every configured provider's root and the enabled magic keywords of each OMP one. Never rejects. */
export async function readOmpFlags(): Promise<OmpFlags> {
  const home = resolve((process.env.PASEO_HOME ?? join(homedir(), ".paseo")).replace(/^~(?=\/|$)/, homedir()));
  let entries: Record<string, unknown>;
  try {
    entries = configSchema.parse(JSON.parse(await readFile(join(home, "config.json"), "utf8"))).agents?.providers ?? {};
  } catch (error) {
    console.error("[omp-magic-keywords] reading Paseo's provider config failed:", error instanceof Error ? error.message : error);
    return { roots: {}, words: {}, failed: [] };
  }
  const { roots, omp } = resolveProviders(entries);

  const results = await Promise.all(omp.map(async ({ id, chain }) => {
    const { file, args, env } = ompConfigCommand(chain, process.env);
    try {
      // With `env` given, execFile looks a bare command up on that env's PATH, as Paseo does.
      const { stdout } = await run(file, args, { env, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES });
      return { id, words: parseOmpFlags(stdout) };
    } catch (error) {
      console.error(`[omp-magic-keywords] omp config list failed for provider ${id}:`, error instanceof Error ? error.message : error);
      return { id, failed: true } as const;
    }
  }));
  // Built in config order rather than completion order, so an unchanged answer serialises the same.
  const words: Record<string, string[]> = {};
  const failed: string[] = [];
  for (const result of results) {
    if ("failed" in result) failed.push(result.id);
    else if (result.words) words[result.id] = result.words;
  }
  return { roots, words, failed };
}

/** The `omp-flags.read` handler: {@link readOmpFlags}, shared by all callers for {@link CACHE_MS}. */
export function createOmpFlagsHandler(): () => Promise<OmpFlags> {
  let cached: { at: number; flags: Promise<OmpFlags> } | undefined;
  return () => {
    const now = Date.now();
    if (!cached || now - cached.at >= CACHE_MS) cached = { at: now, flags: readOmpFlags() };
    return cached.flags;
  };
}
