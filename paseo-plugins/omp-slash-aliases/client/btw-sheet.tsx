import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { copyText, Icon, Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { type ComponentType, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { BtwEntry } from "../shared/btw";
import { type BtwStore, type ChatState, isBusy, type PendingAsk } from "./btw-store";
import { plainText } from "./markdown";
import { MarkdownView } from "./markdown-view";

export const BTW_ICON = "MessageCircleQuestion";

/** Paseo's chat metadata size (timestamps, "Worked for…"). */
const META = { fontSize: 13, lineHeight: 18 };

/** One row of the sheet: a record from OMP, or this client's ask that has no record yet. Newest first. */
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

function IconButton({
  icon,
  label,
  onPress,
  onFocusChange,
  theme,
}: {
  icon: string;
  label: string;
  onPress(): void;
  onFocusChange(focused: boolean): void;
  theme: PluginTheme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      hitSlop={6}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.iconButton,
        (pressed || hovered) && { backgroundColor: theme.colors.surface2 },
      ]}
    >
      <Icon name={icon} size={14} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

function RowView({
  row,
  expanded,
  onToggle,
  touch,
  agentId,
  store,
  theme,
}: {
  row: Row;
  /** Null: the row cannot collapse (it is the only one). */
  expanded: boolean | null;
  onToggle(): void;
  /** Touch layouts show the actions all the time; pointer layouts on hover or focus. */
  touch: boolean;
  agentId: string;
  store: BtwStore;
  theme: PluginTheme;
}) {
  const toast = useToast();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const entry = row.kind === "answer" ? row.entry : undefined;
  const failure = row.kind === "pending" ? row.ask.error : entry?.error;
  const running = row.kind === "pending" ? !row.ask.error : entry?.status === "running";
  const answer = entry?.answer ?? "";
  const muted = theme.colors.foregroundMuted;

  async function copy() {
    try {
      await copyText(answer);
      setCopied(true);
    } catch {
      toast.error("Could not copy. Select the text and copy it instead.");
    }
  }
  function dismiss() {
    store.dismiss(agentId, row.key).catch(error => toast.error(`Could not dismiss: ${String(error)}`));
  }

  if (expanded === false) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show answer: ${row.question}`}
        onPress={onToggle}
        style={({ hovered: over }: { pressed: boolean; hovered?: boolean }) => [
          styles.collapsed,
          over && { backgroundColor: theme.colors.surface2 },
        ]}
      >
        <Text numberOfLines={1} style={[styles.collapsedQuestion, { color: theme.colors.foreground }]}>
          {row.question}
        </Text>
        <Text numberOfLines={1} style={[META, { color: failure ? theme.colors.statusDanger : muted }]}>
          {failure ?? (answer ? plainText(answer) : entry?.status === "cancelled" ? "Stopped" : "…")}
        </Text>
      </Pressable>
    );
  }

  const showActions = touch || hovered || focused;
  const status = running ? (row.kind === "pending" ? "Sending…" : answer ? null : "Thinking…") : null;

  return (
    <View style={styles.row} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <Pressable
        accessibilityRole={expanded === null ? undefined : "button"}
        accessibilityLabel={expanded === null ? undefined : "Collapse"}
        disabled={expanded === null}
        onPress={onToggle}
        style={[styles.bubble, { backgroundColor: theme.colors.surface2 }]}
      >
        <Text selectable style={[styles.question, { color: theme.colors.foreground }]}>
          {row.question}
        </Text>
      </Pressable>
      {running ? (
        // Under the question, so Stop stays in reach while a long answer streams below.
        <View style={styles.footer}>
          <ActivityIndicator size={12} color={muted} />
          {status ? <Text style={[META, { color: muted }]}>{status}</Text> : null}
          <Pressable accessibilityRole="button" onPress={dismiss} hitSlop={6}>
            {({ hovered: over }: { pressed: boolean; hovered?: boolean }) => (
              <Text style={[META, { color: over ? theme.colors.foreground : muted }]}>Stop</Text>
            )}
          </Pressable>
        </View>
      ) : null}
      {answer ? <MarkdownView source={answer} theme={theme} /> : null}
      {failure ? <Text style={[META, { color: theme.colors.statusDanger }]}>{failure}</Text> : null}
      {entry?.status === "cancelled" ? <Text style={[META, { color: muted }]}>Stopped</Text> : null}
      {running ? null : (
        <View
          style={[styles.footer, { opacity: showActions ? 1 : 0 }]}
          pointerEvents={showActions ? "auto" : "none"}
        >
          {entry?.status === "complete" && answer ? (
            <IconButton
              icon={copied ? "Check" : "Copy"}
              label="Copy answer"
              onPress={() => void copy()}
              onFocusChange={setFocused}
              theme={theme}
            />
          ) : null}
          <IconButton icon="X" label="Dismiss" onPress={dismiss} onFocusChange={setFocused} theme={theme} />
          {row.createdAt ? (
            <Text style={[META, { color: muted }]}>
              {new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function BtwSheet({ agentId, store, theme, touch }: { agentId: string; store: BtwStore; theme: PluginTheme; touch: boolean }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // Rows the user expanded or collapsed; the rest follow the default (newest and running ones open).
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const chat = snapshot.chats.get(agentId);
  const open = snapshot.openAgentId === agentId && !!chat;
  const list = chat ? rows(chat) : [];
  return (
    <Modal title="" open={open} onOpenChange={next => (next ? store.open(agentId) : store.close())}>
      <Modal.Content contentContainerStyle={[styles.content, touch && styles.sheetContent]}>
        {list.map((row, index) => {
          const running = row.kind === "pending" ? !row.ask.error : row.entry.status === "running";
          const expanded = list.length === 1 ? null : (toggled.get(row.key) ?? (index === 0 || running));
          return (
            <View
              key={row.key}
              style={index > 0 && [styles.divider, { borderTopColor: theme.colors.border }]}
            >
              <RowView
                row={row}
                expanded={expanded}
                onToggle={() => setToggled(prev => new Map(prev).set(row.key, !expanded))}
                touch={touch}
                agentId={agentId}
                store={store}
                theme={theme}
              />
            </View>
          );
        })}
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
    const touch = props.layout.compact || props.layout.platform !== "web";
    return (
      <>
        {chat && isBusy(chat) ? (
          <ActivityIndicator size={props.size} color={props.color} />
        ) : (
          <Icon name={BTW_ICON} size={props.size} color={props.color} />
        )}
        {agentId && store.isHost(agentId, token) ? (
          <BtwSheet agentId={agentId} store={store} theme={props.theme} touch={touch} />
        ) : null}
      </>
    );
  };
}

const styles = StyleSheet.create({
  // The desktop dialog's header (close button only) already leaves room at the top;
  // the bottom sheet's header has a rule under it.
  content: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 12, gap: 0 },
  sheetContent: { paddingTop: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 8 },
  row: { gap: 8 },
  bubble: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    borderRadius: 12,
    borderTopRightRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  question: { fontSize: 14, lineHeight: 20 },
  collapsed: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, marginHorizontal: -6, gap: 2 },
  collapsedQuestion: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  footer: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 22, marginTop: -2 },
  iconButton: { padding: 4, borderRadius: 6 },
});
