import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsInput, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { folderSettings } from "../shared/settings";

/** One setting: folders scanned besides the `.scratch` of Paseo's workspaces. */
export function SettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(folderSettings);
  const [draft, setDraft] = useState<string | null>(null);
  if (settings.status !== "ready") {
    return <Text style={{ color: theme.colors.foregroundMuted, padding: 16 }}>{settings.status === "loading" ? "Loading…" : settings.error}</Text>;
  }
  const saved = settings.values.extraFolders.join(", ");
  const value = draft ?? saved;
  const folders = value
    .split(/[,\n]/)
    .map((folder) => folder.trim())
    .filter(Boolean);
  return (
    <View style={{ gap: 16 }}>
      <SettingsSection
        title="Folders"
        info="Efforts are the folders in .scratch. The .scratch of every Paseo workspace is read (symlinks resolved, so nilo's worktrees count as nilo-wayfinder). __share__ copies and ~/tmp-archive fixtures are skipped unless listed here."
      >
        <SettingsInput
          label="Extra folders"
          hint="Comma-separated. A .scratch folder or a folder that holds one, e.g. ~/workspace/drimgar-game"
          initialValue={saved}
          placeholder="~/workspace/drimgar-game"
          onChangeText={setDraft}
          error={settings.saveError}
        />
        <SettingsAction
          label={draft !== null && value !== saved ? "Unsaved changes" : "Saved"}
          actionLabel={settings.saving ? "Saving…" : "Save"}
          disabled={settings.saving || draft === null || value === saved}
          onPress={() => void settings.save({ extraFolders: folders }, settings.revision).then((ok) => ok && setDraft(null))}
        />
      </SettingsSection>
    </View>
  );
}
