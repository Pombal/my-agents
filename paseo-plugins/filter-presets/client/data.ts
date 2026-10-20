import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Preset, Project } from "../shared/presets";
import { applyWorkspaceUpdate, type WorkspaceRef } from "./web";

// One `project.update` subscription per host, shared by the switcher and the settings screen,
// so one event triggers one refetch instead of one per mounted screen.
const projectSubscriptions = new Map<string, { users: number; off(): void }>();

function retainProjectUpdates(client: PluginClientContext, queryClient: QueryClient, hostId: string): () => void {
  let entry = projectSubscriptions.get(hostId);
  if (!entry) {
    const off = client.paseo.projects.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ["filter-presets-projects", hostId] });
    });
    entry = { users: 0, off };
    projectSubscriptions.set(hostId, entry);
  }
  entry.users++;
  const held = entry;
  return () => {
    if (--held.users > 0) return;
    held.off();
    projectSubscriptions.delete(hostId);
  };
}

/** Projects of the host. Fresh for 30 s (opening settings reuses the sidebar's list); `project.update` refetches at once. */
export function useProjects(client: PluginClientContext, hostId: string) {
  const queryClient = useQueryClient();
  const projects = useQuery({
    queryKey: ["filter-presets-projects", hostId],
    queryFn: async (): Promise<Project[]> => (await client.paseo.projects.list()).projects,
    staleTime: 30_000,
  });
  useEffect(() => retainProjectUpdates(client, queryClient, hostId), [client, queryClient, hostId]);
  return projects;
}

/**
 * Workspace id → project id for every active workspace, kept live by a subscribed list.
 * `workspaces.subscribe` alone never fires: the daemon streams workspace updates only to a subscribed list.
 */
export function useWorkspaceRefs(client: PluginClientContext, hostId: string): WorkspaceRef[] | undefined {
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>();
  useEffect(() => {
    let live = true;
    let release = () => {};
    // Snapshots (first load and every reconnect) can span several pages; later pages are plain fetches.
    async function load(first: { entries: { id: string; projectId: string }[]; pageInfo: { hasMore: boolean; nextCursor?: string | null } }) {
      const refs = first.entries.map(({ id, projectId }) => ({ id, projectId }));
      let page = first.pageInfo;
      while (page.hasMore && page.nextCursor) {
        const next = await client.paseo.workspaces.list({ page: { limit: 200, cursor: page.nextCursor } });
        for (const { id, projectId } of next.entries) refs.push({ id, projectId });
        page = next.pageInfo;
      }
      if (live) setWorkspaces(refs);
    }
    void client.paseo.workspaces.list({ page: { limit: 200 }, subscribe: {} }).then((result) => {
      const { subscription } = result;
      if (!live) { void subscription.release(); return; }
      const off = subscription.subscribe({
        snapshot: (snapshot) => { void load(snapshot); },
        update: (message) => {
          if (message.type !== "workspace_update") return;
          const update = message.payload;
          setWorkspaces((current) => current && applyWorkspaceUpdate(current, update.kind === "remove"
            ? { kind: "remove", id: update.id }
            : { kind: "upsert", workspace: update.workspace }));
        },
      });
      release = () => { off(); void subscription.release(); };
      void load(result);
    }).catch((error: unknown) => console.error("filter-presets: workspace list failed", error));
    return () => { live = false; release(); };
  }, [client, hostId]);
  return workspaces;
}

// Presets being saved, shown everywhere at once (the save is a host round trip of 0.3-0.6 s over the relay).
let pending: { hostId: string; presets: Preset[] } | null = null;
const pendingListeners = new Set<() => void>();

export function setPendingPresets(value: { hostId: string; presets: Preset[] } | null): void {
  pending = value;
  for (const listener of pendingListeners) listener();
}

export function usePendingPresets(hostId: string): Preset[] | undefined {
  const value = useSyncExternalStore((listener) => {
    pendingListeners.add(listener);
    return () => { pendingListeners.delete(listener); };
  }, () => pending);
  return value?.hostId === hostId ? value.presets : undefined;
}
