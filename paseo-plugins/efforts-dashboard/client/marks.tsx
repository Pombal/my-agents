import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Platform, StyleSheet, Text, View, type TextStyle } from "react-native";
import type { TicketState } from "../shared/rpc";

/** Paseo's default type ramp (Interface size 14): 14/20 titles, 13 rows, 12/17 the rest, 11 labels. */
export const BASE = { fontSize: 14, lineHeight: 20 } as const;
export const ROW = { fontSize: 13, lineHeight: 18 } as const;
export const SMALL = { fontSize: 12, lineHeight: 17 } as const;
export const LABEL = { fontSize: 11, lineHeight: 15 } as const;
export const MONO = Platform.select({
  ios: "ui-monospace",
  web: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  default: "monospace",
});

export interface Palette {
  fg: string;
  muted: string;
  s0: string;
  s1: string;
  s2: string;
  border: string;
  green: string;
  amber: string;
  accent: string;
  accentFg: string;
}

/**
 * Colours drawn from Paseo's theme. Done/bars use the success green; amber (statusWarning, the
 * colour of a modified file in the Changes tab) means "changed here, not committed" and nothing else.
 */
export function colorsOf(theme: PluginTheme): Palette {
  const { colors } = theme;
  return {
    fg: colors.foreground,
    muted: colors.foregroundMuted,
    s0: colors.surface0,
    s1: colors.surface1,
    s2: colors.surface2,
    border: colors.border,
    green: colors.statusSuccess,
    amber: colors.statusWarning,
    accent: colors.accent,
    accentFg: colors.accentForeground,
  };
}

const G = 11;

/** Ticket status glyph, 11 px, one shape per state so they differ without colour. */
export function Glyph({ state, c }: { state: TicketState; c: Palette }) {
  const ring = { width: G, height: G, borderRadius: G / 2, borderWidth: 1.5 } as const;
  switch (state) {
    case "ready":
      return <View style={[ring, { borderColor: c.fg }]} />;
    case "blocked":
      return (
        <View style={[ring, styles.center, { borderColor: c.muted }]}>
          <View style={{ width: 1.5, height: G - 1, backgroundColor: c.muted, transform: [{ rotate: "45deg" }] }} />
        </View>
      );
    case "claimed":
      return (
        <View style={[ring, { borderColor: c.green, overflow: "hidden" }]}>
          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: (G - 3) / 2, backgroundColor: c.green }} />
        </View>
      );
    case "parked":
      return (
        <View style={[ring, styles.center, { borderColor: c.muted, flexDirection: "row", gap: 1.5 }]}>
          <View style={{ width: 1.3, height: 4, backgroundColor: c.muted }} />
          <View style={{ width: 1.3, height: 4, backgroundColor: c.muted }} />
        </View>
      );
    case "done":
      return (
        <View style={[styles.center, { width: G, height: G, borderRadius: G / 2, backgroundColor: c.green }]}>
          <Icon name="Check" size={8} color={c.s0} />
        </View>
      );
  }
}

/** Share of tickets done: a 4 px bar, one meaning only. */
export function Bar({ done, total, c, width = 34 }: { done: number; total: number; c: Palette; width?: number }) {
  return (
    <View style={{ width, height: 4, borderRadius: 2, backgroundColor: c.s2, overflow: "hidden", flexShrink: 0 }}>
      <View style={{ width: total ? `${(done / total) * 100}%` : 0, height: "100%", backgroundColor: c.green }} />
    </View>
  );
}

/** Amber dot: changed here, not committed. */
export function Dot({ c }: { c: Palette }) {
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.amber, flexShrink: 0 }} />;
}

/** Workspace name chip; `suggested` = outlined with a `?`, not bound. */
export function WsChip({ name, prefix, suggested, c }: { name: string; prefix?: string; suggested?: boolean; c: Palette }) {
  return (
    <View
      style={[
        styles.chip,
        suggested
          ? { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.border, backgroundColor: "transparent" }
          : { backgroundColor: c.s2 },
      ]}
    >
      <Text numberOfLines={1} style={{ ...SMALL, color: suggested ? c.muted : c.fg, flexShrink: 1 }}>
        {prefix ? <Text style={{ color: c.muted }}>{prefix} › </Text> : null}
        {name}
        {suggested ? "?" : ""}
      </Text>
    </View>
  );
}

/** Small muted tag after a name: the map's Status word. */
export function Tag({ text, c, style }: { text: string; c: Palette; style?: TextStyle }) {
  return (
    <Text
      numberOfLines={1}
      style={[{ ...LABEL, color: c.fg, backgroundColor: c.s2, borderRadius: 5, paddingHorizontal: 5, fontWeight: "500", flexShrink: 0 }, style]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 6,
    minWidth: 0,
    flexShrink: 1,
  },
});
