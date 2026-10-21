import type { PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { linksForAgent } from "../shared/links";
import { createLinksPopover } from "./popover";
import { hideParentSlot } from "./web";
import { LinksStore } from "./store";

interface AgentSummary {
  id: string;
  workspaceId?: string | null;
  status: string;
  archivedAt?: string | null;
  internal?: boolean;
}

/**
 * One `N links` composer pill per chat, worded like Paseo's own pills (`5 subagents`), no icon.
 * A chat's links are fetched when its pill first shows (the pill's icon slot mounting is the signal), again when its agent finishes a turn while the pill
 * shows, and on opening the popover. Nothing polls while agents are idle.
 */
export function startPills(client: PluginClientContext): () => void {
  const store = new LinksStore((agentId, subagents) => client.rpc(linksForAgent, { agentId, subagents }));
  const pills = new Map<string, { registration: PluginButtonRegistration; label: string }>();
  const statuses = new Map<string, string>();
  /** Mounted pill icons per chat: these chats are on screen. */
  const onScreen = new Map<string, number>();
  /** Chats whose agent finished a turn while their pill was hidden: refetch on next show. */
  const stale = new Set<string>();

  const labelOf = (agentId: string) => {
    const count = store.get(agentId).links?.length ?? 0;
    return count === 1 ? "1 link" : `${count} links`;
  };

  /**
   * Paseo requires an icon and always draws a 16 px slot for it. This component draws nothing and,
   * on web, hides that slot so the pill reads like Paseo's text-only pills. Native keeps an empty slot.
   * It stays mounted because its mount tells us the chat is on screen.
   */
  function PillIcon(props: PluginButtonIconProps) {
    const agentId = props.context === "agent" ? props.agentId : "";
    const ref = useRef<View>(null);
    useEffect(() => hideParentSlot(ref.current), []);
    useEffect(() => {
      if (!agentId) return;
      onScreen.set(agentId, (onScreen.get(agentId) ?? 0) + 1);
      if (!store.get(agentId).links || stale.delete(agentId)) void store.refresh(agentId);
      return () => {
        const left = (onScreen.get(agentId) ?? 1) - 1;
        if (left) onScreen.set(agentId, left);
        else onScreen.delete(agentId);
      };
    }, [agentId]);
    return <View ref={ref} />;
  }
  const Content = createLinksPopover(store);

  const offStore = store.subscribe((agentId) => {
    const pill = pills.get(agentId);
    const label = labelOf(agentId);
    if (!pill || pill.label === label) return;
    pill.registration.update({ label });
    pill.label = label;
  });

  const remove = (agentId: string) => {
    pills.get(agentId)?.registration.remove();
    pills.delete(agentId);
    statuses.delete(agentId);
    stale.delete(agentId);
    store.forget(agentId);
  };

  const observe = (agent: AgentSummary) => {
    if (!agent.workspaceId || agent.archivedAt || agent.internal) return remove(agent.id);
    const before = statuses.get(agent.id);
    statuses.set(agent.id, agent.status);
    if (before === "running" && agent.status !== "running") {
      if (onScreen.has(agent.id)) void store.refresh(agent.id);
      else if (store.get(agent.id).links) stale.add(agent.id);
    }
    if (pills.has(agent.id)) return;
    const label = labelOf(agent.id);
    const registration = client.addComposerPill({
      id: "links",
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: { title: "Mentioned links", icon: PillIcon, label, behavior: { kind: "popover", Content } },
    });
    pills.set(agent.id, { registration, label });
  };

  const lifetime = new AbortController();
  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ entries, subscription }) => {
      if (lifetime.signal.aborted) return;
      const replace = (list: readonly { agent: AgentSummary }[]) => {
        const ids = new Set(list.map(({ agent }) => agent.id));
        for (const agentId of [...pills.keys()]) if (!ids.has(agentId)) remove(agentId);
        for (const { agent } of list) observe(agent);
      };
      replace(entries);
      subscription.subscribe({
        snapshot: (snapshot) => replace(snapshot.entries),
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") remove(update.agentId);
          else observe(update.agent);
        },
      });
    })
    .catch((error: unknown) => {
      if (!lifetime.signal.aborted) console.warn("[mentioned-links] agent subscription failed", error);
    });

  return () => {
    lifetime.abort();
    offStore();
    for (const pill of pills.values()) pill.registration.remove();
    pills.clear();
  };
}
