import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
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
  command: z.array(z.string()).min(1).optional(),
  env: z.record(z.string(), z.string()).optional(),
});
type Provider = z.output<typeof providerSchema>;
const configSchema = z.object({
  agents: z.object({ providers: z.record(z.string(), z.unknown()).optional() }).optional(),
});
const settingSchema = z.object({ value: z.boolean() });

/** Reads the enabled magic keywords of every Paseo provider that launches OMP. Never rejects. */
export async function readOmpFlags(): Promise<OmpFlags> {
  const home = resolve((process.env.PASEO_HOME ?? join(homedir(), ".paseo")).replace(/^~(?=\/|$)/, homedir()));
  let entries: Record<string, unknown>;
  try {
    entries = configSchema.parse(JSON.parse(await readFile(join(home, "config.json"), "utf8"))).agents?.providers ?? {};
  } catch (error) {
    console.error("[omp-magic-keywords] reading Paseo's provider config failed:", error instanceof Error ? error.message : error);
    return { providers: {} };
  }
  const providers = new Map<string, Provider>();
  for (const [id, entry] of Object.entries(entries)) {
    const parsed = providerSchema.safeParse(entry);
    if (parsed.success) providers.set(id, parsed.data);
  }

  const results = await Promise.all([...providers.keys()].map(async (id) => {
    // Paseo launches a provider with its base's env under its own, and the nearest command
    // along the `extends` chain. Bases that are built into Paseo are absent here and add nothing.
    const chain: Provider[] = [];
    const seen = new Set<string>();
    for (let at: string | undefined = id; at !== undefined && !seen.has(at); at = providers.get(at)?.extends) {
      seen.add(at);
      const provider = providers.get(at);
      if (provider) chain.unshift(provider);
    }
    const command = chain.findLast((provider) => provider.command)?.command;
    if (!command || basename(command[0]) !== "omp") return null;
    const env = Object.assign({}, process.env, ...chain.map((provider) => provider.env));
    try {
      // With `env` given, execFile looks a bare command up on that env's PATH, as Paseo does.
      const { stdout } = await run(command[0], ["config", "list", "--json"], { env, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES });
      const listed = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
      const flag = (key: string) => settingSchema.safeParse(listed[`magicKeywords.${key}`]).data?.value;
      const words = Object.entries(OMP_KEYWORD_WORDS).map(([key, word]) => ({ word, on: flag(key) }));
      const enabled = flag("enabled");
      // An OMP without these settings predates them or renamed them; the client treats it as all words.
      if (enabled === undefined && words.every(({ on }) => on === undefined)) return null;
      return [id, { words: enabled === false ? [] : words.filter(({ on }) => on !== false).map(({ word }) => word) }] as const;
    } catch (error) {
      console.error(`[omp-magic-keywords] omp config list failed for provider ${id}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }));
  return { providers: Object.fromEntries(results.filter((result) => result !== null)) };
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
