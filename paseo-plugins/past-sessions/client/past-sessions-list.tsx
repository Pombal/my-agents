import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { FlatList, Icon, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  listPastSessions,
  reopenPastSession,
  type PastSession,
  type PastSessionsListing,
  type Scope,
} from "../shared/rpc";
import { viewSettings, type Density } from "../shared/view";
import { absoluteTime, folderChip, relativeTime, tildify } from "./format";
import { Interactive } from "./interactive";
import { buildListItems, type ListItem } from "./model";
import { ProviderGlyph, useSnapshotIcons } from "./provider-glyph";
import { tooltip } from "./web";

interface Props {
  workspaceId: string;
  scope: Scope;
  onScopeChange(scope: Scope): void;
  theme: PluginTheme;
  /** Host id, for provider glyphs. */
  serverId: string;
  /** Phone-sized layout: no hover, search on its own line. */
  compact: boolean;
  navigation: PluginSurfaceProps["navigation"];
}

const SCOPES: { value: Scope; label: string; hint: string }[] = [
  { value: "workspace", label: "Workspace", hint: "Archived agents of this workspace" },
  { value: "folder", label: "Folder", hint: "Everything that ran in this folder" },
  { value: "project", label: "Project", hint: "Everything in the project, its subfolders and worktrees" },
];

const DENSITIES: { value: Density; icon: string; label: string }[] = [
  { value: "comfortable", icon: "Rows2", label: "Comfortable: two lines of the last reply" },
  { value: "compact", icon: "Rows4", label: "Compact: one line per session" },
];

// Paseo's default type ramp (Interface size 14): 14/20 for titles, 12/17 for everything else.
const BASE = { fontSize: 14, lineHeight: 20 } as const;
const SMALL = { fontSize: 12, lineHeight: 17 } as const;
const GLYPH = 14;

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  const gutter = compact ? 14 : 20;
  const focusRing = { outlineColor: colors.accent, outlineStyle: "solid", outlineWidth: 2 } as const;
  const muted = { ...SMALL, color: colors.foregroundMuted };
  const segmentGroup = { flexDirection: "row", padding: 2, borderRadius: 12, backgroundColor: colors.surface2 } as const;
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0, backgroundColor: colors.surface0 },
    // The bottom padding keeps scrolled rows from touching the context line.
    header: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 6 },
    toolbar: { flexDirection: "row", alignItems: "center", gap: 8 },
    focusRing,
    focusRingInset: { ...focusRing, outlineOffset: -2 },
    segments: { ...segmentGroup, flexShrink: 0 },
    segment: { height: 24, paddingHorizontal: 8, borderRadius: 10, justifyContent: "center" },
    densityOption: { height: 24, paddingHorizontal: 6, borderRadius: 10, justifyContent: "center" },
    segmentActive: { backgroundColor: colors.surface0 },
    segmentText: { ...SMALL, color: colors.foregroundMuted },
    segmentTextHot: { color: colors.foreground },
    spacer: { flex: 1 },
    iconButton: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center" },
    iconButtonHovered: { backgroundColor: colors.surface1 },
    iconButtonPressed: { backgroundColor: colors.surface2 },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      height: compact ? 34 : 28,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface1,
    },
    searchInline: { flex: 1, minWidth: 140 },
    searchRow: { marginTop: 8 },
    searchFocused: { borderColor: colors.accent },
    // The container shows focus; the browser's own ring inside it would double the border.
    searchInput: { flex: 1, ...BASE, color: colors.foreground, paddingVertical: 0, outlineWidth: 0 },
    clear: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    context: { ...muted, marginTop: 8 },
    warning: { ...SMALL, color: colors.statusWarning, marginTop: 4 },
    label: { ...muted, fontWeight: "500", paddingHorizontal: gutter, paddingTop: 10, paddingBottom: 6 },
    row: { paddingHorizontal: gutter, paddingVertical: 8 },
    rowCompact: { paddingVertical: 6 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowHovered: { backgroundColor: colors.surface1 },
    rowPressed: { backgroundColor: colors.surface2 },
    split: { flexDirection: "row", gap: 10 },
    glyph: { width: GLYPH, height: BASE.lineHeight, alignItems: "center", justifyContent: "center" },
    body: { flex: 1, minWidth: 0 },
    line: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
    lineCompact: { gap: 10 },
    title: { ...BASE, flexShrink: 1, color: colors.foreground },
    titleCompact: { maxWidth: "56%" },
    titleFill: { flex: 1 },
    tail: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
    tailHidden: { opacity: 0 },
    dash: { ...muted, opacity: 0.6 },
    chip: {
      flexShrink: 1,
      // Phones leave the title little room; the chip yields first.
      maxWidth: compact ? "28%" : "40%",
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 6,
      borderRadius: 5,
      backgroundColor: colors.surface2,
    },
    chipHot: { backgroundColor: colors.surface0 },
    chipText: { ...muted, flexShrink: 1 },
    right: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
    meta: muted,
    tag: { ...muted, opacity: 0.72 },
    dot: { ...muted, opacity: 0.5 },
    action: { ...SMALL, color: colors.foreground, fontWeight: "500" },
    preview: { ...muted, marginTop: 1 },
    previewInline: { ...muted, flex: 1, minWidth: 0 },
    previewNone: { fontStyle: "italic", opacity: 0.75 },
    recapLabel: { color: colors.foreground, fontWeight: "500" },
    expansion: { paddingLeft: GLYPH + 10, paddingBottom: 2 },
    folderHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 10,
      paddingHorizontal: gutter,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface1,
    },
    folderHeaderHovered: { backgroundColor: colors.surface2 },
    folderHeaderBody: { flex: 1, minWidth: 0 },
    folderHeaderTitle: { ...BASE, color: colors.foreground, fontWeight: "500" },
    folderHeaderHint: muted,
    count: { paddingHorizontal: 7, borderRadius: 9, backgroundColor: colors.surface2 },
    countText: { ...SMALL, color: colors.foreground },
    state: { alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 40 },
    stateTitle: { ...BASE, color: colors.foreground, fontWeight: "600", textAlign: "center" },
    stateDetail: { ...muted, textAlign: "center", maxWidth: 420 },
    stateButton: {
      marginTop: 6,
      paddingHorizontal: 12,
      height: 28,
      justifyContent: "center",
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    stateButtonText: { ...SMALL, color: colors.foreground },
    footer: { ...muted, paddingHorizontal: gutter, paddingTop: 10, paddingBottom: 24 },
  });
}

