import { openExternalUrl, type PluginHostProps } from "@getpaseo/plugin/client";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, type PressableStateCallbackType } from "react-native";
import type { Link, LinkKind } from "../shared/links";
import { whereLabel } from "./store";

/** The list parts the composer popover and the links page share: type tabs, sub-agents switch, rows. */

export const KIND_LABEL: Record<LinkKind, string> = { web: "Web", image: "Images", file: "Files" };
const COPIED_MS = 1_500;

/** `now`, `5m`, `3h`, `2d`. */
export function ago(at: number, now: number): string {
  const minutes = (now - at) / 60_000;
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1_440)}d`;
}

/** RN Web passes `hovered`; native only `pressed`. */
export type PressState = PressableStateCallbackType & { hovered?: boolean };

type Theme = PluginHostProps["theme"];

/** Paseo's real sizes: 13 px names, 12 px muted columns and tabs, 11 px counts; 28 px rows on desktop, 40 px on phones. */
function buildStyles(theme: Theme, compact: boolean) {
  const muted = theme.colors.foregroundMuted;
  return {
    muted,
    header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, marginBottom: 4 },
    tabs: { flex: 1, flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 4 },
    tab: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      height: compact ? 28 : 22,
      paddingHorizontal: 8,
      borderRadius: 11,
    },
    tabOn: { backgroundColor: theme.colors.surface2 },
    tabText: { fontSize: 12, color: muted },
    tabTextOn: { fontSize: 12, color: theme.colors.foreground },
    tabCount: { fontSize: 11, color: muted, fontVariant: ["tabular-nums" as const] },
    // Not a tab: a small text switch that adds rows, faint while off.
    subagents: { fontSize: 11, color: muted, opacity: 0.6, fontVariant: ["tabular-nums" as const] },
    subagentsHover: { fontSize: 11, color: muted, fontVariant: ["tabular-nums" as const] },
    subagentsOn: { fontSize: 11, color: theme.colors.foreground, fontVariant: ["tabular-nums" as const] },
    line: { fontSize: 12, color: muted },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      height: compact ? 40 : 28,
      paddingHorizontal: 8,
      marginHorizontal: -8,
      borderRadius: 6,
    },
    rowActive: { backgroundColor: theme.colors.surface2 },
    name: { flexShrink: 1, maxWidth: "62%" as const, fontSize: 13, color: theme.colors.foreground },
    nameMissing: { flexShrink: 1, maxWidth: "62%" as const, fontSize: 13, color: muted, textDecorationLine: "line-through" as const },
    where: { flex: 1, minWidth: 0, fontSize: 12, color: muted },
    // `×N` after the host: how many distinct full URLs (query strings, fragments) a row folds.
    variants: { fontSize: 11, color: muted, opacity: 0.7, fontVariant: ["tabular-nums" as const] },
    // Two lines fit the 28 px desktop row.
    snippet: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 13, color: muted },
    time: { flexShrink: 0, minWidth: 28, textAlign: "right" as const, fontSize: 12, color: muted, fontVariant: ["tabular-nums" as const] },
    copied: { flexShrink: 0, minWidth: 28, textAlign: "right" as const, fontSize: 12, color: theme.colors.foreground },
  };
}

const built = new WeakMap<Theme, Map<boolean, ReturnType<typeof buildStyles>>>();

/** The shared list styles for a theme and layout, built once per theme object. */
export function listStyles(theme: Theme, compact: boolean) {
  let forTheme = built.get(theme);
  if (!forTheme) built.set(theme, (forTheme = new Map()));
  let styles = forTheme.get(compact);
  if (!styles) forTheme.set(compact, (styles = buildStyles(theme, compact)));
  return styles;
}

/** One tab per type present, with its count; the shown type is lit. Only rendered with 2+ types. */
export function TypeTabs(props: {
  theme: Theme;
  compact: boolean;
  kinds: readonly { kind: LinkKind; count: number }[];
  shown: LinkKind | null;
  onChoose(kind: LinkKind): void;
}) {
  const { kinds, shown, onChoose } = props;
  const styles = listStyles(props.theme, props.compact);
  return kinds.map(({ kind, count }) => {
    const on = kind === shown;
    return (
      <Pressable
        key={kind}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`Show ${KIND_LABEL[kind].toLowerCase()}`}
        onPress={() => onChoose(kind)}
        style={({ hovered }: PressState) => [styles.tab, (on || hovered) && styles.tabOn]}
      >
        <Text style={on ? styles.tabTextOn : styles.tabText}>{KIND_LABEL[kind]}</Text>
        <Text style={styles.tabCount}>{count}</Text>
      </Pressable>
    );
  });
}

/** `+N subagents`: a small right-aligned text switch, faint while off, full colour while on. */
export function SubagentsSwitch(props: { theme: Theme; compact: boolean; extra: number; on: boolean; onToggle(): void }) {
  const { extra, on, onToggle } = props;
  const styles = listStyles(props.theme, props.compact);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={on ? "Hide links from subagents" : `Show ${extra} more ${extra === 1 ? "link" : "links"} from subagents`}
      onPress={onToggle}
      hitSlop={6}
    >
      {({ hovered }: PressState) => <Text style={on ? styles.subagentsOn : hovered ? styles.subagentsHover : styles.subagents}>{`+${extra} subagents`}</Text>}
    </Pressable>
  );
}

/**
 * What a row click does: web and images open in the browser (then `after`, e.g. closing the
 * popover); files copy their path and the row says "copied" for a moment.
 */
export function useLinkPress(after?: () => void): { press(link: Link): void; copied: string | null } {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
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
      after?.();
    },
    [after, toast],
  );
  return { press, copied };
}

/**
 * glyph · name (struck through when missing) · muted host/folder (hover: the sentence around the
 * link, desktop only) · `tab` slot · time. `where: false` keeps the column for the sentence only.
 */
export function LinkRow(props: {
  theme: Theme;
  compact: boolean;
  link: Link;
  now: number;
  copied: boolean;
  onPress(link: Link): void;
  where?: boolean;
  tab?: ReactNode;
}) {
  const { link, now, copied, onPress, where = true, tab } = props;
  const styles = listStyles(props.theme, props.compact);
  return (
    <Pressable
      accessibilityRole={link.kind === "file" ? "button" : "link"}
      accessibilityLabel={link.kind === "file" ? `Copy ${link.copy}` : `Open ${link.url}`}
      onPress={() => onPress(link)}
      style={({ hovered, pressed }: PressState) => [styles.row, (hovered || pressed) && styles.rowActive]}
    >
      {({ hovered }: PressState) => (
        <>
          <Icon name={link.glyph} size={14} color={styles.muted} />
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
              {where ? whereLabel(link) : link.missing ? "missing" : ""}
              {link.variants ? <Text style={styles.variants}>{`${where || link.missing ? " " : ""}×${link.variants.length}`}</Text> : null}
            </Text>
          )}
          {tab}
          {copied ? <Text style={styles.copied}>copied</Text> : <Text style={styles.time}>{ago(link.lastAt, now)}</Text>}
        </>
      )}
    </Pressable>
  );
}
