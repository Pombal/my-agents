import { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { usePaseo, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { preferences, type Preferences } from "../shared/preferences";
import { putMapping, type IconStyle, type Mapping } from "../shared/images";
import { providerRows, type ProviderEntry } from "../shared/rows";
import { pickImage } from "./web";

type Theme = PluginSurfaceProps["theme"];
type Providers = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; entries: ProviderEntry[] };

export interface SettingsScreenOptions {
  /** Paint `values` right away (the settings screen's own saves, optimistic or confirmed). */
  apply(values: Preferences, host: string): void;
  /** The providers list fetched last, if any. */
  providers(): ProviderEntry[] | null;
  seeProviders(entries: ProviderEntry[]): void;
  /** The icons this window paints now, if it has read them. */
  values(): Preferences | null;
}

export function createSettingsScreen({ apply, providers: lastProviders, seeProviders, values: lastValues }: SettingsScreenOptions) {
  return function ProviderIconsSettings({ theme, host, layout }: PluginSurfaceProps) {
    const settings = useSettings(preferences);
    const paseo = usePaseo();
    // Rows draw at once from the last list; the fetch below refreshes it quietly.
    const [providers, setProviders] = useState<Providers>(() => {
      const entries = lastProviders();
      return entries ? { status: "ready", entries } : { status: "loading" };
    });
    const [attempt, setAttempt] = useState(0);
    const [busy, setBusy] = useState<string | null>(null);
    // Picker errors carry a message; failed saves show the host's `saveError` on the row that saved.
    const [failure, setFailure] = useState<{ provider: string; message?: string } | null>(null);
    // Mappings shown (and painted) while a save is on its way; dropped once the host answers.
    const [pending, setPending] = useState<Mapping[] | null>(null);
    // Row order frozen while the pointer is over the list, so a row never moves under it.
    const [heldOrder, setHeldOrder] = useState<string[] | null>(null);
    const order = useRef<string[]>([]);
    const muted = { color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18 };
    const canPick = layout.platform === "web";

    useEffect(() => {
      let disposed = false;
      if (attempt > 0) setProviders({ status: "loading" });
      paseo.providers.snapshot().then(
        (result) => {
          const entries = result.entries.map((entry) => ({ id: entry.provider, label: entry.label ?? entry.provider }));
          seeProviders(entries);
          if (!disposed) setProviders({ status: "ready", entries });
        },
        (reason) => {
          if (!disposed) setProviders((current) => current.status === "ready" && attempt === 0
            ? current : { status: "error", error: reason instanceof Error ? reason.message : String(reason) });
        },
      );
      return () => { disposed = true; };
    }, [paseo, attempt]);
    const saved = settings.status === "ready" ? settings.values : null;
    useEffect(() => {
      setPending(null);
      if (saved) apply(saved, host.id);
    }, [saved, host.id]);
    // Until the host's read lands, draw the icons this window already paints, with controls locked.
    const known = settings.status === "loading" ? lastValues() : null;
    if (settings.status === "loading" && !known) return <SettingsSection title="Provider icons"><Text style={muted}>Loading…</Text></SettingsSection>;
    if (settings.status !== "ready" && settings.status !== "loading") {
      return <SettingsSection title="Provider icons">
        <SettingsCard>
          <SettingsRow label="Saved icons could not be read" error={settings.error} />
          <SettingsAction label="Try again" actionLabel="Reload" onPress={() => { void settings.reload(); }} />
          {settings.status === "invalid" ? <SettingsAction label="Discard saved icons" hint="Restores Paseo's default icons for every provider." actionLabel="Reset" onPress={() => { void settings.reset(); }} /> : null}
        </SettingsCard>
      </SettingsSection>;
    }

    const ready = settings.status === "ready";
    const values = ready ? settings.values : known!;
    const revision = ready ? settings.revision : "";
    // Brief locks (loading, an optimistic save in flight) block input without flashing the controls;
    // only the open file picker dims them.
    const dimmed = busy !== null;
    const mappings = pending ?? values.mappings;
    const locked = !ready || busy !== null || settings.saving || pending !== null;
    async function save(provider: string, next: Mapping[]) {
      setPending(next);
      apply({ hostId: host.id, mappings: next }, host.id);
      if (!await settings.save({ hostId: host.id, mappings: next }, revision)) {
        setPending(null);
        apply(values, host.id);
        setFailure({ provider });
      }
    }
    async function choose(provider: string, style: IconStyle) {
      setFailure(null);
      setBusy(provider);
      try {
        const picked = await pickImage();
        if (picked) await save(provider, putMapping(mappings, { provider, style, ...picked }));
      } catch (reason) {
        setFailure({ provider, message: reason instanceof Error ? reason.message : String(reason) });
      } finally { setBusy(null); }
    }
    const sorted = providers.status === "ready" ? providerRows(providers.entries, mappings) : [];
    const rank = new Map((heldOrder ?? []).map((id, index) => [id, index]));
    const rows = heldOrder
      ? sorted.map((row, index) => ({ row, at: rank.get(row.id) ?? heldOrder.length + index })).sort((a, b) => a.at - b.at).map(({ row }) => row)
      : sorted;
    order.current = rows.map((row) => row.id);

    return <SettingsSection title="Provider icons">
      <Text style={muted}>
        {canPick
          ? "Replace the glyph Paseo draws for a provider. Icons are saved on this host and used by every web and desktop window connected to it. Native phone apps keep Paseo's icons."
          : "Icons are picked in the web or desktop app; native phone apps always show Paseo's own icons."}
      </Text>
      <View onPointerEnter={() => setHeldOrder(order.current)} onPointerLeave={() => setHeldOrder(null)}>
      <SettingsCard testID="provider-icons-list">
        {providers.status === "loading" ? <SettingsRow label="Loading providers…" /> : null}
        {providers.status === "error"
          ? <SettingsAction label="Could not load providers" hint={providers.error} actionLabel="Retry" onPress={() => setAttempt((n) => n + 1)} />
          : null}
        {rows.map((row) => {
          const mapping = row.mapping;
          const detail = row.label === row.id ? "" : `${row.id} · `;
          const hint = !row.configured ? `Not configured on this host · ${mapping?.name}`
            : mapping ? `${detail}${mapping.name}` : `${detail}Paseo default`;
          return <SettingsRow key={row.id} testID={`provider-icons-row-${row.id}`} label={row.label} hint={hint}
            error={failure?.provider === row.id ? failure.message ?? settings.saveError ?? "Not saved." : null}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {mapping ? <>
                <Preview mapping={mapping} theme={theme} />
                <Segmented theme={theme} label={`${row.label} icon colors`} disabled={locked} dimmed={dimmed} value={mapping.style}
                  options={[{ value: "original", label: "Color" }, { value: "monochrome", label: "Mono" }]}
                  onChange={(style) => { setFailure(null); void save(row.id, putMapping(mappings, { ...mapping, style })); }} />
              </> : null}
              {row.configured ? <Button theme={theme} disabled={locked || !canPick} dimmed={dimmed || !canPick} accessibilityLabel={`${mapping ? "Replace" : "Choose"} icon for ${row.label}`}
                label={busy === row.id ? "Choosing…" : mapping ? "Replace…" : "Choose…"}
                onPress={() => { void choose(row.id, mapping?.style ?? "original"); }} /> : null}
              {mapping ? <Button theme={theme} disabled={locked} dimmed={dimmed} accessibilityLabel={`Remove custom icon for ${row.label}`} label="Remove"
                onPress={() => { setFailure(null); void save(row.id, mappings.filter((entry) => entry.provider !== row.id)); }} /> : null}
            </View>
          </SettingsRow>;
        })}
      </SettingsCard>
      </View>
      <Text style={muted}>
        SVG, PNG, WebP or JPEG up to 128 KiB. Icons render at 14–16 px, so use a square mark with little padding.
        Color keeps the image as drawn; Mono paints its opaque pixels in Paseo's glyph color, so a transparent-background mark matches the theme.
      </Text>
    </SettingsSection>;
  };
}

/** The icon at its real 16 px size on the current theme and on the opposite one. */
function Preview({ mapping, theme }: { mapping: Mapping; theme: Theme }) {
  const swatches = [
    { name: "current", background: theme.colors.surface1, ink: theme.colors.foregroundMuted },
    { name: "opposite", background: theme.colors.foreground, ink: theme.colors.surface1 },
  ];
  return <View style={{ flexDirection: "row", gap: 4 }}>
    {swatches.map((swatch) => <View key={swatch.name} accessibilityLabel={`Preview on the ${swatch.name} theme`}
      style={{ width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: swatch.background, alignItems: "center", justifyContent: "center" }}>
      <Image source={{ uri: mapping.image }} resizeMode="contain"
        style={{ width: 16, height: 16, ...(mapping.style === "monochrome" ? { tintColor: swatch.ink } : null) }} />
    </View>)}
  </View>;
}

function Button({ theme, label, accessibilityLabel, disabled, dimmed, onPress }: { theme: Theme; label: string; accessibilityLabel: string; disabled?: boolean; dimmed?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={disabled} onPress={onPress}
    // react-native-web adds `hovered` to the pressable state; native platforms never set it.
    style={(state) => ({
      borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, paddingHorizontal: 10, height: 28, justifyContent: "center",
      backgroundColor: theme.colors.surface2, opacity: dimmed ? 0.5 : "hovered" in state && state.hovered && !disabled ? 0.8 : 1,
    })}>
    <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{label}</Text>
  </Pressable>;
}

function Segmented<Value extends string>({ theme, label, value, options, disabled, dimmed, onChange }: {
  theme: Theme; label: string; value: Value; options: readonly { value: Value; label: string }[]; disabled?: boolean; dimmed?: boolean; onChange(value: Value): void;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label}
    style={{ flexDirection: "row", borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, height: 28, padding: 2, opacity: dimmed ? 0.5 : 1 }}>
    {options.map((option) => {
      const active = option.value === value;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: active, disabled }} disabled={disabled || active}
        onPress={() => onChange(option.value)}
        style={{ paddingHorizontal: 8, borderRadius: 4, justifyContent: "center", backgroundColor: active ? theme.colors.surface2 : "transparent" }}>
        <Text style={{ color: active ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: 12 }}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}
