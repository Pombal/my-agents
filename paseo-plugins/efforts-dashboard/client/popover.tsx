import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { Text, View } from "react-native";
import { useDetail, useOverview } from "./data";
import { EffortView } from "./effort-view";
import { Bar, colorsOf, Dot, Glyph, LABEL, SMALL, Tag, WsChip, type Palette } from "./marks";
import { findEffort, workspacesOf } from "./model";
import { bindOrToast, openAllEfforts, openPanel } from "./runtime";
import { setViewState, viewKey, type Page } from "./state";
import { CountsLine, RowButton, styles as ui } from "./ui";
import { SuggestionCard, UnboundView } from "./unbound-view";

function Item(props: { c: Palette; icon?: string; label: string; right?: React.ReactNode; muted?: boolean; hot?: boolean; onPress(): void; lead?: React.ReactNode }) {
  const { c } = props;
  return (
    <RowButton c={c} hot={props.hot} onPress={props.onPress} style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 28, paddingHorizontal: 12 }}>
      {props.lead ?? (props.icon ? <Icon name={props.icon} size={13} color={c.muted} /> : null)}
      <Text numberOfLines={1} style={{ fontSize: 13, color: props.muted ? c.muted : c.fg, flexShrink: 1 }}>
        {props.label}
      </Text>
      <View style={ui.grow} />
      {props.right}
    </RowButton>
  );
}

/**
 * Header pill popover. Wide layouts: the panel's head lines, path, Not committed, next ticket and
 * the switch list (H1 option B). Phones get the whole effort as a sheet (P3), which is also what
 * the composer pill opens.
 */
export function EffortPopover({ workspaceId, theme, layout, close }: PluginButtonContentProps) {
  const c = colorsOf(theme);
  const toast = useToast();
  const overview = useOverview(true);
  const workspace = overview.data?.workspaces.find((candidate) => candidate.id === workspaceId);
  const binding = workspace?.binding?.kind === "effort" ? workspace.binding : null;
  const effort = binding ?? null;
  const detail = useDetail(layout.compact ? null : effort, true);
  const go = (page?: Page) => {
    if (effort && page) setViewState(viewKey(workspaceId, effort), { page });
    close();
    openPanel(workspaceId);
  };

  if (layout.compact) {
    return (
      <View style={{ height: 640, maxHeight: "100%" }}>
        {effort ? (
          <EffortView theme={theme} compact effort={effort} workspaceId={workspaceId} workspaceName={workspace?.name ?? null} mode="sheet" />
        ) : (
          <UnboundView theme={theme} compact workspaceId={workspaceId} mode="unbound" />
        )}
      </View>
    );
  }
  if (!overview.data || !workspace) return <Text style={{ ...SMALL, color: c.muted, padding: 12 }}>Loading…</Text>;

  if (!effort) {
    const suggestion = workspace.suggestion ? findEffort(overview.data, workspace.suggestion.root, workspace.suggestion.slug) : null;
    if (!suggestion || !workspace.suggestion) return <Text style={{ ...SMALL, color: c.muted, padding: 12 }}>No effort suggested.</Text>;
    return (
      <View style={{ width: 300, paddingVertical: 10 }}>
        <SuggestionCard
          c={c}
          flat
          effort={suggestion}
          reason={workspace.suggestion.reason}
          onBind={() => bindOrToast(toast, workspaceId, { kind: "effort", root: suggestion.root, slug: suggestion.slug })}
          onNew={() => go()}
          onNone={() => {
            bindOrToast(toast, workspaceId, { kind: "none" });
            close();
          }}
        />
      </View>
    );
  }

  const summary = findEffort(overview.data, effort.root, effort.slug);
  const data = detail.data;
  const uncommitted = data?.uncommitted?.rows.length ?? 0;
  const next = data?.tickets.find((ticket) => ticket.num === summary?.next?.num);
  return (
    <ScrollView style={{ width: 340, maxHeight: 520 }} contentContainerStyle={{ paddingVertical: 10 }}>
      <View style={{ paddingHorizontal: 12 }}>
        <View style={[ui.line, { gap: 6 }]}>
          <Icon name="Map" size={14} color={c.muted} />
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: c.fg, flexShrink: 1 }}>
            {effort.slug}
          </Text>
          {summary?.mapStatus ? <Tag c={c} text={summary.mapStatus} /> : null}
        </View>
        <Text numberOfLines={1} style={{ ...SMALL, color: c.muted, opacity: 0.8, marginTop: 3 }}>
          {data?.displayPath ?? `.scratch/${effort.slug}`}
        </Text>
        {summary ? <CountsLine c={c} counts={summary.counts} /> : null}
        {uncommitted ? (
          <View style={[ui.line, { gap: 6 }]}>
            <Dot c={c} />
            <Text style={{ ...SMALL, color: c.muted }}>Not committed · {uncommitted}</Text>
          </View>
        ) : null}
      </View>
      {next ? (
        <View style={{ marginTop: 6 }}>
          <Item c={c} hot lead={<Glyph state="ready" c={c} />} label={`${next.num} ${next.title}`} right={<Text style={{ ...SMALL, color: c.muted }}>next</Text>} onPress={() => go({ kind: "ticket", rel: next.rel })} />
        </View>
      ) : null}
      <Item c={c} icon="PanelRight" label="Open Efforts panel" onPress={() => go()} />
      <View style={{ marginTop: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: c.border }}>
        <Text style={{ ...LABEL, color: c.muted, paddingHorizontal: 12, paddingVertical: 3 }}>Switch this workspace to</Text>
        {(data?.leansOn ?? []).map((related) => {
          const chip = overview.data ? workspacesOf(overview.data, related).bound[0] : undefined;
          return (
            <Item
              key={related.slug}
              c={c}
              lead={<Bar done={related.counts.done} total={related.counts.total} c={c} />}
              label={related.slug}
              right={chip ? <WsChip c={c} name={chip.name} /> : null}
              onPress={() => {
                bindOrToast(toast, workspaceId, { kind: "effort", root: related.root, slug: related.slug });
                close();
              }}
            />
          );
        })}
        <Item c={c} icon="Search" muted label="Other effort…" onPress={() => go({ kind: "switch" })} />
      </View>
      <View style={{ marginTop: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: c.border }}>
        <Item c={c} icon="LayoutGrid" label="All efforts" onPress={() => { close(); openAllEfforts(workspaceId, summary?.key); }} />
        <Item
          c={c}
          icon="Unlink"
          muted
          label="Unbind"
          onPress={() => {
            bindOrToast(toast, workspaceId, { kind: "clear" });
            close();
          }}
        />
      </View>
      {detail.isPending ? <Text style={{ ...LABEL, color: c.muted, paddingHorizontal: 12 }}>Reading the effort…</Text> : null}
    </ScrollView>
  );
}
