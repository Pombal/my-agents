import { settingsRpc } from "@getpaseo/plugin";
import type { PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { createCommandsPopover, reopenOnFilterEscape } from "./client/popover";
import { createSettingsScreen } from "./client/settings";
import { trackPill } from "./client/web";
import { SLASH_NAME } from "./shared/commands";
import { sendCommand, slashCatalog } from "./shared/rpc";
import { settings, type Settings } from "./shared/settings";

interface AgentSummary {
  id: string;
  workspaceId?: string | null;
  cwd: string;
  archivedAt?: string | null;
  internal?: boolean;
}

/** The pill's square-slash icon; on web its DOM node also tells where this chat's message box is. */
function PillIcon(props: PluginButtonIconProps) {
  const agentId = props.context === "agent" ? props.agentId : "";
  const ref = useRef<View>(null);
  useEffect(() => trackPill(agentId, ref.current), [agentId]);
  return <View ref={ref}><Icon name="SquareSlash" size={props.size} color={props.color} /></View>;
}

export default function contribute(client: PluginClientContext) {
  const Content = createCommandsPopover(client, () => syncSoon());

  // One `cmds` pill per chat (Paseo has no every-chat pill), following the agent list.
  const pills = new Map<string, PluginButtonRegistration>();
  const cwds = new Map<string, string>();
  const removeAgent = (agentId: string) => {
    pills.get(agentId)?.remove();
    pills.delete(agentId);
    cwds.delete(agentId);
  };
  const observe = (agent: AgentSummary) => {
    if (!agent.workspaceId || agent.archivedAt || agent.internal) return removeAgent(agent.id);
    cwds.set(agent.id, agent.cwd);
    if (pills.has(agent.id)) return;
    pills.set(agent.id, client.addComposerPill({
      id: "cmds",
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: { title: "Commands", icon: PillIcon, label: "cmds", behavior: { kind: "popover", Content } },
    }));
  };

  // "Commands in the / menu": the union of names over every chat's folder. On submit the daemon
  // expands this chat's file; a name this chat doesn't have goes to the agent unchanged.
  const slash = new Map<string, { key: string; remove(): void }>();
  let slashMenu = false;
  let syncing = Promise.resolve();
  const syncSlash = () => {
    syncing = syncing.then(async () => {
      const wanted = slashMenu ? (await client.rpc(slashCatalog, { cwds: [...new Set(cwds.values())] })).commands : [];
      const keep = new Set<string>();
      for (const command of wanted) {
        if (!SLASH_NAME.test(command.name)) continue;
        const description = command.description || "Command file";
        const key = `${description}\n${command.argumentHint}`;
        keep.add(command.name);
        const existing = slash.get(command.name);
        if (existing?.key === key) continue;
        existing?.remove();
        slash.set(command.name, {
          key,
          remove: client.addSlashCommand({
            name: command.name,
            description,
            argumentHint: command.argumentHint,
            context: "agent",
            async onSubmit({ args, agent, paseo }) {
              const result = await client.rpc(sendCommand, { agentId: agent.id, name: command.name, args });
              if (!result.sent) await paseo.agents.ref(agent.id).send(`/${command.name}${args ? ` ${args}` : ""}`);
            },
          }),
        });
      }
      for (const [name, entry] of slash) {
        if (keep.has(name)) continue;
        entry.remove();
        slash.delete(name);
      }
    }).catch((error: unknown) => console.warn("[agent-commands] / menu sync failed", error));
  };
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  const syncSoon = () => {
    if (!slashMenu) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncSlash, 500);
  };
  const applySettings = (values: Settings) => {
    slashMenu = values.slashMenu;
    syncSlash();
  };
  void client.rpc(settingsRpc(settings.id).read, {}).then((result) => {
    const parsed = result.status === "ready" ? settings.schema.safeParse(result.values) : null;
    if (parsed?.success) applySettings(parsed.data);
  }, (error: unknown) => console.warn("[agent-commands] settings read failed", error));

  const lifetime = new AbortController();
  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ entries, subscription }) => {
      if (lifetime.signal.aborted) return;
      const replace = (list: readonly { agent: AgentSummary }[]) => {
        const ids = new Set(list.map(({ agent }) => agent.id));
        for (const agentId of [...pills.keys()]) if (!ids.has(agentId)) removeAgent(agentId);
        for (const { agent } of list) observe(agent);
        syncSoon();
      };
      replace(entries);
      subscription.subscribe({
        snapshot: (snapshot) => replace(snapshot.entries),
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          const before = cwds.size;
          if (update.kind === "remove") removeAgent(update.agentId);
          else observe(update.agent);
          if (cwds.size !== before) syncSoon();
        },
      });
    })
    .catch((error: unknown) => {
      if (!lifetime.signal.aborted) console.warn("[agent-commands] agent subscription failed", error);
    });

  const cleanups = [
    client.addSettingsScreen({ id: "commands", title: "Agent commands", icon: "SquareSlash", Component: createSettingsScreen(applySettings) }),
    reopenOnFilterEscape(),
  ];
  return () => {
    lifetime.abort();
    clearTimeout(syncTimer);
    cleanups.forEach((cleanup) => void cleanup());
    pills.forEach((pill) => pill.remove());
    slash.forEach((entry) => entry.remove());
  };
}
