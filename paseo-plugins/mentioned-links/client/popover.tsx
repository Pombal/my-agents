import { openExternalUrl, useAgent, type PluginButtonContentProps } from "@getpaseo/plugin/client";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import type { Link, LinkKind } from "../shared/links";
import { kindCounts, shownKinds, subagentChoices, toggleKind, typeChoices, whereLabel, withSubagents, type LinksStore } from "./store";

const KIND_LABEL: Record<LinkKind, string> = { web: "Web", image: "Images", file: "Files" };

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
    const [choice, setChoice] = useState<readonly LinkKind[] | undefined>(() => typeChoices.get(agentId));
    const choose = useCallback(
      (kinds: readonly LinkKind[]) => {
        typeChoices.set(agentId, kinds);
        setChoice(kinds);
      },
      [agentId],
    );
    const [subagentsShown, setSubagentsShown] = useState(() => subagentChoices.has(agentId));
    const toggleSubagents = useCallback(() => {
      if (subagentsShown) subagentChoices.delete(agentId);
      else subagentChoices.add(agentId);
      setSubagentsShown(!subagentsShown);
    }, [agentId, subagentsShown]);
    const status = useAgent(agentId, (agent) => agent.status);
    const toast = useToast();
    const [copied, setCopied] = useState<string | null>(null);

    // Registered before the refresh below, so the popover's own fetch already includes sub-agents.
    useEffect(() => store.watchSubagents(agentId), [agentId]);
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
        chips: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 4, marginBottom: 4 },
        chip: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 4,
          height: layout.compact ? 28 : 22,
          paddingHorizontal: 8,
          borderRadius: 11,
        },
        chipOn: { backgroundColor: theme.colors.surface2 },
        // A little apart: it adds rows, the type chips pick among them.
        subagentChip: { marginLeft: 4 },
        chipText: { fontSize: 12, color: muted },
        chipTextOn: { fontSize: 12, color: theme.colors.foreground },
        chipCount: { fontSize: 11, color: muted, fontVariant: ["tabular-nums" as const] },
        chipCountOff: { fontSize: 11, color: muted, opacity: 0.7, fontVariant: ["tabular-nums" as const] },
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
        nameMissing: { flexShrink: 1, maxWidth: "62%" as const, fontSize: 13, color: muted, textDecorationLine: "line-through" as const },
        where: { flex: 1, minWidth: 0, fontSize: 12, color: muted },
        // Two lines fit the 28 px desktop row.
        snippet: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 13, color: muted },
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
    const extra = chat.subagentLinks?.length ?? 0;
    // One width for every state: the surface keeps the width it first measured.
    const message = !links ? (chat.error ? `Couldn't read this chat: ${chat.error}` : "Loading…") : links.length || extra ? null : "No links in this chat yet";
    if (!links || message) {
      return (
        <View style={styles.list}>
          <Text style={styles.line}>{message}</Text>
        </View>
      );
    }

    const all = withSubagents(links, chat.subagentLinks, subagentsShown);
    const kinds = kindCounts(all);
    const shown = shownKinds(all, choice);
    const rows = all.filter((link) => shown.includes(link.kind));
    const now = Date.now();
    return (
      <View style={styles.list}>
        {kinds.length > 1 || extra ? (
          <View style={styles.chips}>
            {kinds.map(({ kind, count }) => {
              const on = shown.includes(kind);
              return (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${on ? "Hide" : "Show"} ${KIND_LABEL[kind].toLowerCase()}`}
                  onPress={() => choose(toggleKind(shown, kind))}
                  style={({ hovered }: PressState) => [styles.chip, (on || hovered) && styles.chipOn]}
                >
                  <Text style={on ? styles.chipTextOn : styles.chipText}>{KIND_LABEL[kind]}</Text>
                  <Text style={on ? styles.chipCount : styles.chipCountOff}>{count}</Text>
                </Pressable>
              );
            })}
            {extra ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: subagentsShown }}
                accessibilityLabel={subagentsShown ? "Hide links from subagents" : `Show ${extra} more ${extra === 1 ? "link" : "links"} from subagents`}
                onPress={toggleSubagents}
                style={({ hovered }: PressState) => [styles.chip, styles.subagentChip, (subagentsShown || hovered) && styles.chipOn]}
              >
                <Text style={subagentsShown ? styles.chipTextOn : styles.chipText}>↳ Subagents</Text>
                <Text style={subagentsShown ? styles.chipCount : styles.chipCountOff}>{extra}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {rows.length ? null : <Text style={styles.line}>No links in this chat yet</Text>}
        {rows.map((link) => (
          <Pressable
            key={link.key}
            accessibilityRole={link.kind === "file" ? "button" : "link"}
            accessibilityLabel={link.kind === "file" ? `Copy ${link.copy}` : `Open ${link.url}`}
            onPress={() => press(link)}
            style={({ hovered, pressed }: PressState) => [styles.row, (hovered || pressed) && styles.rowActive]}
          >
            {({ hovered }: PressState) => (
              <>
                <Icon name={link.glyph} size={14} color={muted} />
                <Text numberOfLines={1} style={link.missing ? styles.nameMissing : styles.name}>
                  {link.title}
                </Text>
                {/* Desktop only: phones have no hover, so they never see snippets. */}
                {hovered && link.snippet ? (
                  <Text numberOfLines={2} style={styles.snippet}>
                    {link.snippet}
                  </Text>
                ) : (
                  <Text numberOfLines={1} style={styles.where}>
                    {whereLabel(link)}
                  </Text>
                )}
                {copied === link.key ? <Text style={styles.copied}>copied</Text> : <Text style={styles.time}>{ago(link.lastAt, now)}</Text>}
              </>
            )}
          </Pressable>
        ))}
      </View>
    );
  };
}
