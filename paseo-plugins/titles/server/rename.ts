import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";

export type RenameOutcome = "renamed" | "changed" | "gone";

// The public PaseoApi (0.11.4) cannot rename agents. Use the same local RPC as
// `paseo agent update --name`, against this daemon's own loopback endpoint.
// Compare-and-set: the title must still be `expected` right before the update,
// so a name typed by hand while the model was thinking always wins.
export async function renameAgent(agentId: string, expected: string | null, title: string): Promise<RenameOutcome> {
  const home = resolve((process.env.PASEO_HOME ?? join(homedir(), ".paseo")).replace(/^~(?=\/|$)/, homedir()));
  const instance = JSON.parse(await readFile(join(home, "paseo.pid"), "utf8"));
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(instance.listen)) throw new Error("Titles needs a local loopback daemon endpoint");
  const daemon = new DaemonClient({
    url: `ws://${instance.listen}/ws`, clientId: `titles-${randomUUID()}`, clientType: "cli",
    localCredential: async () => (await readFile(join(home, "local-credential"), "utf8")).trim(),
    reconnect: { enabled: false },
  });
  try {
    await daemon.connect();
    const result = await daemon.fetchAgent(agentId);
    if (!result || result.agent.archivedAt) return "gone";
    if ((result.agent.title ?? null) !== expected) return "changed";
    await daemon.updateAgent(agentId, { name: title });
    return "renamed";
  } finally { await daemon.close(); }
}
