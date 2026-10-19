import { readFile, stat } from "node:fs/promises";
import { z } from "zod";

// Only what this plugin reads from the `paseo-recap` plugin's store; other fields pass through.
const RecapFile = z.object({
  agents: z.record(z.string(), z.object({ latest: z.object({ summary: z.string() }).nullish() }).catch({ latest: null })),
});

/** Agent id → latest summary from `paseo-recap`'s `recaps.json`; empty when unreadable. */
export function parseRecaps(json: string): Map<string, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return new Map();
  }
  const parsed = RecapFile.safeParse(raw);
  if (!parsed.success) return new Map();
  return new Map(
    Object.entries(parsed.data.agents).flatMap(([agentId, entry]) => {
      const summary = entry.latest?.summary.trim();
      return summary ? [[agentId, summary] as const] : [];
    }),
  );
}

/** Reads `recaps.json` again only when it changes. */
export class RecapStore {
  #cached: { mtimeMs: number; recaps: Map<string, string> } | null = null;

  constructor(private readonly file: string) {}

  async read(): Promise<Map<string, string>> {
    let mtimeMs: number;
    try {
      mtimeMs = (await stat(this.file)).mtimeMs;
    } catch {
      return new Map();
    }
    if (this.#cached?.mtimeMs !== mtimeMs) {
      this.#cached = { mtimeMs, recaps: parseRecaps(await readFile(this.file, "utf8").catch(() => "")) };
    }
    return this.#cached.recaps;
  }
}
