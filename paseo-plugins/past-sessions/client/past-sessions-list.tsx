import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { FlatList, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  listPastSessions,
  reopenPastSession,
  type PastSession,
  type Scope,
} from "../shared/rpc";
import { absoluteTime, folderLabel, relativeTime } from "./format";

interface Props {
  workspaceId: string;
  scope: Scope;
  onScopeChange(scope: Scope): void;
  theme: PluginTheme;
  compact: boolean;
  navigation: PluginSurfaceProps["navigation"];
}

function makeStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  return {
    root: { flex: 1, minHeight: 0, backgroundColor: colors.surface0 },
    header: {
      paddingHorizontal: compact ? 12 : 16,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    path: { color: colors.foregroundMuted, fontSize: 12 },
    controls: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    segment: {
      flexDirection: "row" as const,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      overflow: "hidden" as const,
    },
    segmentButton: { paddingHorizontal: 10, paddingVertical: 5 },
    segmentActive: { backgroundColor: colors.accent },
    segmentText: { color: colors.foreground, fontSize: 13 },
    segmentTextActive: { color: colors.accentForeground, fontSize: 13 },
    iconButton: { padding: 6, borderRadius: 6 },
    summary: { color: colors.foregroundMuted, fontSize: 12 },
    row: {
      paddingHorizontal: compact ? 12 : 16,
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
    },
    rowPressed: { backgroundColor: colors.surface1 },
    rowBody: { flex: 1, minWidth: 0, gap: 3 },
    title: { color: colors.foreground, fontSize: 14 },
    meta: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, flexWrap: "wrap" as const },
    metaText: { color: colors.foregroundMuted, fontSize: 12 },
    badge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1 },
    badgePaseo: { backgroundColor: colors.accent, borderColor: colors.accent },
    badgeOmp: { backgroundColor: colors.surface2, borderColor: colors.border },
    badgeTextPaseo: { color: colors.accentForeground, fontSize: 11 },
    badgeTextOmp: { color: colors.foreground, fontSize: 11 },
    message: { color: colors.foregroundMuted, padding: 16 },
    warning: { color: colors.statusWarning, fontSize: 12 },
    error: { color: colors.statusDanger, padding: 16 },
  };
}

export function PastSessionsList({ workspaceId, scope, onScopeChange, theme, compact, navigation }: Props) {
  const styles = useMemo(() => makeStyles(theme, compact), [theme, compact]);
  const list = useRpc(listPastSessions);
  const reopen = useRpc(reopenPastSession);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [opening, setOpening] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["past-sessions", workspaceId, scope],
    queryFn: () => list({ workspaceId, scope }),
  });
  const mutation = useMutation({
    mutationFn: (entry: PastSession) =>
      entry.source === "paseo"
        ? reopen({ source: "paseo", agentId: entry.agentId ?? "" })
        : reopen({ source: "omp", file: entry.file ?? "", cwd: entry.cwd, provider: entry.provider }),
    onMutate: (entry) => setOpening(entry.key),
    onSuccess: ({ agentId }) => {
      void queryClient.invalidateQueries({ queryKey: ["past-sessions"] });
      if (navigation) navigation.openAgent({ agentId });
      else toast.show("Reopened. Find it in the sidebar.", { variant: "success" });
    },
    onError: (error) => toast.error(`Could not reopen: ${error instanceof Error ? error.message : String(error)}`),
    onSettled: () => setOpening(null),
  });

  const data = query.data;
  const now = Date.now();
  const paseoCount = data?.entries.filter((entry) => entry.source === "paseo").length ?? 0;
  const scopeOptions: { value: Scope; label: string }[] = [
    { value: "folder", label: "This folder" },
    { value: "project", label: "Whole project" },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.path} numberOfLines={1}>
          {data ? (scope === "folder" ? data.folder : `${data.projectRoot} (project ${data.projectName})`) : " "}
        </Text>
        <View style={styles.controls}>
          <View style={styles.segment}>
            {scopeOptions.map((option) => {
              const active = option.value === scope;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={`past-sessions-scope-${option.value}`}
                  style={[styles.segmentButton, active ? styles.segmentActive : null]}
                  onPress={() => onScopeChange(option.value)}
                >
                  <Text style={active ? styles.segmentTextActive : styles.segmentText}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh"
            style={styles.iconButton}
            onPress={() => void query.refetch()}
          >
            <Icon name="RefreshCw" size={15} color={theme.colors.foregroundMuted} />
          </Pressable>
          {query.isFetching ? <ActivityIndicator size="small" color={theme.colors.foregroundMuted} /> : null}
        </View>
        {data ? (
          <Text style={styles.summary} testID="past-sessions-summary">
            {data.entries.length} past · {paseoCount} Paseo · {data.entries.length - paseoCount} OMP only ·{" "}
            {data.stats.hiddenKnownToPaseo} OMP sessions already open in Paseo hidden · {data.stats.elapsedMs} ms
          </Text>
        ) : null}
        {data?.warnings.map((warning) => (
          <Text key={warning} style={styles.warning} numberOfLines={2}>
            {warning}
          </Text>
        ))}
      </View>
      {query.isError ? (
        <Text style={styles.error}>{query.error instanceof Error ? query.error.message : String(query.error)}</Text>
      ) : !data ? (
        <Text style={styles.message}>Loading…</Text>
      ) : data.entries.length === 0 ? (
        <Text style={styles.message}>No past sessions here.</Text>
      ) : (
        <FlatList
          style={{ flex: 1, minHeight: 0 }}
          data={data.entries}
          keyExtractor={(entry) => entry.key}
          initialNumToRender={30}
          renderItem={({ item }) => {
            const where = folderLabel(item.cwd, scope === "folder" ? data.folder : data.projectRoot);
            return (
              <Pressable
                accessibilityRole="button"
                testID={`past-session-${item.key}`}
                disabled={mutation.isPending}
                style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
                onPress={() => mutation.mutate(item)}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.meta}>
                    <View style={[styles.badge, item.source === "paseo" ? styles.badgePaseo : styles.badgeOmp]}>
                      <Text style={item.source === "paseo" ? styles.badgeTextPaseo : styles.badgeTextOmp}>
                        {item.source === "paseo" ? "Paseo" : "OMP terminal"}
                      </Text>
                    </View>
                    <Text style={styles.metaText}>
                      {relativeTime(item.at, now)} · {absoluteTime(item.at)}
                      {where === "." ? "" : ` · ${where}`}
                    </Text>
                  </View>
                </View>
                {opening === item.key ? (
                  <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
                ) : (
                  <Icon
                    name={item.source === "paseo" ? "ArchiveRestore" : "Import"}
                    size={15}
                    color={theme.colors.foregroundMuted}
                  />
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