function StateMessage(props: {
  styles: Styles;
  theme: PluginTheme;
  icon: string;
  title: string;
  detail?: string;
  action?: { label: string; onPress(): void };
  busy?: boolean;
}) {
  const { styles, theme } = props;
  return (
    <View style={styles.state}>
      {props.busy ? (
        <ActivityIndicator color={theme.colors.foregroundMuted} />
      ) : (
        <Icon name={props.icon} size={22} color={theme.colors.foregroundMuted} />
      )}
      <Text style={styles.stateTitle}>{props.title}</Text>
      {props.detail ? <Text style={styles.stateDetail}>{props.detail}</Text> : null}
      {props.action ? (
        <Interactive
          accessibilityRole="button"
          onPress={props.action.onPress}
          style={({ hovered, pressed, focused }) => [
            styles.stateButton,
            hovered ? styles.iconButtonHovered : null,
            pressed ? styles.iconButtonPressed : null,
            focused ? styles.focusRing : null,
          ]}
        >
          <Text style={styles.stateButtonText}>{props.action.label}</Text>
        </Interactive>
      ) : null}
    </View>
  );
}

function Preview({ entry, styles, lines }: { entry: PastSession; styles: Styles; lines: number }) {
  const { preview } = entry;
  if (!preview) return <Text style={[styles.preview, styles.previewNone]}>No reply</Text>;
  return (
    <Text style={styles.preview} numberOfLines={lines}>
      {preview.kind === "recap" ? <Text style={styles.recapLabel}>Recap </Text> : null}
      {preview.text}
    </Text>
  );
}

interface RowProps {
  entry: PastSession;
  chip: { label: string; path: string } | null;
  now: number;
  busy: boolean;
  disabled: boolean;
  divider: boolean;
  density: Density;
  compact: boolean;
  serverId: string;
  snapshotSvg: string | undefined;
  styles: Styles;
  theme: PluginTheme;
  onOpen(entry: PastSession): void;
}

/**
 * Comfortable: glyph | title, folder chip, "terminal · 2 d ago" / two preview lines.
 * Compact: one line with the preview as a muted tail; hover opens the two-line preview below.
 * Hover or keyboard focus swaps the time for the action; the "terminal" word stays.
 */
