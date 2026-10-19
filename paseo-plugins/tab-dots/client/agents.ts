import type { PluginClientContext } from "@getpaseo/plugin/client";
import { type AgentInfo, readAgent } from "./model";

/**
 * Live map of every non-archived agent on this host. Calls `onChange` with the whole map after
 * the first listing, each snapshot (also after a reconnect) and each update.
 * Returns a cleanup that ends the subscription.
 */
export function watchAgents(
  client: PluginClientContext,
  onChange: (agents: ReadonlyMap<string, AgentInfo>) => void,
): () => void {
  const lifetime = new AbortController();
  const agents = new Map<string, AgentInfo>();
  const replaceAll = (entries: readonly { agent: unknown }[]) => {
    agents.clear();
    for (const { agent } of entries) {
      const info = readAgent(agent);
      if (info) agents.set(info.id, info);
    }
    onChange(agents);
  };
  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ entries, subscription }) => {
      if (lifetime.signal.aborted) return;
      replaceAll(entries);
      subscription.subscribe({
        snapshot: (snapshot) => replaceAll(snapshot.entries),
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") {
            agents.delete(update.agentId);
          } else {
            const info = readAgent(update.agent);
            if (info) agents.set(info.id, info);
            else agents.delete(update.agent.id);
          }
          onChange(agents);
        },
      });
    })
    .catch((error: unknown) => {
      if (!lifetime.signal.aborted) console.error("[tab-dots] agent subscription failed", error);
    });
  return () => lifetime.abort();
}
