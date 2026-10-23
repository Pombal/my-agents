import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { createSettingsScreen } from "./client/settings";
import { startPolishing } from "./client/web";
import { DEFAULTS, preferences } from "./shared/preferences";

const PLUGIN_ID = "user-message-polish";

export default function contribute(client: PluginClientContext) {
  let disposed = false;
  const refresh = () => {
    client.rpc(settingsRpc(preferences.id).read, {}).then((result) => {
      if (disposed) return;
      const parsed = result.status === "ready" ? preferences.schema.safeParse(result.values) : null;
      // Unreadable settings: polish with the defaults rather than not at all.
      polisher.apply(parsed?.success ? parsed.data : DEFAULTS);
    }, () => { /* Host unreachable: keep what is drawn. */ });
  };
  // Window focus re-reads the settings in case a save announcement was missed.
  const polisher = startPolishing(refresh);
  const screen = client.addSettingsScreen({ id: "polish", title: "My messages", icon: "MessageSquareText", Component: createSettingsScreen(polisher.apply) });
  if (Platform.OS !== "web") return screen;

  // The daemon announces every settings save; `snapshot` also fires on (re)connect.
  refresh();
  const events = client.paseo.observeEvents(["status.plugin_settings_changed"]);
  events.subscribe({
    snapshot: refresh,
    update(message) {
      if (message.type === "status" && message.payload.status === "plugin_settings_changed"
        && message.payload.pluginId === PLUGIN_ID && message.payload.settingsId === preferences.id) refresh();
    },
  });
  return () => {
    disposed = true;
    void events.release().catch(() => {});
    screen();
    polisher.dispose();
  };
}
