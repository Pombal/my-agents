import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoAgent, PaseoApi } from "@getpaseo/client";
import { basename } from "node:path";
import { retitle, type RetitleResult } from "./shared/rpc";
import { settings, type Automatic } from "./shared/settings";
import { LABEL_NAMED, LABEL_UNNAMED, conversationContext, defaultTitle, readable, siblingEntry, titleOwnership } from "./shared/agent-titles.mjs";
import { exclusiveRuns } from "./shared/exclusive.mjs";
import { decideTitle, type Sibling } from "./server/model";
import { renameAgent } from "./server/rename";
import { listAgents, tabsOf } from "./server/agents";
import { openingPromptLines, recentTimeline } from "./server/timeline";
import { registerWorkspaceTitles } from "./server/workspaces";

// Manual retitles avoid the current title and this many earlier ones.
const REJECTED_MEMORY = 5;

export default function contribute(server: PluginServerContext) {
  const preferences = server.registerSettings(settings);
  const stopWorkspaces = registerWorkspaceTitles(server, preferences);
  // Agents created while the plugin runs, until their first completed turn:
  // only then is Paseo's placeholder (the first prompt line) known.
  const awaitingFirstTurn = new Set<string>();
  const rejected = new Map<string, string[]>();
  // First-prompt lines per agent. A first prompt never changes, so each
  // sibling's timeline is read at most once per run (again after a failed or empty read).
  const promptLines = new Map<string, Promise<string[]>>();
  const runs = exclusiveRuns("Already retitling this tab");
  let disposed = false;

  const automatic = async (): Promise<Automatic> => {
    const state = await preferences.read();
    return state.status === "ready" ? state.values.automatic : "off";
  };
  const forget = (agentId: string) => { awaitingFirstTurn.delete(agentId); rejected.delete(agentId); };

  const firstPromptLines = (paseo: PaseoApi, agentId: string) => {
    let lines = promptLines.get(agentId);
    if (!lines) {
      lines = openingPromptLines(paseo.agents.ref(agentId));
      promptLines.set(agentId, lines);
      // Cache only a found prompt: one read before the prompt reached the timeline gets another chance.
      lines.then(found => { if (!found.length) promptLines.delete(agentId); }, () => promptLines.delete(agentId));
    }
    return lines;
  };

  // The other tabs of this agent's workspace, as Paseo shows them (not archived).
  // Only a tab already loaded in the daemon has its timeline read; reading a stored
  // one would start its provider. A failed lookup is logged and titling goes on without siblings.
  const siblingsOf = async (paseo: PaseoApi, agent: PaseoAgent): Promise<Sibling[]> => {
    if (!agent.workspaceId) return [];
    try {
      const agents = await listAgents(paseo);
      const isTab = tabsOf(agents);
      const others = agents.filter(other => other.id !== agent.id && other.workspaceId === agent.workspaceId && !other.archivedAt && isTab(other));
      const entries = await Promise.all(others.map(async other => {
        // Only a title that is neither Titles' own nor a recorded placeholder needs the timeline.
        const lines = other.title && titleOwnership(other.title, other.labels) === "hand" && readable(other) ? await firstPromptLines(paseo, other.id) : [];
        return siblingEntry(other.title ?? null, other.labels, lines);
      }));
      return entries.filter((entry): entry is Sibling => entry !== null);
    } catch (error) {
      console.warn(`titles: siblings of ${agent.id} unavailable:`, error instanceof Error ? error.message : error);
      return [];
    }
  };

  const offCreated = server.on("agent.created", ({ agent }) => {
    // The hook carries only an explicitly configured title; Paseo's first-prompt
    // placeholder is applied later. An explicit creation name is a hand-chosen name.
    if (!agent.title) awaitingFirstTurn.add(agent.id);
  });
  const offArchived = server.on("agent.archived", ({ agent }) => { forget(agent.id); promptLines.delete(agent.id); });
  const offClosed = server.on("agent.closed", ({ agent }) => forget(agent.id));

  const offTurnEnded = server.on("agent.turn_ended", ({ agent, outcome }, { paseo }) => {
    if (outcome.kind !== "completed") return;
    const firstTurn = awaitingFirstTurn.delete(agent.id);
    const started = Date.now();
    const run = async (): Promise<string | null> => {
      const mode = await automatic();
      if (mode === "off") return firstTurn ? "automatic titles are off" : null;
      // While a retitle of this tab runs, it decides (a manual one names the tab anyway).
      return runs.run(agent.id, false, async () => {
        const handle = paseo.agents.ref(agent.id);
        const snapshot = await handle.refresh();
        if (!snapshot || snapshot.agent.archivedAt) return null;
        const title = snapshot.agent.title ?? null;
        // Paseo's placeholder is the first prompt line. The hook's timeline can lack
        // that prompt, and other user items can precede it, so read the timeline back
        // and accept any of its user messages.
        const firstItems = firstTurn ? await recentTimeline(handle) : null;
        const isPlaceholder = !!firstItems?.some(item => item.type === "user_message" && defaultTitle(item.text) === title);
        const ownership = titleOwnership(title, snapshot.agent.labels, isPlaceholder ? title : null);
        if (ownership === "hand") return firstTurn ? `left hand-chosen ${JSON.stringify(title)}` : null;
        if (ownership === "named" && mode !== "every") return null;
        // Record the placeholder before anything can fail, so a later reply still
        // names the tab, and sibling lookups know it without reading this timeline.
        const marking = ownership === "unnamed" && snapshot.agent.labels[LABEL_UNNAMED] !== title ? renameAgent(agent.id, title, null, { [LABEL_UNNAMED]: title! }) : null;
        const [items, siblings] = await Promise.all([firstItems ?? recentTimeline(handle), siblingsOf(paseo, snapshot.agent), marking]);
        const conversation = conversationContext(items);
        if (!conversation) return null;
        const workspace = basename(snapshot.agent.cwd);
        const decision = ownership === "unnamed"
          ? await decideTitle("first", { workspace, siblings, conversation })
          : await decideTitle("every", { workspace, siblings, conversation, title: title! });
        if (disposed) return "plugin stopped";
        if (decision.kind === "keep" || decision.title === title) return ownership === "named" ? `kept ${JSON.stringify(title)}` : "no subject yet";
        const result = await renameAgent(agent.id, title, decision.title, { [LABEL_NAMED]: decision.title });
        return result === "renamed" ? `${JSON.stringify(title)} → ${decision.title}` : `skipped (${result})`;
      });
    };
    void run().then(
      note => { if (note) console.info(`titles: ${firstTurn ? "first reply" : "reply"} ${agent.id}: ${note} in ${Date.now() - started} ms`); },
      error => console.warn(`titles: ${firstTurn ? "first reply" : "reply"} ${agent.id} failed:`, error instanceof Error ? error.message : error),
    );
  });

  // Stefan asked for a new title, so the current one is never kept. An automatic
  // check of the same tab finishes first. Expected failures come back as an
  // outcome: the plugin RPC wraps thrown errors in transport detail that is noise in a toast.
  server.handle(retitle, async ({ agentId }, { paseo }) => {
    const started = Date.now();
    const failed = (message: string): RetitleResult => ({ outcome: "failed", message });
    const result = await runs.run(agentId, true, async (): Promise<RetitleResult> => {
      const handle = paseo.agents.ref(agentId);
      const snapshot = await handle.refresh();
      if (!snapshot || snapshot.agent.archivedAt) return failed("This tab no longer exists");
      const current = snapshot.agent.title ?? null;
      const [items, siblings] = await Promise.all([recentTimeline(handle), siblingsOf(paseo, snapshot.agent)]);
      const conversation = conversationContext(items);
      if (!conversation) return failed("Nothing to title yet");
      const avoid = [...new Set([current, ...(rejected.get(agentId) ?? [])].filter((title): title is string => !!title))];
      const decision = await decideTitle("manual", { workspace: basename(snapshot.agent.cwd), siblings, conversation, rejected: avoid });
      if (disposed) return failed("Titles was disabled meanwhile");
      if (decision.kind === "keep") return failed("Claude found no subject to name");
      const renamed = await renameAgent(agentId, current, decision.title, { [LABEL_NAMED]: decision.title });
      if (renamed === "gone") return failed("This tab no longer exists");
      if (renamed === "changed") return failed("The tab was renamed meanwhile; that name stays");
      rejected.set(agentId, avoid.slice(0, REJECTED_MEMORY));
      return { outcome: "renamed", title: decision.title, previous: current };
    }).catch((error): RetitleResult => failed(error instanceof Error ? error.message : String(error)));
    console.info(`titles: retitle ${agentId}: ${JSON.stringify(result)} in ${Date.now() - started} ms`);
    return result!;
  });

  return () => { disposed = true; offCreated(); offArchived(); offClosed(); offTurnEnded(); stopWorkspaces(); awaitingFirstTurn.clear(); rejected.clear(); promptLines.clear(); };
}
