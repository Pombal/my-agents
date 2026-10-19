import { useSettings, type PluginClientContext, type PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { compilePreset, preferences } from "../shared/presets";
import { type SidebarFilter, type WorkspaceRef, readSelection, writeSelection } from "./web";

export function createSwitcher(client: PluginClientContext, filter: SidebarFilter) {
  return function PresetSwitcher({ theme, host }: PluginSidebarItemProps) {
    const settings = useSettings(preferences);
    const queryClient = useQueryClient();
    const queryKey = ["filter-presets-projects", host.id];
    const projects = useQuery({ queryKey, queryFn: async () => (await client.paseo.projects.list()).projects });
    const [selected, setSelected] = useState(readSelection);
    const workspacesKey = ["filter-presets-workspaces", host.id];
    const workspaces = useQuery({ queryKey: workspacesKey, queryFn: () => listWorkspaces(client) });
    useEffect(() => {
      const offProjects = client.paseo.projects.subscribe(() => {
        void queryClient.invalidateQueries({ queryKey: ["filter-presets-projects", host.id] });
      });
      const offWorkspaces = client.paseo.workspaces.subscribe(() => {
        void queryClient.invalidateQueries({ queryKey: ["filter-presets-workspaces", host.id] });
      });
      return () => { offProjects(); offWorkspaces(); };
    }, [host.id, queryClient]);
    const presets = settings.status === "ready" ? settings.values.presets : undefined;
    const groups = useMemo(() => presets?.map((preset) => ({ ...preset, matches: compilePreset(preset) })), [presets]);
    const other = useMemo(() => projects.data?.filter((project) => !groups?.some((group) => group.matches(project))), [projects.data, groups]);
    const choices = useMemo(() => [
      { id: "all", name: "All" },
      ...(groups ?? []).map(({ id, name }) => ({ id, name })),
      ...(other?.length ? [{ id: "other", name: "Other" }] : []),
    ], [groups, other]);
    const ready = !!groups && !!projects.data;
    const active = ready && choices.some(({ id }) => id === selected) ? selected : "all";
    function select(id: string) { writeSelection(id); setSelected(id); }
    useEffect(() => {
      if (!ready) return;
      const group = groups.find(({ id }) => id === active);
      const hidden = active === "all" ? [] : active === "other"
        ? projects.data.filter((project) => !other!.includes(project))
        : projects.data.filter((project) => !group!.matches(project));
      filter.apply(host.id, projects.data, hidden, workspaces.data ?? []);
      return () => filter.apply(host.id, [], [], []);
    }, [ready, groups, projects.data, workspaces.data, other, active, host.id]);
    useEffect(() => {
      if (!ready) return;
      const remove = choices.map(({ id, name }) => client.addCommandCenterItem({
        id: `filter-${id}`, title: `Filter preset: ${name}`, icon: "ListFilter", context: "global",
        onSelect() { select(id); },
      }));
      return () => remove.forEach((cleanup) => cleanup());
    }, [ready, choices]);
    if (!ready) return <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, padding: 6 }}>
      {projects.isError || settings.status === "error" || settings.status === "invalid" ? "Filter presets unavailable" : "Loading filter presets…"}
    </Text>;
    // Small-caps labels; the active one sits on a 2px accent bar (no hairline: Paseo already draws dividers here).
    return <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, marginHorizontal: 16, marginTop: 2, marginBottom: 2 }}>
      {choices.map(({ id, name }) => {
        const on = active === id;
        return <Pressable key={id} testID={`filter-preset-${id}`} accessibilityRole="button"
          accessibilityLabel={`Filter preset: ${name}`} accessibilityState={{ selected: on }} onPress={() => select(id)}
          hitSlop={{ top: 6, bottom: 2, left: 4, right: 4 }}
          style={{ paddingTop: 3, paddingBottom: 2, borderBottomWidth: 2, borderBottomColor: on ? theme.colors.accent : "transparent" }}>
          {(state) => <Text style={{
            fontSize: 9.5, lineHeight: 12, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: on ? "600" : "500",
            // react-native-web adds `hovered` to the pressable state; native never sets it.
            color: on || ("hovered" in state && state.hovered === true) ? theme.colors.foreground : theme.colors.foregroundMuted,
          }}>{name}</Text>}
        </Pressable>;
      })}
    </View>;
  };
}

async function listWorkspaces(client: PluginClientContext): Promise<WorkspaceRef[]> {
  const refs: WorkspaceRef[] = [];
  let cursor: string | undefined;
  do {
    const result = await client.paseo.workspaces.list({ page: { limit: 200, ...(cursor ? { cursor } : {}) } });
    for (const { id, projectId } of result.entries) refs.push({ id, projectId });
    cursor = result.pageInfo.hasMore ? result.pageInfo.nextCursor ?? undefined : undefined;
  } while (cursor);
  return refs;
}
