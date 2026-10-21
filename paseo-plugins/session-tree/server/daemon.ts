import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { z } from "zod";

// PaseoApi has no reload ("refresh") or import. Use the installed SDK's native RPCs over this
// daemon's published local endpoint, never a remote host (same as side-agent).
export async function connectLocalDaemon(): Promise<DaemonClient> {
  const configured = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
  const home = resolve(configured.replace(/^~(?=\/|$)/, homedir()));
  const instance = z.object({ pid: z.number(), listen: z.string() }).parse(JSON.parse(await readFile(join(home, "paseo.pid"), "utf8")));
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(instance.listen)) {
    throw new Error("Session tree requires this daemon's published loopback TCP endpoint.");
  }
  const client = new DaemonClient({
    url: `ws://${instance.listen}/ws`,
    clientId: `session-tree-${randomUUID()}`,
    clientType: "cli",
    localCredential: async () => (await readFile(join(home, "local-credential"), "utf8")).trim(),
    reconnect: { enabled: false },
  });
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}

/** Restarts the chat's OMP process from its session file and replays its current path in Paseo. */
export async function reloadChat(agentId: string): Promise<void> {
  const daemon = await connectLocalDaemon();
  try {
    await daemon.refreshAgent(agentId);
  } finally {
    await daemon.close();
  }
}
