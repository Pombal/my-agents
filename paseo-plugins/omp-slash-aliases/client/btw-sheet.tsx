import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { copyText, Icon, Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { type ComponentType, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { BtwEntry } from "../shared/btw";
import { type BtwStore, type ChatState, formatDuration, formatElapsed, isBusy, type PendingAsk } from "./btw-store";
import { plainText } from "./markdown";
import { MarkdownView } from "./markdown-view";

export const BTW_ICON = "MessageCircleQuestion";

/** Strip text: Paseo's small size. */
const SMALL = { fontSize: 12, lineHeight: 16 };
const TINY = { fontSize: 11, lineHeight: 16 };

/**
 * Web only: a long open card keeps its question strip at the top of the sheet and its
 * status/actions strip at the bottom while you scroll through the answer. Native
 * clients have no sticky positioning, so there the strips scroll with the card.
 */
// -1: the scroll area can sit on a fractional pixel, which let a sliver of answer text show past the strip.
const STICK_TOP = Platform.OS === "web" ? ({ position: "sticky", top: -1, zIndex: 1 } as unknown as ViewStyle) : null;
const STICK_BOTTOM =
  Platform.OS === "web" ? ({ position: "sticky", bottom: -1, zIndex: 1 } as unknown as ViewStyle) : null;

/** One card: a record from OMP, or this client's ask that has no record yet. Newest first. */
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

function isRunning(row: Row): boolean {
  return row.kind === "pending" ? !row.ask.error : row.entry.status === "running";
}

/** The current time, ticking every second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return active ? now : Date.now();
}

function StripButton({
  icon,
  label,
  onPress,
  quiet,
  framed,
  onFocusChange,
  theme,
}: {
  icon: string;
  label: string;
  onPress(): void;
  /** Half-visible until the card is hovered or a button is focused. */
  quiet?: boolean;
  /** Stop: the one action that matters while an answer runs. */
  framed?: boolean;
  onFocusChange?(focused: boolean): void;
  theme: PluginTheme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
      hitSlop={4}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.stripButton,
        framed && { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface2 },
        (pressed || hovered) && { backgroundColor: theme.colors.surface2 },
        quiet && { opacity: 0.5 },
      ]}
    >
      {({ hovered }: { pressed: boolean; hovered?: boolean }) => {
        const color = framed || hovered ? theme.colors.foreground : theme.colors.foregroundMuted;
        return (
          <>
            <Icon name={icon} size={12} color={color} />
            <Text style={[SMALL, { color }]}>{label}</Text>
          </>
        );
      }}
    </Pressable>
  );
}

