import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const StarFile = z.object({ version: z.literal(1), stars: z.record(z.string(), z.string()) });

/**
 * Starred list keys (`paseo:<agentId>`, `omp:<sessionId>`, `ext:<provider>:<sessionId>`) → when
 * starred, in one JSON file. Only this plugin's daemon-side process writes it, so the file is
 * read once and every change is written through, one write at a time.
 */
export class StarStore {
  private stars: Promise<Map<string, string>> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async keys(): Promise<string[]> {
    return [...(await this.load()).keys()];
  }

  async set(key: string, starred: boolean): Promise<string[]> {
    const stars = await this.load();
    if (starred === stars.has(key)) return [...stars.keys()];
    if (starred) stars.set(key, new Date().toISOString());
    else stars.delete(key);
    await this.save(stars);
    return [...stars.keys()];
  }

  /** Carries a star over when a session gets a new key, e.g. an OMP session imported as an agent. */
  async move(from: string, to: string): Promise<void> {
    const stars = await this.load();
    const at = stars.get(from);
    if (at === undefined) return;
    stars.delete(from);
    stars.set(to, at);
    await this.save(stars);
  }

  private load(): Promise<Map<string, string>> {
    this.stars ??= (async () => {
      let json: string;
      try {
        json = await readFile(this.file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map<string, string>();
        throw error;
      }
      return new Map(Object.entries(StarFile.parse(JSON.parse(json)).stars));
    })().catch((error: unknown) => {
      // A damaged file must not be overwritten by an empty one; retry on the next call.
      this.stars = null;
      throw new Error(`Can't read stars from ${this.file}: ${error instanceof Error ? error.message : String(error)}`);
    });
    return this.stars;
  }

  private save(stars: Map<string, string>): Promise<void> {
    const json = `${JSON.stringify({ version: 1, stars: Object.fromEntries(stars) }, null, 2)}\n`;
    const next = this.writing.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      await writeFile(temporary, json);
      await rename(temporary, this.file);
    });
    this.writing = next.catch(() => undefined);
    return next;
  }
}
