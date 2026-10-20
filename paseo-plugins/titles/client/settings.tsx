import { Text } from "react-native";
import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { settings as definition, type Automatic } from "../shared/settings";

const OPTIONS: { label: string; value: Automatic }[] = [
  { label: "Off", value: "off" },
  { label: "After the first reply", value: "first" },
  { label: "After every reply", value: "every" },
];

const EXPLAIN: Record<Automatic, string> = {
  off: "Titles change only when you retitle a tab.",
  first: "A new tab is named once its conversation has a subject.",
  every: "A new tab is named once its conversation has a subject, and renamed when the subject moves on. One Claude Haiku call per reply.",
};

export function TitlesSettings({ theme }: PluginSurfaceProps) {
  const state = useSettings(definition);
  const muted = { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 };
  if (state.status === "loading") return <Text style={muted}>Loading settings…</Text>;
  if (state.status !== "ready") return <SettingsSection title="Titles">
    <Text accessibilityRole="alert" style={{ color: theme.colors.foreground }}>{state.error}</Text>
    <SettingsAction label="Reload settings" actionLabel="Reload" onPress={state.reload} />
    {state.status === "invalid" ? <SettingsAction label="Restore the default" actionLabel="Reset" onPress={state.reset} /> : null}
  </SettingsSection>;
  return <SettingsSection title="Titles">
    <SettingsCard>
      <SettingsSelect label="Automatic titles" hint={EXPLAIN[state.values.automatic]} value={state.values.automatic} options={OPTIONS}
        disabled={state.saving} onValueChange={automatic => { void state.save({ ...state.values, automatic: automatic as Automatic }, state.revision); }} />
      <SettingsSwitch label="Automatic workspace titles" hint="A new workspace is named once its first tab has a subject, in the style of the project's other workspaces."
        value={state.values.workspaces} disabled={state.saving} onValueChange={workspaces => { void state.save({ ...state.values, workspaces }, state.revision); }} />
    </SettingsCard>
    <Text style={muted}>Names you set by hand are never changed automatically. Retitle (Ctrl+Shift+Alt+T, ⌘K, /retitle) always picks a new title; for the workspace, ⌘K → Retitle workspace or /retitle-workspace.</Text>
    {state.saveError ? <Text accessibilityRole="alert" style={{ color: theme.colors.foreground }}>{state.saveError}</Text> : null}
  </SettingsSection>;
}
