import { openExternalUrl, useAgent, type PluginButtonContentProps } from "@getpaseo/plugin/client";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import type { Link } from "../shared/links";
import { countShown, filesToggle, type LinksStore } from "./store";

/** While the chat's agent runs, an open popover refetches this often. */
const RUNNING_REFRESH_MS = 3_000;
const COPIED_MS = 1_500;

/** `now`, `5m`, `3h`, `2d`. */
function ago(at: number, now: number): string {
  const minutes = (now - at) / 60_000;
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1_440)}d`;
}

/** RN Web passes `hovered`; native only `pressed`. */
type PressState = PressableStateCallbackType & { hovered?: boolean };

export function createLinksPopover(store: LinksStore) {
  const subscribe = (listener: () => void) => store.subscribe(listener);

  return function LinksPopover(props: PluginButtonContentProps) {
    const { theme, layout, close } = props;
    const agentId = props.context === "agent" ? props.agentId : "";
    const chat = useSyncExternalStore(subscribe, () => store.get(agentId));
    const showFiles = useSyncExternalStore(filesToggle.subscribe, filesToggle.get);
    const status = useAgent(agentId, (agent) => agent.status);
    const toast = useToast();
    const [copied, setCopied] = useState<string | null>(null);

    useEffect(() => {
      void store.refresh(agentId);
    }, [agentId]);
    useEffect(() => {
      if (status !== "running") return;
      const timer = setInterval(() => void store.refresh(agentId), RUNNING_REFRESH_MS);
      return () => clearInterval(timer);
    }, [agentId, status]);
    useEffect(() => {
      if (!copied) return;
      const timer = setTimeout(() => setCopied(null), COPIED_MS);
      return () => clearTimeout(timer);
    }, [copied]);

    const muted = theme.colors.foregroundMuted;
    const rowHeight = layout.compact ? 40 : 28;
    const styles = useMemo(
      () => ({
        // The surface is 280–420 px wide and sizes to its content; rows want all of it.
        list: layout.compact ? {} : { width: 396 },
        header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, minHeight: 20, marginBottom: 2 },
        headerText: { flex: 1, fontSize: 12, color: muted },
        toggle: { fontSize: 12, color: muted },
        toggleHover: { fontSize: 12, color: theme.colors.foreground },
        line: { fontSize: 12, color: muted },
        row: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 8,
          height: rowHeight,
          paddingHorizontal: 8,
          marginHorizontal: -8,
          borderRadius: 6,
        },
        rowActive: { backgroundColor: theme.colors.surface2 },
        name: { flexShrink: 1, maxWidth: "62%" as const, fontSize: 13, color: theme.colors.foreground },
        where: { flex: 1, minWidth: 0, fontSize: 12, color: muted },
        time: { flexShrink: 0, minWidth: 28, textAlign: "right" as const, fontSize: 12, color: muted, fontVariant: ["tabular-nums" as const] },
        copied: { flexShrink: 0, minWidth: 28, textAlign: "right" as const, fontSize: 12, color: theme.colors.foreground },
      }),
      [theme, muted, rowHeight, layout.compact],
    );

    const press = useCallback(
      (link: Link) => {
        if (link.kind === "file") {
          copyText(link.copy ?? link.title).then(
            () => setCopied(link.key),
            () => toast.error("Couldn't copy the path"),
          );
          return;
        }
        if (!link.url) return;
        openExternalUrl(link.url).catch(() => toast.error(`Couldn't open ${link.url}`));
        close();
      },
      [close, toast],
    );

    const links = chat.links;
    // One width for every state: the surface keeps the width it first measured.
    const message = !links ? (chat.error ? `Couldn't read this chat: ${chat.error}` : "Loading…") : links.length ? null : "No links in this chat yet";
    if (!links || message) {
      return (
        <View style={styles.list}>
          <Text style={styles.line}>{message}</Text>
        </View>
      );
    }

    const shown = countShown(links);
    const files = links.length - shown;
    const rows = showFiles ? links : links.filter((link) => link.kind !== "file");
    const now = Date.now();
    return (
      <View style={styles.list}>
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.headerText}>
            {shown ? `${shown} ${shown === 1 ? "link" : "links"} in this chat` : "No links in this chat yet"}
          </Text>
          {files ? (
            <Pressable accessibilityRole="button" onPress={() => filesToggle.set(!showFiles)} hitSlop={6}>
              {({ hovered }: PressState) => (
                <Text style={hovered ? styles.toggleHover : styles.toggle}>
                  {showFiles ? `hide ${files} ${files === 1 ? "file" : "files"}` : `+${files} ${files === 1 ? "file" : "files"}`}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
        {rows.map((link) => (
          <Pressable
            key={link.key}
            accessibilityRole={link.kind === "file" ? "button" : "link"}
            accessibilityLabel={link.kind === "file" ? `Copy ${link.copy}` : `Open ${link.url}`}
            onPress={() => press(link)}
            style={({ hovered, pressed }: PressState) => [styles.row, (hovered || pressed) && styles.rowActive]}
          >
            <Icon name={link.glyph} size={14} color={muted} />
            <Text numberOfLines={1} style={styles.name}>
              {link.title}
            </Text>
            <Text numberOfLines={1} style={styles.where}>
              {link.where}
            </Text>
            {copied === link.key ? <Text style={styles.copied}>copied</Text> : <Text style={styles.time}>{ago(link.lastAt, now)}</Text>}
          </Pressable>
        ))}
      </View>
    );
  };
}
