import type { PluginClientContext } from "@getpaseo/plugin/client";
import { bindRpc, overviewRpc, type Overview } from "../shared/rpc";

/** The client context of this installation, set by `contribute`; popovers get no props for it. */
let current: PluginClientContext | null = null;

export function setClient(client: PluginClientContext | null): void {
  current = client;
}

export function client(): PluginClientContext {
  if (!current) throw new Error("Efforts plugin is not running");
  return current;
}

export const PANEL_ID = "efforts";
export const SCREEN_ID = "all";

/** Newest overview, shared by every surface and the header/composer registrations. */
let latest: Overview | null = null;
const listeners = new Set<(overview: Overview) => void>();

export function latestOverview(): Overview | null {
  return latest;
}

export function onOverview(listener: (overview: Overview) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function fetchOverview(): Promise<Overview> {
  const overview = await client().rpc(overviewRpc, {});
  latest = overview;
  listeners.forEach((listener) => listener(overview));
  return overview;
}

type Target = { kind: "effort"; root: string; slug: string } | { kind: "none" } | { kind: "clear" };

/**
 * Writes the binding, then refreshes everything that shows it. The change shows at once; RPCs
 * through the relay can take seconds.
 */
export async function bind(workspaceId: string, target: Target): Promise<void> {
  if (latest) {
    const at = new Date().toISOString();
    const binding = target.kind === "effort" ? { kind: "effort" as const, root: target.root, slug: target.slug, at } : target.kind === "none" ? { kind: "none" as const, at } : null;
    latest = {
      ...latest,
      workspaces: latest.workspaces.map((workspace) => (workspace.id === workspaceId ? { ...workspace, binding } : workspace)),
    };
    const optimistic = latest;
    listeners.forEach((listener) => listener(optimistic));
  }
  await client().rpc(bindRpc, { workspaceId, target });
  await fetchOverview();
}

export function openPanel(workspaceId: string): void {
  try {
    client().openPanel(PANEL_ID, { workspaceId, location: "explorer" });
  } catch (error) {
    // The workspace isn't in this client's state yet (or the layout has no explorer).
    console.warn("[efforts] openPanel failed", error);
  }
}

export function openAllEfforts(fromWorkspaceId?: string, effortKey?: string): void {
  const params: Record<string, string> = {};
  if (fromWorkspaceId) params.from = fromWorkspaceId;
  if (effortKey) params.effort = effortKey;
  client().openScreen({ screenId: SCREEN_ID, params });
}

/** Settings of the workspace's most recent chat (provider/model, mode, thinking), else of any chat. */
async function chatSettings(workspaceId: string) {
  const { entries } = await client().paseo.agents.list({
    filter: { includeArchived: true },
    sort: [{ key: "updated_at", direction: "desc" }],
    page: { limit: 200 },
  });
  const chats = entries.map((entry) => entry.agent).filter((agent) => !agent.internal);
  const agent = chats.find((candidate) => candidate.workspaceId === workspaceId) ?? chats[0];
  if (!agent) throw new Error("No chat to copy provider settings from");
  return {
    provider: agent.model && !agent.provider.includes("/") ? `${agent.provider}/${agent.model}` : agent.provider,
    ...(agent.currentModeId ? { modeId: agent.currentModeId } : {}),
    ...(agent.thinkingOptionId ? { thinkingOptionId: agent.thinkingOptionId } : {}),
  };
}

/** Button label for a ticket's chat: named after its type. */
export function chatVerb(type: string | null): string {
  switch (type) {
    case "grilling":
      return "Grill in new chat";
    case "prototype":
      return "Prototype in new chat";
    case "research":
      return "Research in new chat";
    default:
      return "Work in new chat";
  }
}

/**
 * Starts a chat in this workspace on one ticket, with the workspace's latest chat settings, and
 * opens it. The agent edits the files; the plugin doesn't.
 */
export async function startTicketChat(input: {
  workspaceId: string;
  effortDir: string;
  slug: string;
  ticket: { num: string; title: string; rel: string; type: string | null };
}): Promise<string> {
  const { workspaceId, effortDir, slug, ticket } = input;
  const file = `${effortDir}/${ticket.rel}`;
  const map = `${effortDir}/map.md`;
  const prompt =
    ticket.type === "grilling"
      ? `Grill ticket ${file} with the grilling skill. Read the effort's map first: ${map}`
      : `Work on ticket ${file} (${ticket.type ?? "task"}). Read the effort's map first: ${map}`;
  const config = await chatSettings(workspaceId);
  const agent = await client().paseo.workspaces.ref(workspaceId).agents.create({
    config,
    prompt,
    title: `${slug} ${ticket.num} ${ticket.title}`,
    labels: { effort: slug },
  });
  return agent.id;
}

/** Starts a chat that charts a new effort, and binds the workspace to it right away. */
export async function startNewEffort(input: { workspaceId: string; root: string; slug: string; goal: string }): Promise<string> {
  const { workspaceId, root, slug, goal } = input;
  const config = await chatSettings(workspaceId);
  const agent = await client().paseo.workspaces.ref(workspaceId).agents.create({
    config,
    prompt: `Start a new effort in ${root}/${slug}/: chart its map.md with the wayfinder skill.${goal ? ` Goal: ${goal}` : ""}`,
    title: `New effort ${slug}`,
    labels: { effort: slug },
  });
  await bind(workspaceId, { kind: "effort", root, slug });
  return agent.id;
}
