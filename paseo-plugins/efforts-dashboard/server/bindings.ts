import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BindingSchema, type Binding } from "../shared/rpc";

const FileSchema = z.object({ version: z.literal(1), bindings: z.record(z.string(), BindingSchema) });

/**
 * Workspace id → effort (or "no effort"), in the plugin's own JSON file. Effort files are never
 * written; this file is the only thing the plugin stores.
 */
export class BindingStore {
  private loaded: Promise<Record<string, Binding>> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  all(): Promise<Record<string, Binding>> {
    this.loaded ??= readFile(this.file, "utf8").then(
      (text) => FileSchema.parse(JSON.parse(text)).bindings,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return {};
        throw error;
      },
    );
    return this.loaded;
  }

  async set(workspaceId: string, binding: Binding | null): Promise<void> {
    const bindings = { ...(await this.all()) };
    if (binding) bindings[workspaceId] = binding;
    else delete bindings[workspaceId];
    this.loaded = Promise.resolve(bindings);
    const text = `${JSON.stringify({ version: 1, bindings }, null, 2)}\n`;
    this.writing = this.writing.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.${process.pid}.tmp`;
      await writeFile(temp, text);
      await rename(temp, this.file);
    });
    await this.writing;
  }
}
