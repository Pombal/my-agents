import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { copyText, Icon, Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { type ComponentType, useEffect, useRef, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { BtwEntry } from "../shared/btw";
import { type BtwStore, type ChatState, isBusy, type PendingAsk } from "./btw-store";
import { MarkdownView } from "./markdown-view";

export const BTW_ICON = "MessageCircleQuestion";

/** One row of the sheet: a record from OMP, or this client's ask that has no record yet. */
type Row = { key: string; question: string; createdAt?: number } & (
  | { kind: "answer"; entry: BtwEntry }
  | { kind: "pending"; ask: PendingAsk }
);

function rows(chat: ChatState): Row[] {
  return [
    ...chat.pending.map((ask): Row => ({ key: ask.key, question: ask.question, kind: "pending", ask })),
    ...chat.entries.map(
      (entry): Row => ({ key: entry.id, question: entry.question, createdAt: entry.createdAt, kind: "answer", entry }),
    ),
  ];
}

function ActionButton({ label, onPress, theme }: { label: string; onPress(): void; theme: PluginTheme }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function Status({ label, theme, busy }: { label: string; theme: PluginTheme; busy?: boolean }) {
  return (
    <View style={styles.status}>
      {busy ? <ActivityIndicator size="small" color={theme.colors.foregroundMuted} /> : null}
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function RowView({ row, agentId, store, theme }: { row: Row; agentId: string; store: BtwStore; theme: PluginTheme }) {
  const toast = useToast();
  const failure = row.kind === "pending" ? row.ask.error : row.entry.error;
  const entry = row.kind === "answer" ? row.entry : undefined;
  const running = row.kind === "pending" ? !row.ask.error : entry?.status === "running";

  async function copy(answer: string) {
    try {
      await copyText(answer);
      toast.show("Answer copied", { variant: "success" });
    } catch {
      toast.error("Could not copy. Select the text and copy it instead.");
    }
  }
  function dismiss() {
    store.dismiss(agentId, row.key).catch(error => toast.error(`Could not dismiss: ${String(error)}`));
  }

  return (
    <View style={[styles.row, { borderColor: theme.colors.border }]}>
      <View style={styles.question}>
        <Text selectable style={[styles.questionText, { color: theme.colors.foreground }]}>
          {row.question}
        </Text>
        {row.createdAt ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        ) : null}
      </View>
      {entry?.answer ? <MarkdownView source={entry.answer} theme={theme} /> : null}
      {row.kind === "pending" && !failure ? <Status label="Sending…" theme={theme} busy /> : null}
      {entry?.status === "running" && !entry.answer ? <Status label="Thinking…" theme={theme} busy /> : null}
      {entry?.status === "cancelled" ? <Status label="Cancelled." theme={theme} /> : null}
      {failure ? <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>{failure}</Text> : null}
      <View style={styles.actions}>
        {entry?.status === "complete" && entry.answer ? (
          <ActionButton label="Copy" onPress={() => void copy(entry.answer)} theme={theme} />
        ) : null}
        <ActionButton label={running ? "Stop" : "Dismiss"} onPress={dismiss} theme={theme} />
      </View>
    </View>
  );
}

function BtwSheet({ agentId, store, theme }: { agentId: string; store: BtwStore; theme: PluginTheme }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const chat = snapshot.chats.get(agentId);
  const open = snapshot.openAgentId === agentId && !!chat;
  return (
    <Modal
      title="Side questions"
      icon={<Icon name={BTW_ICON} size={18} color={theme.colors.foreground} />}
      open={open}
      onOpenChange={next => (next ? store.open(agentId) : store.close())}
    >
      <Modal.Content>
        {chat ? rows(chat).map(row => <RowView key={row.key} row={row} agentId={agentId} store={store} theme={theme} />) : null}
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          /btw answers use this chat's memory and are never added to the conversation.
        </Text>
      </Modal.Content>
    </Modal>
  );
}

/**
 * The composer pill's icon. It also hosts the chat's answer sheet: the pill is
 * the plugin UI that lives in a chat's composer on every client, and /btw opens
 * the sheet without a press. With the chat in several panes, the first hosts it.
 */
export function createPillIcon(store: BtwStore): ComponentType<PluginButtonIconProps> {
  return function BtwPillIcon(props: PluginButtonIconProps) {
    const agentId = props.context === "agent" ? props.agentId : "";
    const token = useRef(Symbol(agentId)).current;
    useEffect(() => (agentId ? store.claimHost(agentId, token) : undefined), [agentId, token]);
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const chat = snapshot.chats.get(agentId);
    return (
      <>
        {chat && isBusy(chat) ? (
          <ActivityIndicator size="small" color={props.color} />
        ) : (
          <Icon name={BTW_ICON} size={props.size} color={props.color} />
        )}
        {agentId && store.isHost(agentId, token) ? <BtwSheet agentId={agentId} store={store} theme={props.theme} /> : null}
      </>
    );
  };
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  question: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  questionText: { flex: 1, fontSize: 14, fontWeight: "600" },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  action: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
});
