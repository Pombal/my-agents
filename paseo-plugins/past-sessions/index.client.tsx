import type {
  PluginClientContext,
  PluginSidebarItemProps,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { PastSessionsList } from "./client/past-sessions-list";
import { lastScreenParams, PastSessionsScreen } from "./client/screen";
import type { Scope } from "./shared/rpc";

const SCREEN_ID = "browse";
const PANEL_ID = "past-sessions";

function SidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="History"
      active={currentScreen?.screenId === SCREEN_ID}
      onPress={() => openScreen({ screenId: SCREEN_ID, params: { ...lastScreenParams } })}
    />
  );
}

function WorkspacePanel({ workspaceId, theme, layout, navigation }: PluginWorkspacePanelProps) {
  const [scope, setScope] = useState<Scope>("folder");
  return (
    <PastSessionsList
      workspaceId={workspaceId}
      scope={scope}
      onScopeChange={setScope}
      theme={theme}
      compact={layout.compact}
      navigation={navigation}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addScreen({ id: SCREEN_ID, title: "Past sessions", Component: PastSessionsScreen }),
    client.addSidebarHeaderItem({ id: SCREEN_ID, title: "Past sessions", Component: SidebarItem }),
    client.addWorkspacePanel({
      id: PANEL_ID,
      title: "Past sessions",
      icon: "History",
      context: "workspace",
      locations: ["workspace", "explorer"],
      Component: WorkspacePanel,
    }),
    client.addCommandCenterItem({
      id: "open-panel",
      title: "Past sessions for this workspace",
      icon: "History",
      keywords: ["archived", "closed", "history", "reopen", "import", "omp"],
      context: "workspace",
      onSelect({ openPanel }) {
        openPanel(PANEL_ID);
      },
    }),
  ];
  return () => {
    for (const cleanup of cleanups) void cleanup();
  };
}
