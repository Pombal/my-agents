import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createSettingsScreen } from "./client/settings";
import { startIcons } from "./client/web";
import { preferences, type Preferences } from "./shared/preferences";

export default function contribute(client: PluginClientContext) {
  const controller = startIcons();
  let disposed = false;
  let edited = false;
  const screen = client.addSettingsScreen({
    id: "icons", title: "Provider icons", icon: "Image",
    Component: createSettingsScreen((values: Preferences, host: string) => {
      edited = true;
      if (!disposed) controller.update(values, host);
    }),
  });
  const command = client.addCommandCenterItem({
    id: "configure", title: "Configure provider icons", icon: "Image", context: "global",
    keywords: ["logo", "provider", "image", "icon"],
    onSelect({ openSettings }) { openSettings("icons"); },
  });
  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (!disposed && update.kind === "upsert") controller.agent(update.agent.id, update.agent.provider);
  });
  void client.paseo.providers.snapshot().then((snapshot) => {
    if (!disposed) for (const entry of snapshot.entries) controller.provider(entry.provider, entry.label ?? entry.provider);
  }).catch(() => { /* Unidentified filter choices keep their default glyph. */ });
  void (async () => {
    let cursor: string | undefined;
    do {
      const page = await client.paseo.agents.list({ page: { limit: 200, ...(cursor ? { cursor } : {}) } });
      if (disposed) return;
      for (const { agent } of page.entries) controller.agent(agent.id, agent.provider);
      cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor ?? undefined : undefined;
    } while (cursor);
  })().catch(() => { /* Unidentified tabs keep their default glyph. */ });
  void client.rpc(settingsRpc(preferences.id).read, {}).then((result) => {
    if (disposed || edited || result.status !== "ready") return;
    const parsed = preferences.schema.safeParse(result.values);
    if (parsed.success) controller.update(parsed.data);
  }).catch(() => { /* Keep default icons when the host is unavailable. */ });
  return () => {
    disposed = true;
    unsubscribe();
    command();
    screen();
    controller.dispose();
  };
}
