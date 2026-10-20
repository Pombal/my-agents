import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createSettingsScreen } from "./client/settings";
import { startIcons } from "./client/web";
import { preferences, type Preferences } from "./shared/preferences";
import type { ProviderEntry } from "./shared/rows";

const PLUGIN_ID = "provider-icons";

export default function contribute(client: PluginClientContext) {
  let disposed = false;
  // Agents created after this window loaded: fetch each one once, when its tab first shows up.
  const asked = new Set<string>();
  const controller = startIcons((agentId) => {
    if (disposed || asked.has(agentId)) return;
    asked.add(agentId);
    void client.paseo.agents.ref(agentId).refresh().then((result) => {
      if (!disposed && result) controller.agent(result.agent.id, result.agent.provider);
    }).catch(() => { asked.delete(agentId); });
  });
  // The last providers list, so the settings screen can draw its rows at once.
  let providers: ProviderEntry[] | null = null;
  function seeProviders(entries: ProviderEntry[]) {
    providers = entries;
    if (!disposed) for (const entry of entries) controller.provider(entry.id, entry.label);
  }
  // What this window paints now, so the settings screen can draw it before its own read lands.
  let current: Preferences | null = null;
  function paint(values: Preferences, host?: string) {
    current = values;
    controller.update(values, host);
  }
  // Every apply bumps the generation, so a slower read can't overwrite a newer save from this window.
  let generation = 0;
  const screen = client.addSettingsScreen({
    id: "icons", title: "Provider icons", icon: "Image",
    Component: createSettingsScreen({
      apply(values: Preferences, host: string) {
        generation++;
        if (!disposed) paint(values, host);
      },
      providers: () => providers,
      seeProviders,
      values: () => current,
    }),
  });
  const command = client.addCommandCenterItem({
    id: "configure", title: "Configure provider icons", icon: "Image", context: "global",
    keywords: ["logo", "provider", "image", "icon"],
    onSelect({ openSettings }) { openSettings("icons"); },
  });
  void client.paseo.providers.snapshot().then((snapshot) => {
    seeProviders(snapshot.entries.map((entry) => ({ id: entry.provider, label: entry.label ?? entry.provider })));
  }).catch(() => { /* Model rows and provider filters fall back to component props. */ });
  void (async () => {
    let cursor: string | undefined;
    do {
      const page = await client.paseo.agents.list({ page: { limit: 200, ...(cursor ? { cursor } : {}) } });
      if (disposed) return;
      for (const { agent } of page.entries) controller.agent(agent.id, agent.provider);
      cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor ?? undefined : undefined;
    } while (cursor);
  })().catch(() => { /* Unidentified tabs keep their default glyph. */ });
  // One read at a time; a request that arrives meanwhile runs once the read finishes, so a save
  // announced mid-read is never missed.
  let reading = false;
  let again = false;
  function refresh() {
    if (reading) { again = true; return; }
    reading = true;
    again = false;
    const ticket = ++generation;
    void client.rpc(settingsRpc(preferences.id).read, {}).then((result) => {
      if (disposed || ticket !== generation || result.status !== "ready") return;
      const parsed = preferences.schema.safeParse(result.values);
      if (parsed.success) paint(parsed.data);
    }).catch(() => { /* Keep the current icons while the host is unreachable. */ }).finally(() => {
      reading = false;
      if (again && !disposed) refresh();
    });
  }
  // The daemon announces every settings save; `snapshot` also fires on (re)connect, which covers the
  // first read and anything saved while this window was disconnected.
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
    command();
    screen();
    controller.dispose();
  };
}
