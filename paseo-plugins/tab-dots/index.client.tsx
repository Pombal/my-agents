import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { watchAgents } from "./client/agents";
import { createSettingsScreen } from "./client/settings";
import { startTabDots } from "./client/web";
import { DEFAULTS, preferences, type Preferences } from "./shared/preferences";

// Sanctioned web global for re-reading settings saved in another window.
declare const window: {
  addEventListener(type: "focus", listener: () => void): void;
  removeEventListener(type: "focus", listener: () => void): void;
};

export default function contribute(client: PluginClientContext) {
  // Sidebar rows are DOM only on web and desktop; phones have nothing to draw into.
  if (Platform.OS !== "web") return () => {};
  const settings = settingsRpc(preferences.id);
  // Hidden until settings load, so a disabled plugin never flashes dots.
  const dots = startTabDots({ ...DEFAULTS, enabled: false });
  let edits = 0;
  const load = async (): Promise<{ revision: string; values: Preferences } | undefined> => {
    const result = await client.rpc(settings.read, {});
    if (result.status !== "ready") return undefined;
    const parsed = preferences.schema.safeParse(result.values);
    return parsed.success ? { revision: result.revision, values: parsed.data } : undefined;
  };
  const apply = (values: Preferences) => {
    edits += 1;
    dots.setPreferences(values);
  };
  const refresh = () => {
    const editsAtStart = edits;
    load().then((loaded) => {
      // A save made while this read was in flight is newer than what the read returned.
      if (loaded && edits === editsAtStart) dots.setPreferences(loaded.values);
    }, (error: unknown) => console.error("[tab-dots] settings read failed", error));
  };
  refresh();
  window.addEventListener("focus", refresh);
  const stopAgents = watchAgents(client, dots.setAgents);

  const screen = client.addSettingsScreen({
    id: "dots",
    title: "Tab dots",
    icon: "Ellipsis",
    Component: createSettingsScreen(apply),
  });
  const toggle = client.addCommandCenterItem({
    id: "toggle",
    title: "Toggle tab dots",
    icon: "Ellipsis",
    keywords: ["unread", "status", "dots", "sidebar", "tabs"],
    context: "global",
    async onSelect({ rpc }) {
      const loaded = await load();
      if (!loaded) return;
      const values = { ...loaded.values, enabled: !loaded.values.enabled };
      const saved = await rpc(settings.write, { revision: loaded.revision, values });
      if (saved.status === "saved") apply(values);
    },
  });
  const configure = client.addCommandCenterItem({
    id: "configure",
    title: "Tab dots settings",
    icon: "Ellipsis",
    keywords: ["unread", "status", "dots", "sidebar", "size", "time"],
    context: "global",
    onSelect({ openSettings }) { openSettings("dots"); },
  });
  return () => {
    configure();
    toggle();
    screen();
    stopAgents();
    window.removeEventListener("focus", refresh);
    dots.dispose();
  };
}
