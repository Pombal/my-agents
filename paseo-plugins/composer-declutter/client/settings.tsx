import { useEffect } from "react";
import { Text } from "react-native";
import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { preferences, type Preferences } from "../shared/preferences";

const controls: ReadonlyArray<{ key: keyof Preferences; label: string }> = [
  { key: "hideThinking", label: "Hide thinking effort" },
  { key: "hideMode", label: "Hide access level / mode" },
  { key: "hideFastMode", label: "Hide fast mode" },
  { key: "hideOtherFeatures", label: "Hide other provider feature toggles" },
  { key: "hideDictation", label: "Hide dictation microphone (when idle)" },
  { key: "hideVoice", label: "Hide Voice mode button (when idle)" },
];

export function createSettingsScreen(apply: (values: Preferences) => void) {
  return function ComposerSettings({ theme, layout }: PluginSurfaceProps) {
    const settings = useSettings(preferences);
    const textStyle = { color: theme.colors.foreground };
    useEffect(() => {
      if (settings.status === "ready") apply(settings.values);
    }, [settings.status, settings.status === "ready" ? settings.values : null]);
    if (settings.status === "loading") return <Text style={textStyle}>Loading settings…</Text>;
    if (settings.status !== "ready") {
      return <SettingsSection title="Composer controls">
        <Text accessibilityRole="alert" style={textStyle}>{settings.error}</Text>
        <SettingsAction label="Try again" actionLabel="Reload" onPress={settings.reload} />
        {settings.status === "invalid" ? <SettingsAction label="Restore defaults (all visible)" actionLabel="Reset" onPress={settings.reset} /> : null}
      </SettingsSection>;
    }
    return <SettingsSection title="Composer controls">
      <Text style={textStyle}>Switch ON to hide a control. All switches start OFF. Recording and active Voice mode controls always stay visible.</Text>
      {layout.platform !== "web" ? <Text style={textStyle}>These switches affect web and desktop only, not this phone app.</Text> : null}
      <SettingsCard>
        {controls.map(({ key, label }) => <SettingsSwitch
          key={key}
          label={label}
          value={settings.values[key]}
          disabled={settings.saving}
          onValueChange={(value) => { void settings.save({ ...settings.values, [key]: value }, settings.revision); }}
        />)}
        <SettingsAction label="Restore defaults (all visible)" actionLabel="Reset" disabled={settings.saving} onPress={settings.reset} />
      </SettingsCard>
      {settings.saveError ? <Text accessibilityRole="alert" style={textStyle}>{settings.saveError}</Text> : null}
      <Text style={textStyle}>Changes apply here immediately. Refresh other open web/desktop windows to pick up settings changed elsewhere.</Text>
    </SettingsSection>;
  };
}
