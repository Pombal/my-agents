import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoAgentHandle } from "@getpaseo/client";
import { basename } from "node:path";
import { retitle, type RetitleResult } from "./shared/rpc";
import { settings, type Automatic } from "./shared/settings";
import { LABEL_NAMED, LABEL_UNNAMED, conversationContext, defaultTitle, titleOwnership } from "./shared/agent-titles.mjs";
import { decideTitle } from "./server/model";
import { renameAgent } from "./server/rename";

// Manual retitles avoid the current title and this many earlier ones.
const REJECTED_MEMORY = 5;

export default function contribute(server: PluginServerContext) {
  const preferences = server.registerSettings(settings);
  // Agents created while the plugin runs, until their first completed turn:
  // only then is Paseo's placeholder (the first prompt line) known.
  const awaitingFirstTurn = new Set<string>();
  const rejected = new Map<string, string[]>();
  const busy = new Set<string>();
  let disposed = false;

  const exclusive = async <T>(agentId: string, work: () => Promise<T>) => {
    if (busy.has(agentId)) throw new Error("Already retitling this tab");
    busy.add(agentId);
    try { return await work(); } finally { busy.delete(agentId); }
  };
  const automatic = async (): Promise<Automatic> => {
    const state = await preferences.read();
    return state.status === "ready" ? state.values.automatic : "off";
  };
  const forget = (agentId: string) => { awaitingFirstTurn.delete(agentId); rejected.delete(agentId); };

  const offCreated = server.on("agent.created", ({ agent }) => {
    // The hook carries only an explicitly configured title; Paseo's first-prompt
    // placeholder is applied later. An explicit creation name is a hand-chosen name.
    if (!agent.title) awaitingFirstTurn.add(agent.id);
  });
  const offArchived = server.on("agent.archived", ({ agent }) => forget(agent.id));
  const offClosed = server.on("agent.closed", ({ agent }) => forget(agent.id));

  const offTurnEnded = server.on("agent.turn_ended", ({ agent, outcome }, { paseo }) => {
    if (outcome.kind !== "completed") return;
    const firstTurn = awaitingFirstTurn.delete(agent.id);
    const started = Date.now();
    const run = async (): Promise<string | null> => {
      const mode = await automatic();
      if (mode === "off") return firstTurn ? "automatic titles are off" : null;
      if (busy.has(agent.id)) return null; // A manual retitle is deciding already.
      return exclusive(agent.id, async () => {
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
        const conversation = conversationContext(firstItems ?? await recentTimeline(handle));
        if (!conversation) return null;
        const workspace = basename(snapshot.agent.cwd);
        const decision = ownership === "unnamed"
          ? await decideTitle("first", { workspace, conversation })
          : await decideTitle("every", { workspace, conversation, title: title! });
        if (disposed) return "plugin stopped";
        if (decision.kind === "keep" || decision.title === title) {
          if (ownership === "named") return `kept ${JSON.stringify(title)}`;
          // Remember the placeholder, so later replies can still name the tab.
          if (snapshot.agent.labels[LABEL_UNNAMED] !== title) await renameAgent(agent.id, title, null, { [LABEL_UNNAMED]: title! });
          return "no subject yet";
        }
        const result = await renameAgent(agent.id, title, decision.title, { [LABEL_NAMED]: decision.title });
        return result === "renamed" ? `${JSON.stringify(title)} → ${decision.title}` : `skipped (${result})`;
      });
    };
    void run().then(
      note => { if (note) console.info(`titles: ${firstTurn ? "first reply" : "reply"} ${agent.id}: ${note} in ${Date.now() - started} ms`); },
      error => console.warn(`titles: ${firstTurn ? "first reply" : "reply"} ${agent.id} failed:`, error instanceof Error ? error.message : error),
    );
  });

  // Stefan asked for a new title, so the current one is never kept. Expected
  // failures come back as an outcome: the plugin RPC wraps thrown errors in
  // transport detail that is noise in a toast.
  server.handle(retitle, async ({ agentId }, { paseo }) => {
    const started = Date.now();
    const failed = (message: string): RetitleResult => ({ outcome: "failed", message });
    const result = await exclusive(agentId, async (): Promise<RetitleResult> => {
      const handle = paseo.agents.ref(agentId);
      const snapshot = await handle.refresh();
      if (!snapshot || snapshot.agent.archivedAt) return failed("This tab no longer exists");
      const current = snapshot.agent.title ?? null;
      const conversation = conversationContext(await recentTimeline(handle));
      if (!conversation) return failed("Nothing to title yet");
      const avoid = [...new Set([current, ...(rejected.get(agentId) ?? [])].filter((title): title is string => !!title))];
      const decision = await decideTitle("manual", { workspace: basename(snapshot.agent.cwd), conversation, rejected: avoid });
      if (disposed) return failed("Titles was disabled meanwhile");
      if (decision.kind === "keep") return failed("Claude found no subject to name");
      if (avoid.some(title => title.toLocaleLowerCase() === decision.title.toLocaleLowerCase())) return failed(`Claude offered “${decision.title}” again`);
      const renamed = await renameAgent(agentId, current, decision.title, { [LABEL_NAMED]: decision.title });
      if (renamed === "gone") return failed("This tab no longer exists");
      if (renamed === "changed") return failed("The tab was renamed meanwhile; that name stays");
      rejected.set(agentId, avoid.slice(0, REJECTED_MEMORY));
      return { outcome: "renamed", title: decision.title, previous: current };
    }).catch((error): RetitleResult => failed(error instanceof Error ? error.message : String(error)));
    console.info(`titles: retitle ${agentId}: ${JSON.stringify(result)} in ${Date.now() - started} ms`);
    return result;
  });

  return () => { disposed = true; offCreated(); offArchived(); offClosed(); offTurnEnded(); awaitingFirstTurn.clear(); rejected.clear(); };
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
