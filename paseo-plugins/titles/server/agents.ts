import type { PaseoAgent, PaseoApi } from "@getpaseo/client";
import { getParentAgentIdFromLabels, hasOpenAgentTab, isDelegatedAgent } from "@getpaseo/protocol/agent-labels";
import { isTab } from "../shared/agent-titles.mjs";

// Every agent, archived included: a workspace's first tab or a sub-agent's
// parent may be archived. Callers drop archived ones where they don't count.
export async function listAgents(paseo: PaseoApi) {
  const all: PaseoAgent[] = [];
  for (let cursor: string | undefined; ;) {
    // `includeBackground` is on the 0.12 wire schema but not in the client's option type.
    const options = { includeBackground: true, filter: { includeArchived: true }, ...(cursor ? { page: { limit: 200, cursor } } : {}) };
    const page = await paseo.agents.list(options);
    all.push(...page.entries.map(entry => entry.agent));
    cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor ?? undefined : undefined;
    if (!cursor) return all;
  }
}

// Paseo's own rule for which agents show as a workspace's tabs, over one listing.
export function tabsOf(agents: PaseoAgent[]) {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  return (agent: PaseoAgent) => isTab(agent, byId, { isDelegatedAgent, hasOpenAgentTab, getParentAgentIdFromLabels });
}