function FoldedCard({ row, onOpen, theme }: { row: Row; onOpen(): void; theme: PluginTheme }) {
  const entry = row.kind === "answer" ? row.entry : undefined;
  const failure = row.kind === "pending" ? row.ask.error : entry?.error;
  const muted = theme.colors.foregroundMuted;
  const preview = failure ?? (entry?.answer ? plainText(entry.answer) : entry?.status === "cancelled" ? "Stopped" : "…");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Show answer: ${row.question}`}
      onPress={onOpen}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.card,
        styles.folded,
        { borderColor: theme.colors.border, backgroundColor: hovered ? theme.colors.surface2 : theme.colors.surface0 },
      ]}
    >
      <View style={styles.chevron}>
        <Icon name="ChevronRight" size={12} color={muted} />
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.question, { color: theme.colors.foreground, opacity: 0.85 }]}>
          {row.question}
        </Text>
        <Text numberOfLines={1} style={[SMALL, { color: failure ? theme.colors.statusDanger : muted }]}>
          {preview}
        </Text>
      </View>
      {row.createdAt ? <Text style={[TINY, styles.time, { color: muted }]}>{new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text> : null}
    </Pressable>
  );
}

function OpenCard({
  row,
  onFold,
  touch,
  agentId,
  store,
  theme,
}: {
  row: Row;
  /** Absent when the card is the only one. */
  onFold?: () => void;
  /** Touch layouts show the actions at full strength; pointer layouts on hover or focus. */
  touch: boolean;
  agentId: string;
  store: BtwStore;
  theme: PluginTheme;
}) {
  const toast = useToast();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [fullQuestion, setFullQuestion] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const entry = row.kind === "answer" ? row.entry : undefined;
  const running = isRunning(row);
  const now = useNow(running);
  const answer = entry?.answer ?? "";
  const failure =
    row.kind === "pending"
      ? row.ask.error
      : (entry?.error ?? (entry?.status === "interrupted" ? "Interrupted: the OMP process stopped." : undefined));
  const muted = theme.colors.foregroundMuted;
  const strip = { backgroundColor: theme.colors.surface1, borderColor: theme.colors.border };

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

  let status: ReactNode;
  if (running) {
    const phase = row.kind === "pending" ? "Sending…" : answer ? "Writing…" : "Thinking…";
    status = (
      <>
        <ActivityIndicator size={12} color={muted} />
        <Text style={[SMALL, { color: muted }]}>
          {phase} {formatElapsed(now - (row.kind === "pending" ? row.ask.sentAt : row.entry.createdAt))}
        </Text>
      </>
    );
  } else if (failure) {
    status = (
      <>
        <Icon name="CircleAlert" size={12} color={theme.colors.statusDanger} />
        <Text numberOfLines={2} style={[SMALL, styles.flex, { color: theme.colors.statusDanger }]}>
          {failure}
        </Text>
      </>
    );
  } else if (entry?.status === "complete") {
    status = (
      <>
        <Icon name="Check" size={12} color={muted} />
        <Text style={[SMALL, { color: muted }]}>Answered in {formatDuration(entry.updatedAt - entry.createdAt)}</Text>
      </>
    );
  } else {
    status = <Text style={[SMALL, { color: muted }]}>Stopped</Text>;
  }

  const quiet = !touch && !hovered && !focused;
  return (
    <View
      style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface0 }]}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <View style={[styles.header, STICK_TOP, strip]}>
        {onFold ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Fold" onPress={onFold} hitSlop={6} style={styles.chevron}>
            <Icon name="ChevronDown" size={12} color={muted} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fullQuestion ? "Shorten question" : "Show whole question"}
          onPress={() => setFullQuestion(full => !full)}
          style={styles.flex}
        >
          <Text selectable numberOfLines={fullQuestion ? undefined : 2} style={[styles.question, { color: muted }]}>
            {row.question}
          </Text>
        </Pressable>
        {row.createdAt ? <Text style={[TINY, styles.time, { color: muted }]}>{new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text> : null}
      </View>
      {answer ? (
        <View style={styles.body}>
          <MarkdownView source={answer} theme={theme} />
        </View>
      ) : null}
      <View style={[styles.footer, STICK_BOTTOM, strip, !answer && styles.footerAlone]}>
        <View style={styles.status}>{status}</View>
        {running ? (
          <StripButton icon="Square" label="Stop" onPress={dismiss} framed theme={theme} />
        ) : (
          <>
            {entry?.status === "complete" && answer ? (
              <StripButton
                icon={copied ? "Check" : "Copy"}
                label={copied ? "Copied" : "Copy"}
                onPress={() => void copy()}
                quiet={quiet}
                onFocusChange={setFocused}
                theme={theme}
              />
            ) : null}
            <StripButton icon="X" label="Dismiss" onPress={dismiss} quiet={quiet} onFocusChange={setFocused} theme={theme} />
          </>
        )}
      </View>
    </View>
  );
}

function BtwSheet({ agentId, store, theme, touch }: { agentId: string; store: BtwStore; theme: PluginTheme; touch: boolean }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // Cards the user opened or folded; the rest follow the default (newest and running ones open).
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const chat = snapshot.chats.get(agentId);
  const open = snapshot.openAgentId === agentId && !!chat;
  const list = chat ? rows(chat) : [];
  const toggle = (key: string, next: boolean) => setToggled(prev => new Map(prev).set(key, next));
  const muted = theme.colors.foregroundMuted;
  // A plugin cannot restyle the host's title, so the sheet's one line of orientation
  // goes in the header's leading slot, small and muted, with an empty title.
  const caption = (
    <Text numberOfLines={1} style={[SMALL, { color: muted }]}>
      <Text style={{ color: theme.colors.foreground }}>/btw</Text>
      {list.length > 1 ? ` · ${list.length}` : ""}
      {touch ? " · not added to the chat" : " · from this chat's memory, not added to it"}
    </Text>
  );
  return (
    <Modal title="" icon={caption} open={open} onOpenChange={next => (next ? store.open(agentId) : store.close())}>
      <Modal.Content contentContainerStyle={[styles.content, touch && styles.contentTouch]}>
        {list.map((row, index) => {
          const expanded = toggled.get(row.key) ?? (index === 0 || isRunning(row));
          return expanded ? (
            <OpenCard
              key={row.key}
              row={row}
              onFold={list.length > 1 ? () => toggle(row.key, false) : undefined}
              touch={touch}
              agentId={agentId}
              store={store}
              theme={theme}
            />
          ) : (
            <FoldedCard key={row.key} row={row} onOpen={() => toggle(row.key, true)} theme={theme} />
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

const RADIUS = 10;

const styles = StyleSheet.create({
  // The host header above already leaves room at the top on desktop; the bottom sheet's header has a rule under it.
  content: { paddingHorizontal: 12, paddingTop: 0, paddingBottom: 12, gap: 8 },
  contentTouch: { paddingTop: 10 },
  flex: { flex: 1, minWidth: 0 },
  // No overflow clipping: it would stop the strips from sticking. The strips round their own corners.
  card: { borderWidth: 1, borderRadius: RADIUS },
  folded: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderTopLeftRadius: RADIUS - 1,
    borderTopRightRadius: RADIUS - 1,
  },
  chevron: { height: 18, justifyContent: "center" },
  question: { fontSize: 13, lineHeight: 18 },
  time: { lineHeight: 18 },
  body: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 28,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 2,
    borderTopWidth: 1,
    borderBottomLeftRadius: RADIUS - 1,
    borderBottomRightRadius: RADIUS - 1,
  },
  footerAlone: { borderTopWidth: 0 },
  status: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 5 },
  stripButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
});
