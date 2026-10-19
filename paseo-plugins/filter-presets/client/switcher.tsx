import { useSettings, type PluginClientContext, type PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { compilePreset, preferences } from "../shared/presets";
import { type SidebarFilter, readSelection, writeSelection } from "./web";

export function createSwitcher(client: PluginClientContext, filter: SidebarFilter) {
  return function PresetSwitcher({ theme, host, layout }: PluginSidebarItemProps) {
    const settings = useSettings(preferences);
    const queryClient = useQueryClient();
    const queryKey = ["filter-presets-projects", host.id];
    const projects = useQuery({ queryKey, queryFn: async () => (await client.paseo.projects.list()).projects });
    const [selected, setSelected] = useState(readSelection);
    useEffect(() => client.paseo.projects.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ["filter-presets-projects", host.id] });
    }), [host.id, queryClient]);
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
      filter.apply(host.id, projects.data, hidden);
      return () => filter.apply(host.id, [], []);
    }, [ready, groups, projects.data, other, active, host.id]);
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
    return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, paddingHorizontal: 8, paddingVertical: layout.compact ? 4 : 6 }}>
      {choices.map(({ id, name }) => <Pressable key={id} testID={`filter-preset-${id}`} accessibilityRole="button"
        accessibilityLabel={`Filter preset: ${name}`} accessibilityState={{ selected: active === id }} onPress={() => select(id)}
        style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, backgroundColor: active === id ? theme.colors.accent : theme.colors.surface0 }}>
        <Text style={{ fontSize: 12, fontWeight: active === id ? "600" : "400", color: active === id ? theme.colors.accentForeground : theme.colors.foregroundMuted }}>{name}</Text>
      </Pressable>)}
    </View>;
  };
}
