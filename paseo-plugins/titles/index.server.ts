import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoAgentHandle } from "@getpaseo/client";
import { basename } from "node:path";
import { retitle, type RetitleResult } from "./shared/rpc";
import { conversationContext, defaultTitle, isShortTitle } from "./shared/agent-titles.mjs";
import { decideTitle } from "./server/model";
import { renameAgent } from "./server/rename";

export default function contribute(server: PluginServerContext) {
  // Agents created while the plugin runs, still waiting for their first completed
  // turn. Membership is the one-shot ticket: taking it out is the only attempt.
  const awaitingFirstTurn = new Set<string>();
  const busy = new Set<string>();
  let disposed = false;

  const exclusive = async <T>(agentId: string, work: () => Promise<T>) => {
    if (busy.has(agentId)) throw new Error("Already retitling this tab");
    busy.add(agentId);
    try { return await work(); } finally { busy.delete(agentId); }
  };

  const offCreated = server.on("agent.created", ({ agent }) => {
    // The hook carries only an explicitly configured title; Paseo's first-prompt
    // default is applied later. An explicit creation name is a hand-chosen name.
    if (!agent.title) awaitingFirstTurn.add(agent.id);
  });
  const offArchived = server.on("agent.archived", ({ agent }) => { awaitingFirstTurn.delete(agent.id); });
  const offClosed = server.on("agent.closed", ({ agent }) => { awaitingFirstTurn.delete(agent.id); });

  const offTurnEnded = server.on("agent.turn_ended", ({ agent, outcome, timeline }, { paseo }) => {
    if (outcome.kind !== "completed" || !awaitingFirstTurn.delete(agent.id)) return;
    const prompt = timeline.find(item => item.type === "user_message");
    const expected = prompt?.type === "user_message" ? defaultTitle(prompt.text) : null;
    if (!expected) return;
    const started = Date.now();
    void exclusive(agent.id, async () => {
      // Only Paseo's untouched default qualifies; any other name was chosen by hand.
      const snapshot = await paseo.agents.ref(agent.id).refresh();
      if (!snapshot || snapshot.agent.archivedAt) return "agent gone";
      if (snapshot.agent.title !== expected) return `kept hand-chosen ${JSON.stringify(snapshot.agent.title)}`;
      const decision = await decideTitle({ mode: "name", workspace: basename(agent.cwd), title: null, conversation: conversationContext(timeline) });
      if (decision.kind !== "rename") return "no clear subject yet; default kept";
      if (disposed) return "plugin stopped";
      const result = await renameAgent(agent.id, expected, decision.title);
      return result === "renamed" ? `→ ${decision.title}` : `skipped (${result})`;
    }).then(
      note => console.info(`titles: first turn ${agent.id}: ${note} in ${Date.now() - started} ms`),
      error => console.warn(`titles: first turn ${agent.id} failed:`, error instanceof Error ? error.message : error),
    );
  });

  // Expected failures come back as an outcome, not an exception: the plugin RPC
  // wraps thrown errors in transport detail that is noise in a toast.
  server.handle(retitle, async ({ agentId }, { paseo }) => {
    awaitingFirstTurn.delete(agentId); // An explicit check replaces the automatic one.
    const started = Date.now();
    const result = await exclusive(agentId, async (): Promise<RetitleResult> => {
      const handle = paseo.agents.ref(agentId);
      const snapshot = await handle.refresh();
      if (!snapshot || snapshot.agent.archivedAt) return { outcome: "failed", message: "This tab no longer exists" };
      const current = snapshot.agent.title ?? null;
      const conversation = conversationContext(await recentTimeline(handle));
      if (!conversation) return { outcome: "failed", message: "Nothing to title yet" };
      // Only titles already in the short format can be kept; Paseo's long default
      // or a hand-written phrase is replaced (explicit triggers may override names).
      const mode = isShortTitle(current) ? "check" : "name";
      const decision = await decideTitle({ mode, workspace: basename(snapshot.agent.cwd), title: current, conversation });
      if (disposed) return { outcome: "failed", message: "Titles was disabled meanwhile" };
      if (decision.kind === "keep" && mode === "name") return { outcome: "unclear" };
      if (decision.kind === "keep" || decision.title === current) return { outcome: "kept", title: current ?? "" };
      const renamed = await renameAgent(agentId, current, decision.title);
      if (renamed === "gone") return { outcome: "failed", message: "This tab no longer exists" };
      if (renamed === "changed") return { outcome: "failed", message: "The tab was renamed meanwhile; that name stays" };
      return { outcome: "renamed", title: decision.title };
    }).catch((error): RetitleResult => ({ outcome: "failed", message: error instanceof Error ? error.message : String(error) }));
    console.info(`titles: retitle ${agentId}: ${JSON.stringify(result)} in ${Date.now() - started} ms`);
    return result;
  });

  return () => { disposed = true; offCreated(); offArchived(); offClosed(); offTurnEnded(); awaitingFirstTurn.clear(); };
}

// Enough recent history to see the latest subjects: pages back until six user
// turns are in view, at most 500 items.
async function recentTimeline(handle: PaseoAgentHandle) {
  const items = [];
  let page = await handle.timeline.refetch({ direction: "tail", limit: 100, projection: "canonical" });
  for (let pages = 1; ; pages++) {
    if (page.error) throw new Error(page.error);
    items.unshift(...page.entries.map(entry => entry.item));
    if (pages >= 5 || !page.hasOlder || !page.startCursor || items.filter(item => item.type === "user_message").length >= 6) return items;
    page = await handle.timeline.refetch({ direction: "before", cursor: page.startCursor, limit: 100, projection: "canonical" });
  }
}
