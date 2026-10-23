import type { PluginClientContext } from "@getpaseo/plugin/client";
import { startPills } from "./client/pills";
import { SleepSettings } from "./client/settings";
import { pillsRpc, wakeRpc } from "./shared/rpc";

/** The daemon-side half may still be starting when a client connects. */
const PROBE_RETRY_MS = [2_000, 5_000, 15_000];

export default function contribute(client: PluginClientContext) {
  // Always present, so a daemon without the sleep feature can say so in one muted line.
  const removeSettings = client.addSettingsScreen({ id: "sleep", title: "Sleeping tabs", icon: "Moon", Component: SleepSettings });
  const cleanups: (() => void)[] = [];
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const start = () => {
    cleanups.push(
      startPills(client),
      client.addCommandCenterItem({
        id: "settings",
        title: "Sleeping tabs settings",
        icon: "Moon",
        keywords: ["sleep", "asleep", "wake", "idle", "memory", "ram", "freed"],
        context: "global",
        onSelect({ openSettings }) {
          openSettings("sleep");
        },
      }),
      client.addSlashCommand({
        name: "wake",
        description: "Wake this chat if it is asleep",
        argumentHint: "",
        context: "agent",
        async onSubmit({ agent, rpc }) {
          await rpc(wakeRpc, { agentId: agent.id });
        },
      }),
    );
  };

  // Only a daemon with the sleep feature gets pills, ⌘K and /wake; elsewhere nothing shows.
  const probe = (attempt: number) => {
    client.rpc(pillsRpc, {}).then(
      (result) => {
        if (!stopped && result.supported) start();
      },
      (error: unknown) => {
        if (stopped) return;
        const delay = PROBE_RETRY_MS[attempt];
        if (delay === undefined) {
          console.error("[sleeping-tabs] couldn't reach the plugin's daemon half", error);
          return;
        }
        retryTimer = setTimeout(() => probe(attempt + 1), delay);
      },
    );
  };
  probe(0);

  return () => {
    stopped = true;
    if (retryTimer !== undefined) clearTimeout(retryTimer); // React Native's typing rejects undefined
    for (const cleanup of cleanups) cleanup();
    removeSettings();
  };
}
