import type { PluginClientContext } from "@getpaseo/plugin/client";
import { EffortsPanel } from "./client/panel";
import { PANEL_ID, setClient } from "./client/runtime";
import { SettingsScreen } from "./client/settings-screen";
import { startFocusModality } from "./client/web";

export default function contribute(client: PluginClientContext) {
  setClient(client);
  const cleanups = [
    startFocusModality(),
    client.addWorkspacePanel({
      id: PANEL_ID,
      title: "Efforts",
      icon: "Map",
      context: "workspace",
      locations: ["explorer", "workspace"],
      Component: EffortsPanel,
    }),
    client.addCommandCenterItem({
      id: "open-panel",
      title: "Efforts for this workspace",
      icon: "Map",
      keywords: ["effort", "tickets", "map", "wayfinder", "scratch"],
      context: "workspace",
      onSelect({ openPanel }) {
        openPanel(PANEL_ID, { location: "explorer" });
      },
    }),
    client.addSettingsScreen({ id: "folders", title: "Efforts", icon: "Map", Component: SettingsScreen }),
  ];
  return () => {
    for (const cleanup of cleanups) void cleanup();
    setClient(null);
  };
}
