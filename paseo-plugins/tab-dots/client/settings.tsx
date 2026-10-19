import { useEffect } from "react";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { type DotSize, preferences, type Preferences, type ShowMode } from "../shared/preferences";

const SHOW_OPTIONS: { label: string; value: ShowMode }[] = [
  { label: "Unread", value: "unread" },
  { label: "Unread and running", value: "unread-running" },
  { label: "Every tab", value: "all" },
];
const SIZE_OPTIONS: { label: string; value: DotSize }[] = [
  { label: "Regular", value: "regular" },
  { label: "Small", value: "small" },
];

const INFO =
  "One dot per tab in the sidebar's workspace rows, in tab order; sub-agents are left out. " +
  "Green: finished, unread. Red: error. Amber: waiting for permission. Blue, pulsing: running. " +
  "Gray: read. Hover a dot for the tab's title. Web and desktop apps only.";

export function createSettingsScreen(apply: (values: Preferences) => void) {
  return function TabDotsSettings() {
    const settings = useSettings(preferences);
    const values = settings.status === "ready" ? settings.values : null;
    useEffect(() => { if (values) apply(values); }, [values]);

    if (settings.status === "loading") {
      return <SettingsSection title="Tab dots"><SettingsCard><SettingsRow label="Loading..." /></SettingsCard></SettingsSection>;
    }
    if (settings.status === "error") {
      return <SettingsSection title="Tab dots"><SettingsCard>
        <SettingsAction label="Unable to load settings" hint={settings.error} actionLabel="Retry" onPress={settings.reload} />
      </SettingsCard></SettingsSection>;
    }
    if (settings.status === "invalid") {
      return <SettingsSection title="Tab dots"><SettingsCard>
        <SettingsAction label="Saved settings are unreadable" hint="Reset restores the defaults" actionLabel="Reset"
          disabled={settings.saving} onPress={settings.reset} />
      </SettingsCard></SettingsSection>;
    }
    const current = settings.values;
    const save = (patch: Partial<Preferences>) => void settings.save({ ...current, ...patch }, settings.revision);
    return <SettingsSection title="Tab dots" info={INFO}>
      <SettingsCard>
        <SettingsSwitch label="Show tab dots" value={current.enabled} disabled={settings.saving}
          error={settings.saveError} onValueChange={(enabled) => save({ enabled })} />
        <SettingsSelect label="Which tabs" hint="Unread: finished, failed or waiting for permission"
          value={current.show} options={SHOW_OPTIONS} disabled={settings.saving || !current.enabled}
          onValueChange={(show) => save({ show })} />
        <SettingsSelect label="Dot size" hint="Regular: 5 px, up to 5 dots · Small: 4 px, up to 8"
          value={current.size} options={SIZE_OPTIONS} disabled={settings.saving || !current.enabled}
          onValueChange={(size) => save({ size })} />
        <SettingsSwitch label="Replace the time" hint="Rows with dots hide their last-activity time"
          value={current.replaceTime} disabled={settings.saving || !current.enabled}
          onValueChange={(replaceTime) => save({ replaceTime })} />
      </SettingsCard>
    </SettingsSection>;
  };
}
