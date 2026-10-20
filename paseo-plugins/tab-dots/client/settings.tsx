import { useEffect } from "react";
import { Platform } from "react-native";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { type DotAlign, type DotSize, preferences, type Preferences, type ShowMode } from "../shared/preferences";

const SHOW_OPTIONS: { label: string; value: ShowMode }[] = [
  { label: "Unread", value: "unread" },
  { label: "Unread and running", value: "unread-running" },
  { label: "Every tab", value: "all" },
];
const SIZE_OPTIONS: { label: string; value: DotSize }[] = [
  { label: "Regular", value: "regular" },
  { label: "Small", value: "small" },
];
const ALIGN_OPTIONS: { label: string; value: DotAlign }[] = [
  { label: "Right edge", value: "edge" },
  { label: "Steady", value: "steady" },
  { label: "Left", value: "left" },
];
const INFO =
  "One dot per tab in the sidebar's workspace rows, in tab order; sub-agents are left out. " +
  "Green: finished, unread. Red: error. Amber: waiting for permission. Blue, pulsing: running. " +
  "Gray: read. Hover a dot for the tab's title; click it to open that tab. Web and desktop apps only.";

const PHONE_INFO =
  "On phones, an \"Unread\" row at the top of the sidebar shows while any tab waits on you: one dot per such tab " +
  "across all workspaces. Tap it for the list; tap a tab to open it. \"Every tab\" lists unread and running tabs here.";

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
    return <SettingsSection title="Tab dots" info={Platform.OS === "web" ? INFO : PHONE_INFO}>
      <SettingsCard>
        <SettingsSwitch label="Show tab dots" value={current.enabled} disabled={settings.saving}
          error={settings.saveError} onValueChange={(enabled) => save({ enabled })} />
        <SettingsSelect label="Which tabs" hint="Unread: finished, failed or waiting for permission"
          value={current.show} options={SHOW_OPTIONS} disabled={settings.saving || !current.enabled}
          onValueChange={(show) => save({ show })} />
        <SettingsSelect label="Dot size" hint="Regular: 5 px, up to 5 dots · Small: 4 px, up to 8"
          value={current.size} options={SIZE_OPTIONS} disabled={settings.saving || !current.enabled}
          onValueChange={(size) => save({ size })} />
        {Platform.OS === "web" ? <>
          <SettingsSwitch label="Replace the time" hint="Rows with dots hide their last-activity time"
            value={current.replaceTime} disabled={settings.saving || !current.enabled}
            onValueChange={(replaceTime) => save({ replaceTime })} />
          <SettingsSelect label="Dot position" hint="Right edge: where the time was; moves left while the row's menu shows on hover · Steady: right, never moves · Left: right after the title"
            value={current.align} options={ALIGN_OPTIONS} disabled={settings.saving || !current.enabled}
            onValueChange={(align) => save({ align })} />
        </> : null}
      </SettingsCard>
    </SettingsSection>;
  };
}
