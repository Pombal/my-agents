import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { AppState, Dimensions } from "react-native";
import type { Overview, WorkspaceInfo } from "../shared/rpc";
import { findEffort } from "./model";
import { EffortPopover } from "./popover";
import { fetchOverview, latestOverview, onOverview } from "./runtime";

/** Paseo's compact layouts are the breakpoints below `md` (720 px). */
const COMPACT_WIDTH = 720;
/** Labels refresh this often in the background (the explorer tab polls every 5 s while visible). */
const REFRESH_MS = 30_000;

/** `wa-ftue`, `bind?`, or null when the workspace shows nothing. */
function headerLabel(workspace: WorkspaceInfo): string | null {
  if (workspace.binding?.kind === "effort") return workspace.binding.slug;
  if (!workspace.binding && workspace.suggestion) return "bind?";
  return null;
}

/** `wa-ftue · 0/9 done`. */
function pillLabel(overview: Overview, workspace: WorkspaceInfo): string | null {
  if (workspace.binding?.kind !== "effort") return !workspace.binding && workspace.suggestion ? "effort: bind?" : null;
  const effort = findEffort(overview, workspace.binding.root, workspace.binding.slug);
  return effort?.counts.total ? `${effort.slug} · ${effort.counts.done}/${effort.counts.total} done` : workspace.binding.slug;
}

/**
 * One header pill per workspace (name + chevron; popover option B, a sheet on phones) and, on
 * compact layouts only, one composer pill per chat with the effort and its done count.
 */
export function startButtons(client: PluginClientContext): () => void {
  const headers = new Map<string, { registration: PluginButtonRegistration; label: string }>();
  const pills = new Map<string, { registration: PluginButtonRegistration; label: string }>();
  /** agentId → workspaceId of live chats. */
  const agents = new Map<string, string>();
  let compact = Dimensions.get("window").width < COMPACT_WIDTH;

  const sync = () => {
    const overview = latestOverview();
    if (!overview) return;
    const byId = new Map(overview.workspaces.map((workspace) => [workspace.id, workspace]));
    for (const [id, header] of headers) {
      if (byId.has(id)) continue;
      header.registration.remove();
      headers.delete(id);
    }
    for (const workspace of overview.workspaces) {
      const label = headerLabel(workspace);
      const current = headers.get(workspace.id);
      if (!label) {
        if (current) current.registration.update({ visible: false });
        continue;
      }
      if (current) {
        if (current.label !== label) current.registration.update({ label, visible: true });
        else current.registration.update({ visible: true });
        current.label = label;
        continue;
      }
      try {
        const registration = client.addHeaderButton({
          id: "effort",
          workspaceId: workspace.id,
          button: { title: "Effort of this workspace", icon: "Map", label, behavior: { kind: "popover", Content: EffortPopover } },
        });
        headers.set(workspace.id, { registration, label });
      } catch (error) {
        console.warn("[efforts] header button failed", error);
      }
    }
    for (const [agentId, pill] of pills) {
      if (agents.has(agentId)) continue;
      pill.registration.remove();
      pills.delete(agentId);
    }
    for (const [agentId, workspaceId] of agents) {
      const workspace = byId.get(workspaceId);
      const label = workspace ? pillLabel(overview, workspace) : null;
      const current = pills.get(agentId);
      if (current) {
        current.registration.update(label ? { label, visible: compact } : { visible: false });
        if (label) current.label = label;
        continue;
      }
      if (!label) continue;
      try {
        const registration = client.addComposerPill({
          id: "effort",
          workspaceId,
          agentId,
          button: { title: "Effort", icon: "Map", label, visible: compact, behavior: { kind: "popover", Content: EffortPopover } },
        });
        pills.set(agentId, { registration, label });
      } catch (error) {
        console.warn("[efforts] composer pill failed", error);
      }
    }
  };

  const lifetime = new AbortController();
  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ entries, subscription }) => {
      if (lifetime.signal.aborted) return;
      const replace = (list: readonly { agent: { id: string; workspaceId?: string; archivedAt?: string | null; internal?: boolean } }[]) => {
        agents.clear();
        for (const { agent } of list) if (agent.workspaceId && !agent.archivedAt && !agent.internal) agents.set(agent.id, agent.workspaceId);
        sync();
      };
      replace(entries);
      subscription.subscribe({
        snapshot: (snapshot) => replace(snapshot.entries),
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") agents.delete(update.agentId);
          else if (update.agent.workspaceId && !update.agent.archivedAt && !update.agent.internal) agents.set(update.agent.id, update.agent.workspaceId);
          else agents.delete(update.agent.id);
          sync();
        },
      });
    })
    .catch((error: unknown) => {
      if (!lifetime.signal.aborted) console.warn("[efforts] agent subscription failed", error);
    });

  const offOverview = onOverview(sync);
  const dimensions = Dimensions.addEventListener("change", ({ window }) => {
    const next = window.width < COMPACT_WIDTH;
    if (next === compact) return;
    compact = next;
    sync();
  });
  const refresh = () => void fetchOverview().catch((error: unknown) => console.warn("[efforts] overview failed", error));
  refresh();
  const timer = setInterval(() => AppState.currentState === "active" && refresh(), REFRESH_MS);

  return () => {
    lifetime.abort();
    offOverview();
    dimensions.remove();
    clearInterval(timer);
    headers.forEach((header) => header.registration.remove());
    pills.forEach((pill) => pill.registration.remove());
  };
}
