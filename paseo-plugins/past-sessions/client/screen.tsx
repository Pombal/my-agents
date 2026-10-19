import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { FlatList, Icon, Modal } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ScopeSchema, type Scope } from "../shared/rpc";
import { PastSessionsList } from "./past-sessions-list";

/** What the sidebar row reopens: the screen's last folder and scope, until the app reloads. */
export const lastScreenParams: { workspaceId?: string; scope?: Scope } = {};

export function PastSessionsScreen({ theme, layout, params, navigation }: PluginScreenProps) {
  const paseo = usePaseo();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string | undefined>(params.workspaceId);
  const [scope, setScope] = useState<Scope>(ScopeSchema.catch("folder").parse(params.scope));
  const workspaces = useQuery({
    queryKey: ["workspaces-by-activity"],
    queryFn: async () =>
      (
        await paseo.workspaces.list({
          sort: [{ key: "activity_at", direction: "desc" }],
          page: { limit: 200 },
        })
      ).entries,
  });
  const entries = workspaces.data ?? [];
  // Without an explicit choice, show the most recently active workspace.
  const workspace = entries.find((candidate) => candidate.id === chosenId) ?? entries[0];
  if (workspace) {
    lastScreenParams.workspaceId = workspace.id;
    lastScreenParams.scope = scope;
  }
  const muted = theme.colors.foregroundMuted;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <Pressable
        accessibilityRole="button"
        testID="past-sessions-folder-picker"
        onPress={() => setPickerOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: layout.compact ? 12 : 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Icon name="Folder" size={16} color={muted} />
        <Text style={{ color: theme.colors.foreground, fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
          {workspace ? `${workspace.projectDisplayName} › ${workspace.name}` : "Loading workspaces…"}
        </Text>
        <Text style={{ color: muted, fontSize: 12 }}>Change</Text>
        <Icon name="ChevronDown" size={14} color={muted} />
      </Pressable>
      {workspace ? (
        <PastSessionsList
          workspaceId={workspace.id}
          scope={scope}
          onScopeChange={setScope}
          theme={theme}
          compact={layout.compact}
          navigation={navigation}
        />
      ) : workspaces.isError ? (
        <Text style={{ color: theme.colors.statusDanger, padding: 16 }}>{String(workspaces.error)}</Text>
      ) : null}
      <Modal
        title="Choose a workspace"
        icon={<Icon name="Folder" size={18} color={theme.colors.foreground} />}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
      >
        <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
          <FlatList
            style={{ flex: 1, minHeight: 0 }}
            data={entries}
            keyExtractor={(candidate) => candidate.id}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setChosenId(item.id);
                  setPickerOpen(false);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  gap: 2,
                  backgroundColor:
                    item.id === workspace?.id || pressed ? theme.colors.surface1 : "transparent",
                })}
              >
                <Text style={{ color: theme.colors.foreground, fontSize: 14 }} numberOfLines={1}>
                  {item.projectDisplayName} › {item.name}
                </Text>
                <Text style={{ color: muted, fontSize: 12 }} numberOfLines={1}>
                  {item.workspaceDirectory ?? item.projectRootPath}
                </Text>
              </Pressable>
            )}
          />
        </Modal.Content>
      </Modal>
    </View>
  );
}
