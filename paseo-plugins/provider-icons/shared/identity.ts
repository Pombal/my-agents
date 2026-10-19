interface TabTarget {
  kind?: string;
  agentId?: string;
  parentAgentId?: string;
  setup?: { provider?: string };
}

export interface IconScope {
  provider?: string;
  serverId?: string | null;
  size?: number;
  iconKey?: string;
  def?: { id: string };
  agent?: { id?: string; provider?: string };
  entry?: { providerId?: string };
  row?: { provider?: string };
  tab?: { target?: TabTarget };
  item?: { target?: TabTarget; provider?: string };
  testID?: string;
  accessibilityLabel?: string;
  label?: string;
  leadingSlot?: unknown;
  selectedProvider?: string;
}

/** Nearest semantic owner wins; labels are accepted only in explicit provider-filter controls. */
export function resolveProvider(scopes: readonly IconScope[], agents: ReadonlyMap<string, string>, labels: ReadonlyMap<string, string>): string | undefined {
  for (const props of scopes) {
    if (typeof props.testID === "string") {
      const command = /^command-center-model-[^:]+:([^:]+):/.exec(props.testID);
      if (command) return command[1];
      if (props.testID.startsWith("provider-catalog-tile-")) return props.testID.slice("provider-catalog-tile-".length);
      if (props.testID === "import-session-filter-trigger" && props.accessibilityLabel?.startsWith("Filter: ")) return labels.get(props.accessibilityLabel.slice("Filter: ".length));
    }
    if (props.leadingSlot && props.label && labels.has(props.label)) return labels.get(props.label);
    if (typeof props.provider === "string") return props.provider;
    if (typeof props.iconKey === "string") return props.iconKey;
    if (props.def?.id) return props.def.id;
    if (props.agent?.provider) return props.agent.provider;
    if (props.entry?.providerId) return props.entry.providerId;
    if (props.row?.provider) return props.row.provider;
    const target = props.tab?.target ?? props.item?.target;
    if (target?.kind === "agent" && target.agentId) return agents.get(target.agentId);
    if (target?.kind === "provider_subagent" && target.parentAgentId) return agents.get(target.parentAgentId);
    if (target?.kind === "draft" && target.setup?.provider) return target.setup.provider;
    if (props.selectedProvider) return props.selectedProvider;
  }
  return undefined;
}

export function resolveHost(scopes: readonly IconScope[], pathname: string): string | undefined {
  const owner = scopes.find((scope) => typeof scope.serverId === "string" && scope.serverId.length > 0);
  if (owner?.serverId) return owner.serverId;
  const route = /^\/(?:h|settings\/hosts)\/([^/]+)(?:\/|$)/.exec(pathname);
  return route ? decodeURIComponent(route[1]) : undefined;
}
