import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StarStore } from "./stars";

describe("StarStore", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "past-sessions-stars-"));
    file = path.join(dir, "nested", "stars.json");
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("keeps stars across restarts, and an imported session keeps its star under the agent's key", async () => {
    const store = new StarStore(file);
    await store.set("omp:s1", true);
    await store.set("paseo:a", true);
    await store.set("paseo:a", false);
    await store.move("omp:s1", "paseo:new");
    await store.move("omp:never-starred", "paseo:other");
    expect(await new StarStore(file).keys()).toEqual(["paseo:new"]);
  });

  it("refuses to replace a file it can't read", async () => {
    await new StarStore(file).set("paseo:a", true);
    await writeFile(file, "{ not json");
    const store = new StarStore(file);
    await expect(store.set("paseo:b", true)).rejects.toThrow(/Can't read stars/);
    expect(await readFile(file, "utf8")).toBe("{ not json");
  });
});
