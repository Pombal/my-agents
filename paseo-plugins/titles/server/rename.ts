import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";

// The installed public PaseoApi has no rename operation. Use the same local RPC
// as `paseo agent update --name`, scoped to the running daemon's own home.
export async function renameAgent(agentId: string, expected: string | null, title: string) {
  const home = resolve((process.env.PASEO_HOME ?? join(homedir(), ".paseo")).replace(/^~(?=\/|$)/, homedir()));
  const instance = JSON.parse(await readFile(join(home, "paseo.pid"), "utf8"));
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(instance.listen)) throw new Error("Titles requires a local loopback daemon endpoint");
  const daemon = new DaemonClient({
    url: `ws://${instance.listen}/ws`, clientId: `titles-${randomUUID()}`, clientType: "cli",
    localCredential: async () => (await readFile(join(home, "local-credential"), "utf8")).trim(),
    reconnect: { enabled: false },
  });
  try {
    await daemon.connect();
    const result = await daemon.fetchAgent(agentId);
    if (!result || result.agent.archivedAt || result.agent.title !== expected) return false;
    await daemon.updateAgent(agentId, { name: title });
    return true;
  } finally { await daemon.close(); }
}
