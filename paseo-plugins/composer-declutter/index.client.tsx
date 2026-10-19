import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createSettingsScreen } from "./client/settings";
import { startDecluttering } from "./client/web";
import { preferences, type Preferences } from "./shared/preferences";

export default function contribute(client: PluginClientContext) {
  const controller = startDecluttering();
  let disposed = false;
  let edited = false;
  const screen = client.addSettingsScreen({
    id: "controls",
    title: "Composer controls",
    icon: "SlidersHorizontal",
    Component: createSettingsScreen((values: Preferences) => {
      edited = true;
      if (!disposed) controller.update(values);
    }),
  });
  const command = client.addCommandCenterItem({
    id: "configure",
    title: "Configure composer controls",
    icon: "SlidersHorizontal",
    keywords: ["hide", "thinking", "access", "fast", "microphone", "voice"],
    context: "global",
    onSelect({ openSettings }) { openSettings("controls"); },
  });
  void client.rpc(settingsRpc(preferences.id).read, {}).then((result) => {
    if (disposed || edited || result.status !== "ready") return;
    const parsed = preferences.schema.safeParse(result.values);
    if (parsed.success) controller.update(parsed.data);
  }).catch(() => {
    // Fail open: controls remain visible if settings cannot be read.
  });
  return () => {
    disposed = true;
    command();
    screen();
    controller.dispose();
  };
}
