import type { PluginButtonIconProps, PluginButtonRegistration, PluginClientContext, PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { settingsRpc } from "@getpaseo/plugin";
import { useEffect } from "react";
import { AppState, Text } from "react-native";
import { linksForWorkspace } from "../shared/links";
import { headerSettings } from "../shared/settings";
import type { AgentListener, AgentSummary } from "./agents";
import { createLinksPage } from "./page";
import { linksLabel } from "./pills";
import { keepWorkspaceSubagents, LinksStore, type WorkspaceLinks } from "./store";
import { flatRows } from "./workspace";

export const PANEL_ID = "links";

/**
 * The workspace links page (a workspace panel, opened as a tab in the workspace's main area) and
 * a header button per workspace that opens it, labelled `N links` like the composer pill (Paseo
 * shows header buttons icon-only on phones). Settings → **Show header button** turns the buttons
 * off and on at once, on every workspace.
 *
 * A workspace's links are fetched when its header button first shows (its icon mounting is the
 * signal) and when its links page becomes visible; again when one of its agents finishes a turn,
 * is closed or renamed while either is on screen, else on next show. Nothing polls while idle.
 */
export function startWorkspaceLinks(client: PluginClientContext) {
  const store = new LinksStore<WorkspaceLinks>((workspaceId, subagents) => client.rpc(linksForWorkspace, { workspaceId, subagents }), keepWorkspaceSubagents);
  /** Header icons and visible links pages per workspace. */
  const onScreen = new Map<string, number>();
  /** Workspaces whose agents changed while nothing of theirs was on screen: refetch on next show. */
  const stale = new Set<string>();

  /** Marks a workspace on screen until the returned function runs; `refresh` fetches now (a page), else only when needed. */
  const show = (workspaceId: string, refresh: boolean) => {
    onScreen.set(workspaceId, (onScreen.get(workspaceId) ?? 0) + 1);
    if (stale.delete(workspaceId) || refresh || !store.get(workspaceId).data) void store.refresh(workspaceId);
    return () => {
      const left = (onScreen.get(workspaceId) ?? 1) - 1;
      if (left) onScreen.set(workspaceId, left);
      else onScreen.delete(workspaceId);
    };
  };
  const touch = (workspaceId: string) => {
    if (onScreen.has(workspaceId)) void store.refresh(workspaceId);
    else if (store.get(workspaceId).data) stale.add(workspaceId);
  };

  /** The Link icon; mounted while the workspace's header (or its overflow menu) shows the button. */
  function HeaderIcon(props: PluginButtonIconProps) {
    const { workspaceId } = props;
    useEffect(() => show(workspaceId, false), [workspaceId]);
    return <Icon name="Link" size={props.size} color={props.color} />;
  }

  // Header buttons, one per workspace, following the daemon's workspace directory.
  const buttons = new Map<string, { registration: PluginButtonRegistration; label: string }>();
  let visible = true;
  const labelOf = (workspaceId: string) => {
    const tabs = store.get(workspaceId).data?.tabs;
    return linksLabel(tabs ? flatRows(tabs, false).length : null);
  };
  const add = (workspaceId: string) => {
    if (buttons.has(workspaceId)) return;
    const label = labelOf(workspaceId);
    try {
      const registration = client.addHeaderButton({
        id: "links",
        workspaceId,
        button: {
          title: "Links in this workspace",
          icon: HeaderIcon,
          label,
          visible,
          behavior: { kind: "action", onPress: () => client.openPanel(PANEL_ID, { workspaceId }) },
        },
      });
      buttons.set(workspaceId, { registration, label });
    } catch (error) {
      console.warn("[mentioned-links] header button failed", error);
    }
  };
  const removeButton = (workspaceId: string) => {
    buttons.get(workspaceId)?.registration.remove();
    buttons.delete(workspaceId);
    stale.delete(workspaceId);
    store.forget(workspaceId);
  };
  const offStore = store.subscribe((workspaceId) => {
    const button = buttons.get(workspaceId);
    const label = labelOf(workspaceId);
    if (!button || button.label === label) return;
    button.registration.update({ label });
    button.label = label;
  });
  const setVisible = (next: boolean) => {
    if (next === visible) return;
    visible = next;
    for (const { registration } of buttons.values()) registration.update({ visible });
  };

  const lifetime = new AbortController();
  const followWorkspaces = async () => {
    const first = await client.paseo.workspaces.list({ subscribe: {} });
    const ids = new Set(first.entries.map((workspace) => workspace.id));
    // The daemon pages at 200; follow the cursor so every workspace gets its button.
    let pageInfo = first.pageInfo;
    while (pageInfo.hasMore && pageInfo.nextCursor && !lifetime.signal.aborted) {
      const page = await client.paseo.workspaces.list({ page: { limit: 200, cursor: pageInfo.nextCursor } });
      for (const workspace of page.entries) ids.add(workspace.id);
      pageInfo = page.pageInfo;
    }
    if (lifetime.signal.aborted) {
      void first.subscription.release();
      return;
    }
    const replace = (next: ReadonlySet<string>) => {
      for (const id of [...buttons.keys()]) if (!next.has(id)) removeButton(id);
      for (const id of next) add(id);
    };
    replace(ids);
    first.subscription.subscribe({
      snapshot: (snapshot) => replace(new Set(snapshot.entries.map((workspace) => workspace.id))),
      update: (message) => {
        if (message.type !== "workspace_update") return;
        const update = message.payload;
        if (update.kind === "upsert") add(update.workspace.id);
        else removeButton(update.id);
      },
    });
    lifetime.signal.addEventListener("abort", () => void first.subscription.release());
  };
  void followWorkspaces().catch((error: unknown) => {
    if (!lifetime.signal.aborted) console.warn("[mentioned-links] workspace subscription failed", error);
  });

  // Settings → Show header button: read at start and when the app comes back to the foreground
  // (another device may have changed it); this device's settings screen applies it on save.
  const readSetting = () =>
    client.rpc(settingsRpc(headerSettings.id).read, {}).then(
      (result) => {
        const parsed = result.status === "ready" ? headerSettings.schema.safeParse(result.values) : null;
        setVisible(parsed?.success ? parsed.data.showHeaderButton : true);
      },
      (error: unknown) => console.warn("[mentioned-links] reading settings failed", error),
    );
  void readSetting();
  const appState = AppState.addEventListener("change", (state) => state === "active" && void readSetting());

  function SettingsScreen({ theme }: PluginSurfaceProps) {
    const settings = useSettings(headerSettings);
    if (settings.status !== "ready") {
      return <Text style={{ color: theme.colors.foregroundMuted, padding: 16 }}>{settings.status === "loading" ? "Loading…" : settings.error}</Text>;
    }
    return (
      <SettingsSection title="Header">
        <SettingsSwitch
          label="Show header button"
          hint="The links button in each workspace's header; it opens that workspace's links as a tab. The composer pill stays either way."
          value={settings.values.showHeaderButton}
          disabled={settings.saving}
          onValueChange={(value) =>
            void settings.save({ ...settings.values, showHeaderButton: value }, settings.revision).then((ok) => ok && setVisible(value))
          }
        />
      </SettingsSection>
    );
  }

  // Agents changing what a workspace's page shows: a finished turn, a closed or renamed tab.
  const agents = new Map<string, { workspaceId: string; status: string; closed: boolean; title: string | null }>();
  const observe = (agent: AgentSummary, initial: boolean) => {
    const before = agents.get(agent.id);
    if (!agent.workspaceId || agent.internal) {
      agents.delete(agent.id);
      return;
    }
    const now = { workspaceId: agent.workspaceId, status: agent.status, closed: !!agent.archivedAt, title: agent.title ?? null };
    agents.set(agent.id, now);
    if (initial || !before) return;
    const turnEnded = before.status === "running" && now.status !== "running";
    if (turnEnded || before.closed !== now.closed || before.title !== now.title) touch(now.workspaceId);
  };
  const agentListener: AgentListener = {
    replace(list) {
      for (const agent of list) observe(agent, true);
    },
    update: (agent) => observe(agent, false),
    remove(agentId) {
      const before = agents.get(agentId);
      agents.delete(agentId);
      if (before) touch(before.workspaceId);
    },
  };

  return {
    Page: createLinksPage(store, show),
    SettingsScreen,
    agents: agentListener,
    stop() {
      lifetime.abort();
      appState.remove();
      offStore();
      for (const id of [...buttons.keys()]) removeButton(id);
    },
  };
}
