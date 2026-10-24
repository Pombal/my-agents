import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsInput, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { folderSettings } from "../shared/settings";
import { fetchOverview } from "./runtime";

/** Folders scanned besides the `.scratch` of Paseo's workspaces, and whether the header pill shows. */
export function SettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(folderSettings);
  const [draft, setDraft] = useState<string | null>(null);
  if (settings.status !== "ready") {
    return <Text style={{ color: theme.colors.foregroundMuted, padding: 16 }}>{settings.status === "loading" ? "Loading…" : settings.error}</Text>;
  }
  const { extraFolders, showHeaderButton } = settings.values;
  const saved = extraFolders.join(", ");
  const value = draft ?? saved;
  const folders = value
    .split(/[,\n]/)
    .map((folder) => folder.trim())
    .filter(Boolean);
  /** Saves the whole object (a missing field would fall back to its default), then refreshes the pills. */
  const save = (values: Partial<typeof settings.values>) =>
    settings.save({ ...settings.values, ...values }, settings.revision).then((ok) => {
      if (ok) void fetchOverview().catch(() => undefined);
      return ok;
    });
  return (
    <View style={{ gap: 16 }}>
      <SettingsSection title="Header">
        <SettingsSwitch
          label="Show header button"
          hint="The effort pill in each workspace's header. The Efforts tab and the sidebar row stay either way."
          value={showHeaderButton}
          disabled={settings.saving}
          onValueChange={(value) => void save({ showHeaderButton: value })}
        />
      </SettingsSection>
      <SettingsSection
        title="Folders"
        info="Efforts are the folders in .scratch. The .scratch of every Paseo workspace is read (symlinks resolved, so worktrees share the same efforts). __share__ copies and configured fixture folders are skipped unless listed here."
      >
        <SettingsInput
          label="Extra folders"
          hint="Comma-separated. A .scratch folder or a folder that holds one, e.g. ~/workspace/acme-app"
          initialValue={saved}
          placeholder="~/workspace/acme-app"
          onChangeText={setDraft}
          error={settings.saveError}
        />
        <SettingsAction
          label={draft !== null && value !== saved ? "Unsaved changes" : "Saved"}
          actionLabel={settings.saving ? "Saving…" : "Save"}
          disabled={settings.saving || draft === null || value === saved}
          onPress={() => void save({ extraFolders: folders }).then((ok) => ok && setDraft(null))}
        />
      </SettingsSection>
    </View>
  );
}
