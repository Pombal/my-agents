import type { PluginServerContext } from "@getpaseo/plugin/server";
import { btwAsk, btwChats, btwDismiss, btwList } from "./shared/btw";
import { btwRoot, dismissEntry, listEntries, markedPids, pruneOutbox, summarizeChats } from "./server/btw-outbox";
import { btwReady, isAlive, listProcesses } from "./server/omp-processes";

const PRUNE_EVERY_MS = 60 * 60_000;

export default function contribute(server: PluginServerContext) {
  const root = btwRoot();
  // Chats keep their workspace; only found ones are cached, so a missing agent is retried.
  const workspaceIds = new Map<string, string>();

  server.handle(btwChats, async (_input, { paseo }) => {
    const chats = [];
    for (const summary of await summarizeChats(root)) {
      let workspaceId = workspaceIds.get(summary.agentId);
      if (!workspaceId) {
        const found = await paseo.agents.ref(summary.agentId).refresh().catch(() => undefined);
        if (!found || found.agent.archivedAt || !found.agent.workspaceId) continue;
        workspaceId = found.agent.workspaceId;
        workspaceIds.set(summary.agentId, workspaceId);
      }
      chats.push({ ...summary, workspaceId });
    }
    return { chats };
  });

  server.handle(btwList, async ({ agentId }) => ({ entries: await listEntries(root, agentId) }));

  server.handle(btwAsk, async ({ agentId, question }, { paseo }) => {
    const found = await paseo.agents.ref(agentId).refresh();
    if (!found || found.agent.archivedAt) throw new Error("This chat is no longer available.");
    if (found.agent.provider !== "omp") throw new Error("/btw works only in OMP chats.");
    if (!btwReady(await listProcesses(), agentId, await markedPids(root, agentId))) {
      throw new Error("This OMP agent started before /btw was installed. Reload or restart the agent, then ask again.");
    }
    // /follow-up is Paseo's out-of-band path: it never cancels a running reply.
    await paseo.agents.ref(agentId).send(`/follow-up /btw ${question}`);
    return {};
  });

  server.handle(btwDismiss, async ({ agentId, id }) => {
    await dismissEntry(root, agentId, id);
    return {};
  });

  const prune = () => void pruneOutbox(root, isAlive).catch(error => console.error("/btw outbox prune failed", error));
  prune();
  const timer = setInterval(prune, PRUNE_EVERY_MS);
  return () => clearInterval(timer);
}
