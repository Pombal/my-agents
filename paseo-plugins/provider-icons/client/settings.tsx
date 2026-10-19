import { useEffect, useState } from "react";
import { Image, Text } from "react-native";
import { usePaseo, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { preferences, type Preferences } from "../shared/preferences";
import { putMapping } from "../shared/images";
import { pickImage } from "./web";

export function createSettingsScreen(apply: (values: Preferences, host: string) => void) {
  return function ProviderIconsSettings({ theme, host, layout }: PluginSurfaceProps) {
    const settings = useSettings(preferences);
    const paseo = usePaseo();
    const [providers, setProviders] = useState<Array<{ label: string; value: string }>>([]);
    const [provider, setProvider] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const textStyle = { color: theme.colors.foreground };
    useEffect(() => {
      let disposed = false;
      void paseo.providers.snapshot().then((result) => {
        if (disposed) return;
        const options = result.entries.map((entry) => ({ label: `${entry.label ?? entry.provider} (${entry.provider})`, value: entry.provider }));
        setProviders(options);
        setProvider(options[0]?.value ?? "");
      }).catch((reason) => { if (!disposed) setError(String(reason)); });
      return () => { disposed = true; };
    }, [paseo]);
    useEffect(() => {
      if (settings.status === "ready") apply(settings.values, host.id);
    }, [settings.status, settings.status === "ready" ? settings.values : null, host.id]);
    if (settings.status === "loading") return <Text style={textStyle}>Loading provider icons…</Text>;
    if (settings.status !== "ready") return <SettingsSection title="Provider icons">
      <Text style={textStyle} accessibilityRole="alert">{settings.error}</Text>
      <SettingsAction label="Reload settings" actionLabel="Reload" onPress={settings.reload} />
      {settings.status === "invalid" ? <SettingsAction label="Remove all mappings" actionLabel="Reset" onPress={settings.reset} /> : null}
    </SettingsSection>;
    async function chooseImage() {
      setError("");
      setBusy(true);
      try {
        const selected = await pickImage();
        if (selected) await settings.save({ hostId: host.id, mappings: putMapping(settings.values.mappings, { provider, ...selected }) }, settings.revision);
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
      finally { setBusy(false); }
    }
    return <SettingsSection title="Provider icons">
      <Text style={textStyle}>Give any provider a custom image. Changes are saved on {host.label} and shared by its web/desktop clients.</Text>
      {layout.platform !== "web" ? <Text style={textStyle}>Native phone apps cannot replace Paseo’s glyphs. Choose and preview images in the web or desktop app.</Text> : null}
      <SettingsCard>
        <SettingsSelect label="Provider" value={provider} options={providers} disabled={busy || settings.saving} onValueChange={setProvider} />
        <SettingsAction label="Image" hint="SVG, PNG, WebP or JPEG · up to 128 KiB · 4096 × 4096 pixels" actionLabel="Choose image…" onPress={chooseImage} disabled={!provider || busy || settings.saving || layout.platform !== "web"} />
      </SettingsCard>
      <Text style={textStyle}>{settings.values.mappings.length ? "Custom icons" : "No mappings. Paseo’s default icons are in use."}</Text>
      {settings.values.mappings.map((mapping) => <SettingsCard key={mapping.provider}>
        <SettingsRow label={providers.find((entry) => entry.value === mapping.provider)?.label ?? mapping.provider} hint={mapping.name}>
          <Image source={{ uri: mapping.image }} style={{ width: 32, height: 32 }} resizeMode="contain" accessibilityLabel={`${mapping.provider} custom icon preview`} />
        </SettingsRow>
        <SettingsAction label={`Remove ${mapping.provider} mapping`} hint="Restores Paseo’s default icon immediately." actionLabel="Remove" disabled={settings.saving || busy} onPress={() => { void settings.save({ hostId: host.id, mappings: settings.values.mappings.filter((entry) => entry.provider !== mapping.provider) }, settings.revision); }} />
      </SettingsCard>)}
      {error || settings.saveError ? <Text style={textStyle} accessibilityRole="alert">{error || settings.saveError}</Text> : null}
      <Text style={textStyle}>Transparent, square images work best. Re-choose an image to replace a mapping. Refresh other open web/desktop windows to pick up changes saved here.</Text>
    </SettingsSection>;
  };
}
