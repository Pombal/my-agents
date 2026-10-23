import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { KeptAwakeReason, ProviderSleep } from "../shared/rpc";

type Paseo = PluginHandlerContext["paseo"];

// The fork's (axalon) additions to the daemon's PaseoApi. The official 0.12 client types don't
// have them, and official daemons don't either, so every use goes through `sleepApi`.
interface SleepMarker { sleptAt: string; reason: "idle" | "manual"; rssBytes: number | null }
interface SleepState {
  providers: ProviderSleep[];
  asleep: { agentId: string; provider: string; sleep: SleepMarker | null }[];
  keptAwake: { agentId: string; reason: KeptAwakeReason; since: string }[];
}
interface SleepAgents { sleepState(): Promise<SleepState> }
interface WakeHandle { wake(): Promise<{ status: string }> }

/** The fork's sleep API on this daemon, or null on a daemon that can't sleep agents. */
export function sleepApi(paseo: Paseo): SleepAgents | null {
  const agents = paseo.agents as unknown as Partial<SleepAgents>;
  return typeof agents.sleepState === "function" ? (agents as SleepAgents) : null;
}

export async function wakeAgent(paseo: Paseo, agentId: string): Promise<{ status: string }> {
  const handle = paseo.agents.ref(agentId) as unknown as Partial<WakeHandle>;
  if (typeof handle.wake !== "function") throw new Error("This Paseo server can't sleep agents.");
  const agent = await handle.wake();
  return { status: agent.status };
}

const PAGE_LIMIT = 200; // the daemon's largest page
const MAX_PAGES = 20;

/**
 * Title and workspace of the agents in `ids`, read from the agent directory (storage only, it
 * never starts an agent). Pages until every id is found; `statuses` narrows the listing.
 */
export async function describeAgents(
  paseo: Paseo,
  ids: ReadonlySet<string>,
  statuses?: ("closed" | "initializing" | "idle" | "running" | "error")[],
): Promise<Map<string, { title: string; workspaceId: string | null }>> {
  const found = new Map<string, { title: string; workspaceId: string | null }>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES && found.size < ids.size; page += 1) {
    const result = await paseo.agents.list({
      filter: { includeBackground: true, ...(statuses ? { statuses } : {}) },
      page: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
    });
    for (const { agent } of result.entries) {
      if (ids.has(agent.id)) {
        found.set(agent.id, { title: agent.title?.trim() || "Untitled chat", workspaceId: agent.workspaceId ?? null });
      }
    }
    if (!result.pageInfo.hasMore || !result.pageInfo.nextCursor) break;
    cursor = result.pageInfo.nextCursor;
  }
  return found;
}
