import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { preferences, presetsSchema } from "../shared/presets";

export function PresetSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(preferences);
  const [draft, setDraft] = useState<{ text: string; revision: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (settings.status === "ready" && draft === null) {
      setDraft({ text: JSON.stringify(settings.values.presets, null, 2), revision: settings.revision });
    }
  }, [settings, draft]);
  async function save() {
    if (!draft) return;
    try {
      const presets = presetsSchema.parse(JSON.parse(draft.text));
      setError("");
      if (await settings.save({ presets }, draft.revision)) setDraft(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <View style={{ gap: 12, paddingVertical: 16 }}>
    <Text style={{ color: theme.colors.foreground }}>Edit the JSON array of presets. Rules within a preset are alternatives: any match includes the project. All and Other are automatic.</Text>
    <Text style={{ color: theme.colors.foregroundMuted }}>Rule types: folderPrefix, pathGlob, pathRegex, remoteGlob. Paths are absolute daemon paths. See OVERVIEW.md for examples and pattern syntax.</Text>
    {draft && <TextInput testID="filter-presets-json" accessibilityLabel="Preset definitions JSON" multiline value={draft.text}
      onChangeText={(text) => setDraft({ ...draft, text })} autoCapitalize="none" autoCorrect={false}
      style={{ minHeight: 320, padding: 12, borderWidth: 1, borderColor: theme.colors.foregroundMuted, borderRadius: 6, color: theme.colors.foreground, backgroundColor: theme.colors.surface0, fontFamily: "monospace", textAlignVertical: "top" }} />}
    <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.foregroundMuted }}>{error || (settings.saveError ? String(settings.saveError) : settings.status === "error" || settings.status === "invalid" ? String(settings.error) : settings.saving ? "Saving…" : "")}</Text>
    <View style={{ flexDirection: "row", gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Save preset definitions" disabled={!draft || settings.saving} onPress={() => void save()}
        style={{ padding: 10, borderRadius: 6, backgroundColor: theme.colors.accent }}>
        <Text style={{ color: theme.colors.accentForeground }}>Save definitions</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={async () => { await settings.reload(); setDraft(null); setError(""); }} style={{ padding: 10 }}>
        <Text style={{ color: theme.colors.foreground }}>Discard and reload</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={async () => { if (await settings.reset()) { setDraft(null); setError(""); } }} style={{ padding: 10 }}>
        <Text style={{ color: theme.colors.foreground }}>Reset to Nilo</Text>
      </Pressable>
    </View>
  </View>;
}
