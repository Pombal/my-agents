import type { PluginServerContext } from "@getpaseo/plugin/server";
import { randomUUID } from "node:crypto";
import { retitle } from "./shared/rpc";
import { conversationContext, isDefaultTitle, metadataAgent, observeTitle } from "./shared/agent-titles.mjs";
import { decideTitle } from "./server/model";
import { renameAgent } from "./server/rename";

export default function contribute(server: PluginServerContext) {
  const candidates = new Map<string, { unsubscribe: () => void; renamed: boolean; initial: string | null | undefined }>();
  const busy = new Set<string>();
  let disposed = false;
  const forget = (id: string) => { candidates.get(id)?.unsubscribe(); candidates.delete(id); };
  const created = server.on("agent.created", ({ agent }, { paseo }) => {
    // create hooks exclude internal agents. A config title means an explicit
    // name, even if it happens to equal the first prompt. Never adopt old agents.
    if (agent.title || metadataAgent(agent.title)) return;
    const state = { unsubscribe: () => {}, renamed: false, initial: undefined as string | null | undefined };
    state.unsubscribe = paseo.agents.ref(agent.id).subscribe(update => {
      if (update.kind !== "upsert") return;
      observeTitle(state, update.agent.title);
    });
    candidates.set(agent.id, state);
  });
  const ended = server.on("agent.turn_ended", async ({ agent, outcome, timeline }, { paseo }) => {
    const state = candidates.get(agent.id);
    if (!state || outcome.kind !== "completed") return;
    forget(agent.id); // Exactly one attempt, never an automatic re-check/retry.
    if (busy.has(agent.id) || state.renamed || metadataAgent(agent.title)) return;
    busy.add(agent.id);
    const started = Date.now();
    try {
      const handle = paseo.agents.ref(agent.id);
      const snapshot = await handle.refresh();
      const firstPrompt = timeline.find(item => item.type === "user_message");
      if (!snapshot || snapshot.agent.archivedAt || firstPrompt?.type !== "user_message" || !isDefaultTitle(snapshot.agent.title, firstPrompt.text)) return;
      const original = snapshot.agent.title;
      state.initial = original;
      const watch = handle.subscribe(update => {
        if (update.kind === "upsert") observeTitle(state, update.agent.title);
      });
      try {
        const decision = await decideTitle(original, conversationContext(timeline), true);
        if (!disposed && !state.renamed && decision.action === "rename") {
          if (await renameAgent(agent.id, original, decision.title)) console.info(`titles: automatic ${agent.id}: ${original} → ${decision.title} (${Date.now() - started}ms)`);
        }
      } finally { watch(); }
    } catch (error) { console.warn("titles: automatic title skipped", error); }
    finally { busy.delete(agent.id); }
  });
  const archived = server.on("agent.archived", ({ agent }) => forget(agent.id));
  server.handle(retitle, async ({ agentId }, { paseo }) => {
    if (busy.has(agentId)) throw new Error("A title check is already running for this tab");
    forget(agentId); // An explicit trigger permanently consumes automatic eligibility.
    busy.add(agentId);
    const started = Date.now();
    try {
      const handle = paseo.agents.ref(agentId);
      const snapshot = await handle.refresh();
      if (!snapshot || snapshot.agent.archivedAt) throw new Error("This tab is no longer available");
      const original = snapshot.agent.title;
      const items = [];
      let page = await handle.timeline.refetch({ direction: "tail", limit: 100, projection: "canonical" });
      for (let count = 0; count < 5; count++) {
        if (page.error) throw new Error(page.error);
        items.unshift(...page.entries.map(entry => entry.item));
        if (!page.hasOlder || !page.startCursor || items.filter(item => item.type === "user_message").length >= 6) break;
        page = await handle.timeline.refetch({ direction: "before", cursor: page.startCursor, limit: 100, projection: "canonical" });
      }
      const context = conversationContext(items);
      if (!context) throw new Error("This tab has no conversation to title yet");
      const decision = await decideTitle(original, context, false);
      if (disposed) throw new Error("Titles was disabled during generation");
      let message = `Title kept: ${original ?? "Untitled"}`;
      if (decision.action === "rename" && decision.title !== original) {
        if (!(await renameAgent(agentId, original, decision.title))) throw new Error("Title changed during the check; your newer name was preserved");
        message = `Renamed: ${original ?? "Untitled"} → ${decision.title}`;
      }
      const result = { message, latencyMs: Date.now() - started };
      await handle.timeline.append({ type: "plugin", id: randomUUID(), kind: "title-result", version: 1, data: result });
      console.info(`titles: ${agentId}: ${message} (${result.latencyMs}ms)`);
      return result;
    } finally { busy.delete(agentId); }
  });
  return () => { disposed = true; created(); ended(); archived(); for (const id of candidates.keys()) forget(id); };
}