const SessionRow = memo(function SessionRow(props: RowProps) {
  const { entry, chip, now, busy, density, compact, styles, theme } = props;
  const fromPaseo = entry.source === "paseo";
  const dense = density === "compact";
  const actionLabel = fromPaseo ? "Restore" : "Import";
  return (
    <Interactive
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel} ${entry.title}`}
      testID={`past-session-${entry.key}`}
      disabled={props.disabled}
      onPress={() => props.onOpen(entry)}
      style={({ hovered, pressed, focused }) => [
        styles.row,
        dense ? styles.rowCompact : null,
        props.divider && !dense ? styles.rowDivider : null,
        hovered ? styles.rowHovered : null,
        pressed ? styles.rowPressed : null,
        focused ? styles.focusRingInset : null,
      ]}
    >
      {({ hovered, focused }) => {
        const hot = hovered || focused;
        const glyph = (
          <View style={styles.glyph}>
            <ProviderGlyph
              provider={entry.provider}
              serverId={props.serverId}
              snapshotSvg={props.snapshotSvg}
              size={GLYPH}
              color={theme.colors.foregroundMuted}
            />
          </View>
        );
        const title = (
          <Text
            style={[styles.title, dense ? (compact ? styles.titleFill : styles.titleCompact) : null]}
            numberOfLines={1}
          >
            {entry.title}
          </Text>
        );
        const folder = chip ? (
          <View ref={tooltip(chip.path)} style={[styles.chip, hot ? styles.chipHot : null]}>
            <Icon name="Folder" size={11} color={theme.colors.foregroundMuted} />
            <Text style={styles.chipText} numberOfLines={1}>
              {chip.label}
            </Text>
          </View>
        ) : null;
        const right = (
          <View style={styles.right}>
            {fromPaseo ? null : (
              <>
                <Text style={styles.tag}>terminal</Text>
                <Text style={styles.dot}>·</Text>
              </>
            )}
            {busy ? (
              <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
            ) : hot ? (
              <>
                <Icon name={fromPaseo ? "ArchiveRestore" : "Import"} size={14} color={theme.colors.accent} />
                <Text style={styles.action}>{actionLabel}</Text>
              </>
            ) : (
              <Text ref={tooltip(`Last active ${absoluteTime(entry.at)}`)} style={styles.meta}>
                {relativeTime(entry.at, now, dense)}
              </Text>
            )}
          </View>
        );

        if (!dense) {
          return (
            <View style={styles.split}>
              {glyph}
              <View style={styles.body}>
                <View style={styles.line}>
                  {title}
                  {folder}
                  <View style={styles.spacer} />
                  {right}
                </View>
                <Preview entry={entry} styles={styles} lines={2} />
              </View>
            </View>
          );
        }
        const opened = hot && !compact;
        return (
          <>
            <View style={[styles.line, styles.lineCompact]}>
              {glyph}
              {title}
              {folder}
              {compact ? null : (
                <View style={[styles.tail, opened ? styles.tailHidden : null]}>
                  <Text style={styles.dash}>—</Text>
                  <Text style={[styles.previewInline, entry.preview ? null : styles.previewNone]} numberOfLines={1}>
                    {entry.preview?.text ?? "No reply"}
                  </Text>
                </View>
              )}
              {compact ? <View style={styles.spacer} /> : null}
              {right}
            </View>
            {opened ? (
              <View style={styles.expansion}>
                <Preview entry={entry} styles={styles} lines={2} />
              </View>
            ) : null}
          </>
        );
      }}
    </Interactive>
  );
});

function contextLine(data: PastSessionsListing, scope: Scope): string {
  const folder = tildify(data.folder, data.home);
  if (scope === "workspace") return `Archived agents of ${data.workspaceName} · ${folder}`;
  if (scope === "folder") return `Everything that ran in ${folder}`;
  return `Everything in ${data.projectName}, its subfolders and worktrees · ${tildify(data.projectRoot, data.home)}`;
}

function emptyMessage(scope: Scope, query: string): { title: string; detail: string } {
  if (query.trim()) return { title: `Nothing matches “${query.trim()}”`, detail: "Search looks at titles and folders." };
  if (scope === "workspace") {
    return {
      title: "No archived agents in this workspace",
      detail: "Archive an agent and it appears here, ready to restore.",
    };
  }
  return { title: "No past sessions here", detail: "Archived agents and terminal sessions for this place appear here." };
}

/** The saved density, switched optimistically; saving failures keep the local choice. */
function useDensity(): [Density, (density: Density) => void] {
  const settings = useSettings(viewSettings);
  const [chosen, setChosen] = useState<Density | null>(null);
  const saved = settings.status === "ready" ? settings.values.density : "comfortable";
  return [
    chosen ?? saved,
    (density) => {
      setChosen(density);
      if (settings.status === "ready") void settings.save({ density }, settings.revision);
    },
  ];
}

export function PastSessionsList({ workspaceId, scope, onScopeChange, theme, serverId, compact, navigation }: Props) {
  const styles = useMemo(() => createStyles(theme, compact), [theme, compact]);
  const list = useRpc(listPastSessions);
  const reopen = useRpc(reopenPastSession);
  const queryClient = useQueryClient();
  const toast = useToast();
  const snapshotIcons = useSnapshotIcons();
  const [density, setDensity] = useDensity();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [sameFolderOpen, setSameFolderOpen] = useState(false);
  const muted = theme.colors.foregroundMuted;

  const result = useQuery({
    queryKey: ["past-sessions", workspaceId, scope],
    queryFn: () => list({ workspaceId, scope }),
  });
  const mutation = useMutation({
    mutationFn: (entry: PastSession) =>
      entry.source === "paseo"
        ? reopen({ source: "paseo", agentId: entry.agentId ?? "" })
        : reopen({ source: "omp", file: entry.file ?? "", cwd: entry.cwd, provider: entry.provider }),
    onSuccess: ({ agentId }, entry) => {
      void queryClient.invalidateQueries({ queryKey: ["past-sessions"] });
      if (navigation) navigation.openAgent({ agentId });
      else toast.show(`${entry.source === "paseo" ? "Restored" : "Imported"}. It's in the sidebar now.`, { variant: "success" });
    },
    onError: (error) => toast.error(`Couldn't reopen: ${error instanceof Error ? error.message : String(error)}`),
  });

  const data = result.data?.scope === scope ? result.data : undefined;
  const items = useMemo(
    () => (data ? buildListItems(data, { query, sameFolderOpen }) : []),
    [data, query, sameFolderOpen],
  );
  const now = Date.now();
  const busyKey = mutation.isPending ? mutation.variables?.key : undefined;

  const segments = (
    <View style={styles.segments} accessibilityRole="tablist">
      {SCOPES.map((option) => {
        const active = option.value === scope;
        return (
          <Interactive
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityHint={option.hint}
            testID={`past-sessions-scope-${option.value}`}
            onPress={() => onScopeChange(option.value)}
            style={({ focused }) => [
              styles.segment,
              active ? styles.segmentActive : null,
              focused ? styles.focusRing : null,
            ]}
          >
            {({ hovered }) => (
              <Text style={[styles.segmentText, active || hovered ? styles.segmentTextHot : null]}>{option.label}</Text>
            )}
          </Interactive>
        );
      })}
    </View>
  );

  const densitySwitch = (
    <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="Density">
      {DENSITIES.map((option) => {
        const active = option.value === density;
        return (
          <Interactive
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={option.label}
            testID={`past-sessions-density-${option.value}`}
            onPress={() => setDensity(option.value)}
            style={({ focused }) => [
              styles.densityOption,
              active ? styles.segmentActive : null,
              focused ? styles.focusRing : null,
            ]}
          >
            {({ hovered }) => (
              <Icon name={option.icon} size={15} color={active || hovered ? theme.colors.foreground : muted} />
            )}
          </Interactive>
        );
      })}
    </View>
  );

  const search = (
    <View style={[styles.search, compact ? null : styles.searchInline, searchFocused ? styles.searchFocused : null]}>
      <Icon name="Search" size={14} color={muted} />
      <TextInput
        testID="past-sessions-search"
        value={query}
        onChangeText={setQuery}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        placeholder="Search titles and folders"
        placeholderTextColor={muted}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.searchInput}
      />
      {query ? (
        <Interactive
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => setQuery("")}
          style={({ hovered, focused }) => [
            styles.clear,
            hovered ? styles.iconButtonPressed : null,
            focused ? styles.focusRing : null,
          ]}
        >
          <Icon name="X" size={13} color={muted} />
        </Interactive>
      ) : null}
    </View>
  );

  const refresh = (
    <Interactive
      accessibilityRole="button"
      accessibilityLabel="Refresh"
      disabled={result.isFetching}
      onPress={() => void result.refetch()}
      style={({ hovered, pressed, focused }) => [
        styles.iconButton,
        hovered ? styles.iconButtonHovered : null,
        pressed ? styles.iconButtonPressed : null,
        focused ? styles.focusRing : null,
      ]}
    >
      {({ hovered }) =>
        result.isFetching && data ? (
          <ActivityIndicator size="small" color={muted} />
        ) : (
          <Icon name="RefreshCw" size={15} color={hovered ? theme.colors.foreground : muted} />
        )
      }
    </Interactive>
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.toolbar}>
        {segments}
        {compact ? <View style={styles.spacer} /> : search}
        {densitySwitch}
        {refresh}
      </View>
      {compact ? <View style={styles.searchRow}>{search}</View> : null}
      {data ? (
        <Text style={styles.context} numberOfLines={compact ? 2 : 1}>
          {contextLine(data, scope)}
        </Text>
      ) : null}
      {data?.warnings.map((warning) => (
        <Text key={warning} style={styles.warning} numberOfLines={2}>
          {warning}
        </Text>
      ))}
    </View>
  );

  let body: ReactNode;
  if (!data && result.isError) {
    body = (
      <StateMessage
        styles={styles}
        theme={theme}
        icon="TriangleAlert"
        title="Couldn't load past sessions"
        detail={result.error instanceof Error ? result.error.message : String(result.error)}
        action={{ label: "Try again", onPress: () => void result.refetch() }}
      />
    );
  } else if (!data) {
    body = <StateMessage styles={styles} theme={theme} icon="History" title="Reading sessions…" busy />;
  } else {
    const mainCount = data.entries.length;
    const label = scope === "workspace" ? `Archived agents · ${mainCount}` : `Paseo agents and terminal sessions · ${mainCount}`;
    const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
      if (item.kind === "empty") {
        const message = emptyMessage(scope, query);
        return <StateMessage styles={styles} theme={theme} icon="Inbox" title={message.title} detail={message.detail} />;
      }
      if (item.kind === "same-folder-header") {
        return (
          <Interactive
            accessibilityRole="button"
            accessibilityState={{ expanded: item.open }}
            testID="past-sessions-same-folder"
            onPress={() => setSameFolderOpen((open) => !open)}
            style={({ hovered, focused }) => [
              styles.folderHeader,
              hovered ? styles.folderHeaderHovered : null,
              focused ? styles.focusRingInset : null,
            ]}
          >
            {({ hovered }) => (
              <>
                <Icon
                  name={item.open ? "ChevronDown" : "ChevronRight"}
                  size={14}
                  color={hovered ? theme.colors.foreground : muted}
                />
                <View style={styles.folderHeaderBody}>
                  <Text style={styles.folderHeaderTitle}>Terminal sessions in this folder</Text>
                  <Text style={styles.folderHeaderHint} numberOfLines={2}>
                    Never opened in Paseo. Click one to import it.
                  </Text>
                </View>
                <View style={styles.count}>
                  <Text style={styles.countText}>{item.count}</Text>
                </View>
              </>
            )}
          </Interactive>
        );
      }
      return (
        <SessionRow
          entry={item.entry}
          chip={folderChip(item.entry.cwd, data.folder, data.home)}
          now={now}
          busy={busyKey === item.entry.key}
          disabled={mutation.isPending}
          divider={items[index - 1]?.kind === "row"}
          density={density}
          compact={compact}
          serverId={serverId}
          snapshotSvg={snapshotIcons.get(item.entry.provider)}
          styles={styles}
          theme={theme}
          onOpen={mutation.mutate}
        />
      );
    };
    const hidden = data.stats.hiddenKnownToPaseo;
    body = (
      <FlatList
        style={{ flex: 1, minHeight: 0 }}
        data={items}
        extraData={density}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        initialNumToRender={30}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={mainCount > 0 ? <Text style={styles.label}>{label}</Text> : null}
        ListFooterComponent={
          hidden > 0 ? (
            <Text style={styles.footer} testID="past-sessions-footer">
              {hidden} terminal {hidden === 1 ? "session is" : "sessions are"} already in Paseo and not repeated.
            </Text>
          ) : (
            <View style={{ height: 24 }} />
          )
        }
      />
    );
  }

  return (
    <View style={styles.root}>
      {header}
      {body}
    </View>
  );
}
