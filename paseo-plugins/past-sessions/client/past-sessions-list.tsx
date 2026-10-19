import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { FlatList, Icon, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  listPastSessions,
  reopenPastSession,
  type PastSession,
  type PastSessionsListing,
  type Scope,
} from "../shared/rpc";
import { absoluteTime, folderLabel, relativeTime, tildify } from "./format";
import { buildListItems, type ListItem } from "./model";

interface Props {
  workspaceId: string;
  scope: Scope;
  onScopeChange(scope: Scope): void;
  theme: PluginTheme;
  compact: boolean;
  navigation: PluginSurfaceProps["navigation"];
}

const SCOPES: { value: Scope; label: string; hint: string }[] = [
  { value: "workspace", label: "Workspace", hint: "Archived agents of this workspace" },
  { value: "folder", label: "Folder", hint: "Everything that ran in this folder" },
  { value: "project", label: "Project", hint: "Everything in the project, its subfolders and worktrees" },
];

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  const gutter = compact ? 14 : 20;
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0, backgroundColor: colors.surface0 },
    header: { paddingHorizontal: gutter, paddingTop: 14, paddingBottom: 12, gap: 10 },
    toolbar: { flexDirection: "row", alignItems: "center", gap: 8 },
    segments: {
      flexDirection: "row",
      padding: 2,
      borderRadius: 8,
      backgroundColor: colors.surface1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    segment: { paddingHorizontal: compact ? 10 : 12, paddingVertical: 5, borderRadius: 6 },
    segmentActive: { backgroundColor: colors.surface0, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    segmentText: { color: colors.foregroundMuted, fontSize: 13 },
    segmentTextActive: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
    spacer: { flex: 1 },
    iconButton: { width: 30, height: 30, borderRadius: 6, alignItems: "center", justifyContent: "center" },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      height: 34,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface1,
    },
    searchFocused: { borderColor: colors.accent },
    // The container shows focus; the browser's own ring inside it would double the border.
    searchInput: { flex: 1, color: colors.foreground, fontSize: 13, paddingVertical: 0, outlineWidth: 0 },
    context: { color: colors.foregroundMuted, fontSize: 12 },
    warning: { color: colors.statusWarning, fontSize: 12 },
    sectionLabel: {
      paddingHorizontal: gutter,
      paddingTop: 6,
      paddingBottom: 6,
      color: colors.foregroundMuted,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: gutter,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowPressed: { backgroundColor: colors.surface1 },
    rowBody: { flex: 1, minWidth: 0, gap: 4 },
    titleLine: { flexDirection: "row", alignItems: "baseline", gap: 10 },
    title: { flex: 1, color: colors.foreground, fontSize: 14, fontWeight: "500" },
    relative: { color: colors.foregroundMuted, fontSize: 12 },
    metaLine: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
    tag: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    tagText: { color: colors.foregroundMuted, fontSize: 11 },
    meta: { flexShrink: 1, color: colors.foregroundMuted, fontSize: 12 },
    action: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 18, justifyContent: "flex-end" },
    actionText: { color: colors.foregroundMuted, fontSize: 12 },
    folderHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 18,
      paddingHorizontal: gutter,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface1,
    },
    folderHeaderBody: { flex: 1, minWidth: 0, gap: 2 },
    folderHeaderTitle: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
    folderHeaderHint: { color: colors.foregroundMuted, fontSize: 12 },
    count: {
      minWidth: 22,
      paddingHorizontal: 7,
      paddingVertical: 1,
      borderRadius: 10,
      backgroundColor: colors.surface2,
      alignItems: "center",
    },
    countText: { color: colors.foreground, fontSize: 12, fontWeight: "600" },
    state: { alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 40 },
    stateTitle: { color: colors.foreground, fontSize: 14, fontWeight: "600", textAlign: "center" },
    stateDetail: { color: colors.foregroundMuted, fontSize: 13, textAlign: "center", maxWidth: 420 },
    stateButton: {
      marginTop: 6,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    stateButtonText: { color: colors.foreground, fontSize: 13 },
    footer: { paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 24, color: colors.foregroundMuted, fontSize: 11 },
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
        <Pressable accessibilityRole="button" style={styles.stateButton} onPress={props.action.onPress}>
          <Text style={styles.stateButtonText}>{props.action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface RowProps {
  entry: PastSession;
  where: string | null;
  now: number;
  busy: boolean;
  disabled: boolean;
  compact: boolean;
  styles: Styles;
  theme: PluginTheme;
  onOpen(entry: PastSession): void;
}

const SessionRow = memo(function SessionRow({ entry, where, now, busy, disabled, compact, styles, theme, onOpen }: RowProps) {
  const fromPaseo = entry.source === "paseo";
  const muted = theme.colors.foregroundMuted;
  const actionLabel = fromPaseo ? "Restore" : "Import";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel} ${entry.title}`}
      testID={`past-session-${entry.key}`}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      onPress={() => onOpen(entry)}
    >
      <View style={styles.rowBody}>
        <View style={styles.titleLine}>
          <Text style={styles.title} numberOfLines={1}>
            {entry.title}
          </Text>
          <Text style={styles.relative}>{relativeTime(entry.at, now)}</Text>
        </View>
        <View style={styles.metaLine}>
          <View style={styles.tag}>
            <Icon name={fromPaseo ? "Archive" : "SquareTerminal"} size={11} color={muted} />
            <Text style={styles.tagText}>{fromPaseo ? "Paseo" : "OMP terminal"}</Text>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {absoluteTime(entry.at)}
            {where ? ` · ${where}` : ""}
          </Text>
        </View>
      </View>
      <View style={styles.action}>
        {busy ? (
          <ActivityIndicator size="small" color={muted} />
        ) : (
          <>
            {compact ? null : <Text style={styles.actionText}>{actionLabel}</Text>}
            <Icon name={fromPaseo ? "ArchiveRestore" : "Import"} size={15} color={muted} />
          </>
        )}
      </View>
    </Pressable>
  );
});

function contextLine(data: PastSessionsListing, scope: Scope): string {
  const folder = tildify(data.folder, data.home);
  if (scope === "workspace") return `Archived agents of ${data.workspaceName} · ${folder}`;
  if (scope === "folder") return `Everything that ran in ${folder}`;
  return `Everything in ${data.projectName} · ${tildify(data.projectRoot, data.home)}, subfolders and worktrees`;
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

export function PastSessionsList({ workspaceId, scope, onScopeChange, theme, compact, navigation }: Props) {
  const styles = useMemo(() => createStyles(theme, compact), [theme, compact]);
  const list = useRpc(listPastSessions);
  const reopen = useRpc(reopenPastSession);
  const queryClient = useQueryClient();
  const toast = useToast();
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
  const base = data ? (scope === "project" ? data.projectRoot : data.folder) : "";

  const header = (
    <View style={styles.header}>
      <View style={styles.toolbar}>
        <View style={styles.segments} accessibilityRole="tablist">
          {SCOPES.map((option) => {
            const active = option.value === scope;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityHint={option.hint}
                testID={`past-sessions-scope-${option.value}`}
                style={[styles.segment, active ? styles.segmentActive : null]}
                onPress={() => onScopeChange(option.value)}
              >
                <Text style={active ? styles.segmentTextActive : styles.segmentText}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.spacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          style={styles.iconButton}
          disabled={result.isFetching}
          onPress={() => void result.refetch()}
        >
          {result.isFetching && data ? (
            <ActivityIndicator size="small" color={muted} />
          ) : (
            <Icon name="RefreshCw" size={15} color={muted} />
          )}
        </Pressable>
      </View>
      <View style={[styles.search, searchFocused ? styles.searchFocused : null]}>
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
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery("")}>
            <Icon name="X" size={14} color={muted} />
          </Pressable>
        ) : null}
      </View>
      {data ? (
        <Text style={styles.context} numberOfLines={1}>
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
    const label =
      scope === "workspace" ? `Archived agents · ${mainCount}` : `Past sessions · ${mainCount}`;
    const renderItem = ({ item }: { item: ListItem }) => {
      if (item.kind === "empty") {
        const message = emptyMessage(scope, query);
        return <StateMessage styles={styles} theme={theme} icon="Inbox" title={message.title} detail={message.detail} />;
      }
      if (item.kind === "same-folder-header") {
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: item.open }}
            testID="past-sessions-same-folder"
            style={styles.folderHeader}
            onPress={() => setSameFolderOpen((open) => !open)}
          >
            <Icon name={item.open ? "ChevronDown" : "ChevronRight"} size={16} color={muted} />
            <View style={styles.folderHeaderBody}>
              <Text style={styles.folderHeaderTitle}>Terminal sessions in this folder</Text>
              <Text style={styles.folderHeaderHint} numberOfLines={2}>
                Never opened in Paseo. Import one to continue it here.
              </Text>
            </View>
            <View style={styles.count}>
              <Text style={styles.countText}>{item.count}</Text>
            </View>
          </Pressable>
        );
      }
      return (
        <SessionRow
          entry={item.entry}
          where={folderLabel(item.entry.cwd, base, data.home)}
          now={now}
          busy={busyKey === item.entry.key}
          disabled={mutation.isPending}
          compact={compact}
          styles={styles}
          theme={theme}
          onOpen={mutation.mutate}
        />
      );
    };
    const { stats } = data;
    body = (
      <FlatList
        style={{ flex: 1, minHeight: 0 }}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        initialNumToRender={30}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={mainCount > 0 ? <Text style={styles.sectionLabel}>{label}</Text> : null}
        ListFooterComponent={
          <Text style={styles.footer} testID="past-sessions-footer">
            {stats.hiddenKnownToPaseo > 0
              ? `${stats.hiddenKnownToPaseo} terminal ${stats.hiddenKnownToPaseo === 1 ? "session is" : "sessions are"} already in Paseo and not repeated. `
              : ""}
            Scanned {stats.ompFilesSeen} OMP {stats.ompFilesSeen === 1 ? "file" : "files"} in {stats.elapsedMs} ms.
          </Text>
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
